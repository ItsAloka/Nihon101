import { Hono } from 'hono';
import { getDbCached } from '../db/client';
import type { AppEnv } from '../types';
import { listRecentPosts, publicPostCard, type PostCardRow } from '../db/queries/posts';
import { listCategories, publicCategory } from '../db/queries/categories';
import { listTopAuthors } from '../db/queries/users';
import { listFeatured } from '../db/queries/admin';
import { trendingTop } from '../db/queries/trending';
import { getWeather, recomputeWeatherCache } from '../lib/weather';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

// Public aggregate feed for the SSR home page — one request, one connection.
//   hero    = 3  (the rotating carousel — top-3 TRENDING, NOT admin-curated)
//   feature = 1  (the secondary feature card — the blue "ALSO FEATURED" box)
//   picks   = 3  (the editor's reading list)
//   recent  = 8  (the grid)
// The hero is the shared top-3 trending (same momentum list as /trending) — admins
// can't pin it. The ONLY admin-curated slot is `feature` (featured_slots); whatever
// the admin pins fills it, else recency fills in. picks + grid are plain recency,
// minus anything already shown above.
app.get('/', limits.feed, async (c) => {
  const d = getDbCached(c); // whole aggregate is shared content, same for every visitor
  const [featured, heroTop, postRows, cats, topAuthors, weather] = await Promise.all([
    listFeatured(d),
    trendingTop(d, { limit: 3, kv: c.env.TRENDING_KV }),
    listRecentPosts(d, 24),
    listCategories(d),
    listTopAuthors(d, 15),
    getWeather(c.env.TRENDING_KV),
  ]);
  // Cold KV (cron hasn't baked weather yet) → kick a background refresh.
  if (weather.length === 0) c.executionCtx.waitUntil(recomputeWeatherCache(c.env.TRENDING_KV));

  const recency = postRows.map(publicPostCard);
  const used = new Set<string>();
  // Curated cards first (marked used), then recency tops it up to `n`, skipping dupes.
  const fill = (curated: PostCardRow[], n: number) => {
    const out = curated.map(publicPostCard);
    out.forEach((p) => used.add(p.id));
    for (const p of recency) {
      if (out.length >= n) break;
      if (used.has(p.id)) continue;
      used.add(p.id);
      out.push(p);
    }
    return out;
  };

  // Hero = top-3 trending (recency tops up if trending is short on a cold/quiet day).
  const hero = heroTop.map(publicPostCard).slice(0, 3);
  hero.forEach((p) => used.add(p.id));
  for (const p of recency) { if (hero.length >= 3) break; if (used.has(p.id)) continue; used.add(p.id); hero.push(p); }
  const feature = fill(featured.feature, 1)[0] ?? null;
  const picks = fill([], 3);
  const recent = recency.filter((p) => !used.has(p.id)).slice(0, 8);

  return c.json({
    hero,
    feature,
    picks,
    recent,
    categories: cats.map(publicCategory),
    topAuthors,
    weather,
  });
});

export default app;
