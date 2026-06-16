import { Hono, type Context } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { listCategories, createCategory, publicCategory } from '../db/queries/categories';

const app = new Hono<AppEnv>();
const db = (c: Context<AppEnv>) => getDb(c);

// Public list — categories power the composer picker and category pages.
app.get('/', limits.publicRead, async (c) => {
  const rows = await listCategories(db(c));
  return c.json({ categories: rows.map(publicCategory) });
});

// Create a user category (auth). Label can come in either/both locales.
app.post('/', requireAuth, limits.category, async (c) => {
  const body = await c.req.json().catch(() => null);
  const labelEn = String(body?.labelEn ?? body?.label ?? '').trim();
  const labelJa = String(body?.labelJa ?? body?.label ?? '').trim();
  if (!labelEn && !labelJa) return c.json({ error: 'missing_label' }, 400);

  const cat = await createCategory(db(c), {
    labelEn: labelEn || labelJa,
    labelJa: labelJa || labelEn,
    kanji: String(body?.kanji ?? '').slice(0, 2),
    tint: body?.tint ? String(body.tint) : undefined,
    createdBy: c.var.user!.id,
  });
  return c.json({ category: publicCategory(cat) }, 201);
});

export default app;
