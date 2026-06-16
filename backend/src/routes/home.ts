import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { listRecentPosts, publicPostCard } from '../db/queries/posts';
import { listCategories, publicCategory } from '../db/queries/categories';
import { listTopAuthors } from '../db/queries/users';
import { getWeather, recomputeWeatherCache } from '../lib/weather';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

// Public aggregate feed for the SSR home page — one request, one connection.
// Every slot is real published posts, newest first ("trending"/"picks" are
// recency-ranked stand-ins until the Phase 6 cron + admin pick tool exist):
//   hero    = newest 3   (the rotating carousel)
//   feature = next 1     (the secondary feature card)
//   picks   = next 3     (the editor's reading list)
//   recent  = next 8     (the grid)
// Slices simply shorten on a small dataset.
app.get('/', limits.feed, async (c) => {
  const d = getDb(c);
  const [postRows, cats, topAuthors, weather] = await Promise.all([
    listRecentPosts(d, 16),
    listCategories(d),
    listTopAuthors(d, 15),
    getWeather(c.env.TRENDING_KV),
  ]);
  // Cold KV (cron hasn't baked weather yet) → kick a background refresh.
  if (weather.length === 0) c.executionCtx.waitUntil(recomputeWeatherCache(c.env.TRENDING_KV));
  const cards = postRows.map(publicPostCard);
  return c.json({
    hero: cards.slice(0, 3),
    feature: cards[3] ?? null,
    picks: cards.slice(4, 7),
    recent: cards.slice(7, 15),
    categories: cats.map(publicCategory),
    topAuthors,
    weather,
  });
});

export default app;
