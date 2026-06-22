import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
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
import newsletter from './routes/newsletter';
import { standaloneDb } from './db/client';
import { recomputeTrendingCache } from './db/queries/trending';
import { recomputeWeatherCache } from './lib/weather';
import weather from './routes/weather';

// Durable Object class must be exported from the Worker entry to be bound.
export { RateLimiterDO } from './durable/RateLimiterDO';

const app = new Hono<AppEnv>();

// Correlation id: reuse Cloudflare's per-request `cf-ray` when present, else mint
// one. Echoed back as X-Request-Id and stamped into every error log so one request
// can be traced end-to-end. Stored on the context for handlers/onError.
app.use('*', async (c, next) => {
  const rid = c.req.header('cf-ray') || crypto.randomUUID();
  c.set('requestId', rid);
  await next();
  c.header('X-Request-Id', rid);
});

app.use('*', async (c, next) => {
  // Never fall back to the wildcard with credentials (Hono GHSA-88fw-hqm2-52qc):
  // if FRONTEND_ORIGIN is somehow unset, deny cross-origin rather than reflect any.
  // Dev fallback = local Astro origin; switched to https://nihon101.com at hosting.
  const origin = c.env.FRONTEND_ORIGIN || 'http://localhost:4321';
  const corsMw = cors({
    origin,
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

// Consistent error envelope. A thrown HTTPException keeps its intended status; any
// other (unexpected) error becomes a generic 500 — the message/stack is LOGGED with
// the request id but NEVER sent to the client, so internals don't leak.
app.onError((err, c) => {
  const requestId = c.var.requestId ?? '';
  if (err instanceof HTTPException) {
    return c.json({ error: err.message || 'error', requestId }, err.status);
  }
  console.error(JSON.stringify({ level: 'error', requestId, path: c.req.path, method: c.req.method, msg: err instanceof Error ? err.message : String(err) }));
  return c.json({ error: 'internal_error', requestId }, 500);
});

app.notFound((c) => c.json({ error: 'not_found', requestId: c.var.requestId ?? '' }, 404));

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
app.route('/newsletter', newsletter);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: AppEnv['Bindings']) {
    // Every 5 min: rescore the active set's momentum trend score, then bake the
    // top-20 cards to KV for the zero-Postgres hot path.
    const { db, pool } = standaloneDb(env);
    try {
      // Trending needs the DB; weather is a throttled external fetch (≈ every
      // 30 min) baked to the same KV. Run both; weather failures are swallowed.
      const tasks: Promise<unknown>[] = [
        recomputeTrendingCache(db, env.TRENDING_KV),
        recomputeWeatherCache(env.TRENDING_KV),
      ];
      await Promise.all(tasks);
    } finally {
      await pool.end();
    }
  },
};
