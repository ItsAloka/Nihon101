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
import { recomputeTrendingCache, refreshEventBuckets, pruneEventBuckets, BUCKET_WINDOW } from './db/queries/trending';
import { flushPostCountEvents } from './db/queries/engagement';
import { pruneReadNotifications } from './db/queries/notifications';
import { pruneOldSignals, prunePostReads } from './db/queries/for-you';
import { getSettings, dismissStaleWatchingReports } from './db/queries/admin';
import { pruneDeadRefreshTokens, pruneExpiredAuthArtifacts } from './db/queries/maintenance';
import { pruneUnconfirmedSubscribers } from './db/queries/newsletter';
import { recomputeWeatherCache } from './lib/weather';
import { sendSundayLetter } from './lib/sunday-letter';
import { runTranslationSweep } from './lib/translation-sweep';
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

// Security headers on every API response. The Worker returns JSON or media bytes for
// almost everything, where a deny-everything CSP is the right defense-in-depth. The
// ONE exception is the newsletter unsubscribe page, which returns a real HTML document
// with inline styles + a form — a blanket `default-src 'none'` (style-src falls back to
// it) would render that page unstyled. So HTML responses get a narrowly-relaxed CSP
// (inline styles + self form-action only); everything else stays deny-all. The
// page-level CSP for the actual site lives on the frontend (Astro). HSTS is harmless
// over http (dev) and enforced in prod.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), browsing-topics=()');
  const isHtml = (c.res.headers.get('content-type') || '').includes('text/html');
  c.header('Content-Security-Policy', isHtml
    ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    : "default-src 'none'; frame-ancestors 'none'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

// Fail-closed config guard. A prod deploy with a missing/weak JWT_SECRET or
// REFRESH_PEPPER would make access tokens forgeable (or auth silently broken) — far
// worse than an outage. So if either is absent or under 32 chars we refuse to serve
// and log it loudly. Env is identical across an isolate's life, so the check passes
// once then no-ops; a misconfigured isolate keeps 500ing until the secret is fixed.
let configOk = false;
app.use('*', async (c, next) => {
  if (!configOk) {
    const bad: string[] = (['JWT_SECRET', 'REFRESH_PEPPER'] as const).filter((k) => (c.env[k] ?? '').length < 32);
    // The rate limiter silently falls back DO → KV → per-isolate memory when a
    // binding is absent (middleware/rateLimit.ts), which in prod turns brute-force
    // protection into a no-op with no visible symptom. So missing bindings are fatal
    // in prod; local dev (localhost FRONTEND_ORIGIN) keeps the fallback so work isn't
    // blocked, but logs one loud warning per isolate.
    const missing = (['RATE_LIMITER', 'TRENDING_KV'] as const).filter((k) => !c.env[k]);
    if (missing.length) {
      if ((c.env.FRONTEND_ORIGIN ?? '').includes('localhost')) {
        console.warn(JSON.stringify({ level: 'warn', requestId: c.var.requestId ?? '', msg: 'rate_limit_fallback_active', missing }));
      } else {
        bad.push(...missing);
      }
    }
    if (bad.length) {
      console.error(JSON.stringify({ level: 'fatal', requestId: c.var.requestId ?? '', msg: 'insecure_config', fields: bad }));
      return c.json({ error: 'server_misconfigured', requestId: c.var.requestId ?? '' }, 500);
    }
    configOk = true;
  }
  return next();
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
app.get('/health', (c) => c.json({ ok: true }));

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
  async scheduled(event: ScheduledEvent, env: AppEnv['Bindings']) {
    const { db, pool } = standaloneDb(env);
    try {
      // Sunday 00:00 UTC (09:00 JST): the weekly Sunday Letter. Its own trigger so
      // it never piggybacks the per-5-min trending pass. The day-of-week is the NAME
      // form because Cloudflare rejects `0 0 * * 0`; must match wrangler.toml exactly
      // or this branch never fires and the letter silently never sends.
      if (event.cron === '0 0 * * SUN') {
        const r = await sendSundayLetter(db, env);
        console.log(`[sunday-letter] sent=${r.sent} skipped=${r.skipped ?? 'none'}`);
        return;
      }
      // Every minute: fold the buffered like/save/comment deltas into the posts
      // counters (queries/engagement.ts) FIRST, so the counts are current before
      // trending's floor term reads them and the top-20 cards are baked. This is
      // where the hot-row counter writes get their one batched UPDATE per post.
      const flushed = await flushPostCountEvents(db).catch((e) => {
        console.error(JSON.stringify({ level: 'error', msg: 'count_flush_crashed', err: e instanceof Error ? e.message : String(e) }));
        return 0;
      });
      if (flushed) console.log(`[counts] postsFlushed=${flushed}`);
      // Then roll the last couple of hours of raw engagement into hourly buckets
      // (older buckets are already final — see queries/trending.ts), rescore the
      // active set's momentum from the buckets and bake the top-20 cards to KV for
      // the zero-Postgres hot path. Weather is a throttled external fetch baked to
      // the same KV; its failures are swallowed.
      await refreshEventBuckets(db, Date.now() - 2 * 60 * 60 * 1000);
      await Promise.all([
        recomputeTrendingCache(db, env.TRENDING_KV),
        recomputeWeatherCache(env.TRENDING_KV),
      ]);
      // Once an hour (top of the hour), sweep rows that can no longer affect anything:
      // read notifications older than 30 days, taste signals past the For You window,
      // and open low-signal report cases (below the surface threshold, no new report
      // in 7 days) that would otherwise pile up in "watching" forever. All bounded
      // indexed work; each failure is swallowed so one can't skip the others.
      if (new Date().getUTCMinutes() === 0) {
        // Wide bucket re-roll first: repairs any bucket whose source rows moved
        // since the narrow pass (post_reads dedup rewrites created_at on a
        // repeat read, moving the event into a newer bucket).
        await refreshEventBuckets(db, Date.now() - BUCKET_WINDOW).catch(() => { /* next hour */ });
        const [n, s, r, rt, au, pr, ns, eb] = await Promise.all([
          pruneReadNotifications(db, 30 * 24 * 60 * 60 * 1000).catch(() => 0),
          pruneOldSignals(db).catch(() => 0),
          getSettings(db)
            .then(({ reportThreshold }) =>
              dismissStaleWatchingReports(db, reportThreshold, Date.now() - 7 * 24 * 60 * 60 * 1000))
            .catch(() => 0),
          pruneDeadRefreshTokens(db).catch(() => 0),
          pruneExpiredAuthArtifacts(db).catch(() => 0),
          prunePostReads(db).catch(() => 0),
          pruneUnconfirmedSubscribers(db).catch(() => 0),
          pruneEventBuckets(db).catch(() => 0),
        ]);
        if (n || s || r || rt || au || pr || ns || eb) console.log(`[prune] notifs=${n} signals=${s} staleReports=${r} refresh=${rt} auth=${au} reads=${pr} newsletter=${ns} buckets=${eb}`);
      }
      // LAST, because it can hold the tick for minutes on long posts (scheduled()
      // has a 15-min wall budget where waitUntil had ~30s, which is the whole
      // point) and the cheap KV bakes/prunes above must never wait behind it:
      // drain the auto-translate queue (rows publish/edit/retry marked 'pending').
      const t = await runTranslationSweep(db, env).catch((e) => {
        console.error(JSON.stringify({ level: 'error', msg: 'translation_sweep_crashed', err: e instanceof Error ? e.message : String(e) }));
        return null;
      });
      if (t && (t.claimed || t.failed)) console.log(`[translate] claimed=${t.claimed} done=${t.done} failed=${t.failed}`);
    } finally {
      await pool.end();
    }
  },
};
