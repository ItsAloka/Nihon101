import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { publicPostCard } from '../db/queries/posts';
import { listTrending, countTrending, trendingTop } from '../db/queries/trending';

const app = new Hono<AppEnv>();

// Public trending list — momentum-ranked, cron-precomputed. SSR + crawlable.
// ?limit (default 12, max 50), ?page paginates. Page 0 within the top-20 is
// served from the shared hot-cache (KV → memory) so it does zero Postgres; deeper
// pages fall to the indexed DB scan.
app.get('/', async (c) => {
  const db = getDb(c);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 12));
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const total = await countTrending(db);
  const cached = page === 0 && limit <= 20 ? await trendingTop(db, { limit, kv: c.env.TRENDING_KV }) : null;
  const rows = cached ?? (await listTrending(db, limit, page * limit));
  return c.json({ posts: rows.map(publicPostCard), total });
});

export default app;
