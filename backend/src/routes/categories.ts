import { Hono, type Context } from 'hono';
import { getDb, getDbCached } from '../db/client';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { listCategories, createCategory, publicCategory } from '../db/queries/categories';
import { suggestCategory, type Locale } from '../lib/openai';
import { overAiQuota } from '../lib/aiQuota';

const hasJa = (s: string) => /[぀-ヿ一-鿿]/.test(s);

const app = new Hono<AppEnv>();
const db = (c: Context<AppEnv>) => getDb(c);

// Public list — categories power the composer picker and category pages.
// Pure shared content on a hot path → the caching handle.
app.get('/', limits.publicRead, async (c) => {
  const rows = await listCategories(getDbCached(c));
  return c.json({ categories: rows.map(publicCategory) });
});

// Create a user category (auth). Label can come in either/both locales.
app.post('/', requireAuth, limits.category, async (c) => {
  const body = await c.req.json().catch(() => null);
  const rawEn = String(body?.labelEn ?? body?.label ?? '').trim();
  const rawJa = String(body?.labelJa ?? body?.label ?? '').trim();
  if (!rawEn && !rawJa) return c.json({ error: 'missing_label' }, 400);

  let labelEn = rawEn;
  let labelJa = rawJa;
  let kanji = String(body?.kanji ?? '').trim();
  // Keep only a real kanji glyph (the chip is one Han character — never Latin/kana).
  kanji = ([...kanji].find((ch) => /\p{Script=Han}/u.test(ch)) ?? '');

  // Auto-fill the missing locale + a single kanji via OpenAI. Fires when the author
  // gave one label (the inline picker sends just the site-language label) or when no
  // kanji was supplied. Best-effort: on any failure we fall back to the raw labels.
  const distinctLabels = !!rawEn && !!rawJa && rawEn !== rawJa;
  const wantAi = !!c.env.OPENAI_API_KEY && (!distinctLabels || !kanji);
  if (wantAi && !(await overAiQuota(c, c.var.user!.id))) {
    const seed = rawJa && !rawEn ? rawJa : rawEn || rawJa;
    const from: Locale = hasJa(seed) ? 'ja' : 'en';
    try {
      const s = await suggestCategory(c.env.OPENAI_API_KEY!, seed, from);
      if (!distinctLabels) { labelEn = s.labelEn; labelJa = s.labelJa; }
      if (!kanji) kanji = s.kanji;
    } catch { /* fall back to raw labels below */ }
  }

  const cat = await createCategory(db(c), {
    labelEn: labelEn || labelJa,
    labelJa: labelJa || labelEn,
    kanji, // '' if AI was unavailable — never a wrong Latin glyph
    tint: body?.tint ? String(body.tint) : undefined,
    createdBy: c.var.user!.id,
  });
  return c.json({ category: publicCategory(cat) }, 201);
});

export default app;
