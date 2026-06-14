import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { publicPostCard } from '../db/queries/posts';
import { listTrending, countTrending } from '../db/queries/trending';

const app = new Hono<AppEnv>();

// Public trending list — ranked by the cron-computed trend_score. SSR + crawlable.
// ?limit (default 12, max 50), ?page paginates.
app.get('/', async (c) => {
  const db = getDb(c);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 12));
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const [rows, total] = await Promise.all([
    listTrending(db, limit, page * limit),
    countTrending(db),
  ]);
  return c.json({ posts: rows.map(publicPostCard), total });
});

export default app;
