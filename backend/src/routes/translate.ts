import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { translateFields, type Locale, type TranslateFields } from '../lib/openai';

const app = new Hono<AppEnv>();
const LOCALES: Locale[] = ['en', 'ja'];

/** Translate editor fields between locales via ChatGPT (auth-only — it costs us
 * tokens). Body: { to: 'en'|'ja', fields: { title?, excerpt?, body? } }. */
app.post('/', requireAuth, limits.translate, async (c) => {
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'translate_unconfigured' }, 503);

  const body = await c.req.json().catch(() => null);
  const to = body?.to as Locale;
  if (!LOCALES.includes(to)) return c.json({ error: 'bad_target' }, 400);

  const src = (body?.fields ?? {}) as TranslateFields;
  const fields: TranslateFields = {};
  if (typeof src.title === 'string' && src.title.trim()) fields.title = src.title;
  if (typeof src.excerpt === 'string' && src.excerpt.trim()) fields.excerpt = src.excerpt;
  if (typeof src.body === 'string' && src.body.trim()) fields.body = src.body;
  if (!Object.keys(fields).length) return c.json({ error: 'nothing_to_translate' }, 400);

  try {
    const out = await translateFields(c.env.OPENAI_API_KEY, to, fields);
    return c.json({ fields: out });
  } catch (e) {
    return c.json({ error: 'translate_failed', detail: String((e as Error).message) }, 502);
  }
});

export default app;
