import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getWeather, recomputeWeatherCache } from '../lib/weather';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

// Live weather for the home ribbon — reads the cron-baked KV value (fast, no
// external call on the request path). If KV is still empty (cron hasn't run yet,
// e.g. fresh dev), kick a background refresh so the next load has data.
app.get('/', limits.feed, async (c) => {
  const cities = await getWeather(c.env.TRENDING_KV);
  if (cities.length === 0) {
    c.executionCtx.waitUntil(recomputeWeatherCache(c.env.TRENDING_KV));
  }
  return c.json({ cities });
});

export default app;
