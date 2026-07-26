import { Hono } from 'hono';
import { getDbCached } from '../db/client';
import type { AppEnv } from '../types';
import { listRecentPosts, publicPostCard } from '../db/queries/posts';
import { listCategories, publicCategory } from '../db/queries/categories';
import { listTopAuthors } from '../db/queries/users';
import { listFeatured } from '../db/queries/admin';
import { trendingTop } from '../db/queries/trending';
import { getWeather, recomputeWeatherCache } from '../lib/weather';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

/** Pure assembly of the home sections from newest-first cards (exported for
 * tests). Curated slots win their section, recency tops everything up, and no
 * post repeats across hero/feature/picks. The grid (`recent`) prefers posts not
 * shown above — but on a young site those sections can swallow every post (they
 * take the first 7), which used to leave "Recently published" empty until the
 * 8th post existed. So when the leftovers can't fill the grid it is topped back
 * up with the newest already-shown posts, in recency order: the section shows
 * up to 8 cards while ANY post exists, and once the site has enough posts the
 * dedupe fills all 8 on its own and nothing repeats. */
export function assembleHomeSections<T extends { id: string }>(
  recency: T[],
  trendingHero: T[],
  curatedFeature: T[],
): { hero: T[]; feature: T | null; picks: T[]; recent: T[] } {
  const used = new Set<string>();
  // Curated cards first (marked used), then recency tops it up to `n`, skipping dupes.
  const fill = (curated: T[], n: number) => {
    const out = [...curated];
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
  const hero = fill(trendingHero.slice(0, 3), 3);
  const feature = fill(curatedFeature, 1)[0] ?? null;
  const picks = fill([], 3);

  let recent = recency.filter((p) => !used.has(p.id)).slice(0, 8);
  if (recent.length < 8) {
    const pick = new Set(recent.map((p) => p.id));
    for (const p of recency) { if (pick.size >= 8) break; pick.add(p.id); }
    recent = recency.filter((p) => pick.has(p.id)).slice(0, 8);
  }

  return { hero, feature, picks, recent };
}

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

  const { hero, feature, picks, recent } = assembleHomeSections(
    postRows.map((r) => publicPostCard(r)),
    heroTop.map((r) => publicPostCard(r)),
    featured.feature.map((r) => publicPostCard(r)),
  );

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
