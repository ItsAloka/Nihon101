import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { closeDb } from './db/client';
import auth from './routes/auth';
import google from './routes/google';
import posts from './routes/posts';
import categories from './routes/categories';
import media from './routes/media';
import usersRoute from './routes/users';
import translate from './routes/translate';
import home from './routes/home';
import search from './routes/search';
import feed from './routes/feed';
import notifications from './routes/notifications';
import trending from './routes/trending';
import admin from './routes/admin';
import reports from './routes/reports';
import { standaloneDb } from './db/client';
import { recomputeTrendingCache } from './db/queries/trending';
import { recomputeWeatherCache } from './lib/weather';
import weather from './routes/weather';

// Durable Object class must be exported from the Worker entry to be bound.
export { RateLimiterDO } from './durable/RateLimiterDO';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const corsMw = cors({
    origin: c.env.FRONTEND_ORIGIN,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  return corsMw(c, next);
});

// Security headers on every API response. This Worker only ever returns JSON or
// media bytes (never an HTML document), so a deny-everything CSP is safe here and
// gives defense-in-depth: even if a response were mis-rendered as HTML, nothing
// could load or execute. The page-level CSP that governs the actual site lives on
// the frontend (Astro). HSTS is harmless over http (dev) and enforced in prod.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), browsing-topics=()');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

// Close the per-request Postgres pool once the request finishes.
app.use('*', async (c, next) => {
  try {
    await next();
  } finally {
    await closeDb(c);
  }
});

app.get('/', (c) => c.json({ ok: true, service: 'nihon101-api' }));

app.route('/auth', auth);
app.route('/auth/google', google);
app.route('/posts', posts);
app.route('/categories', categories);
app.route('/media', media);
app.route('/users', usersRoute);
app.route('/translate', translate);
app.route('/home', home);
app.route('/search', search);
app.route('/feed', feed);
app.route('/notifications', notifications);
app.route('/trending', trending);
app.route('/weather', weather);
app.route('/admin', admin);
app.route('/reports', reports);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: AppEnv['Bindings']) {
    // Per minute: recompute every published post's momentum trend score, then
    // bake the top-20 cards to KV for the zero-Postgres hot path.
    const { db, pool } = standaloneDb(env);
    try {
      // Trending needs the DB; weather is a throttled external fetch (≈ every
      // 30 min) baked to the same KV. Run both; weather failures are swallowed.
      await Promise.all([
        recomputeTrendingCache(db, env.TRENDING_KV),
        recomputeWeatherCache(env.TRENDING_KV),
      ]);
    } finally {
      await pool.end();
    }
  },
};
