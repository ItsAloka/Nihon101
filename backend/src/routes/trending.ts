import { Hono } from 'hono';
import { getDbCached } from '../db/client';
import type { AppEnv } from '../types';
import { publicPostCard } from '../db/queries/posts';
import { listTrending, countTrending } from '../db/queries/trending';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

// Public trending list — momentum-ranked, cron-precomputed. SSR + crawlable.
// ?limit (default 12, max 50), ?page paginates. This is the COMPLETE ranked
// listing — uncapped, consistent across pages (no dupes, no gaps), so totalPages =
// ceil(total/limit) is exact. The author-diversity cap lives on the compact home
// hot-widget (trendingTop), not here, so the full page never shows empty tail pages.
app.get('/', limits.feed, async (c) => {
  const db = getDbCached(c); // cron-precomputed shared list — content-only
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 12));
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const categoryId = c.req.query('cat') || undefined; // "hot in this category"; omitted = global
  const total = await countTrending(db, categoryId);
  const rows = await listTrending(db, limit, page * limit, categoryId);
  return c.json({ posts: rows.map(publicPostCard), total });
});

export default app;
