import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { listCategories, getOrCreateCategory, slugify } from '../db/queries/categories';

const app = new Hono<AppEnv>();

// Public: all categories, busiest first (drives navbar + "Browse by world").
app.get('/', async (c) => {
  return c.json({ categories: await listCategories(c.var.db) });
});

// Create a custom category (or return the existing one with that slug).
app.post('/', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const label = String(body?.label ?? '').trim();
  if (label.length < 2 || label.length > 30 || !slugify(label))
    return c.json({ error: 'invalid_label' }, 400);

  const category = await getOrCreateCategory(c.var.db, label, c.var.user.id);
  return c.json({ category }, 201);
});

export default app;
