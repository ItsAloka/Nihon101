/* ============================================================================
 * RATE LIMITING — three-tier fixed-window limiter, one preset table.
 * ============================================================================
 * Each request increments a counter keyed by (bucket, subject, window); over the
 * limit → 429 + Retry-After. The subject is the authenticated user id when present
 * (a logged-in abuser can't dodge by rotating IPs) and otherwise the caller IP
 * (Cloudflare's `cf-connecting-ip`).
 *
 * Storage tier is chosen per endpoint class — the right tool for the threat:
 *   • 'do'     → Durable Object: ONE global actor per (bucket,subject), exact
 *                atomic counts. For the brute-force class (login/register) where the
 *                cap MUST hold; KV's eventual consistency would let a multi-region
 *                burst leak past it. Costs a DO round-trip, so reserved for auth.
 *   • 'kv'     → shared KV namespace, fixed window keyed by floor(now/window). Cheap,
 *                global, ~approximate under sudden multi-region bursts. For WRITES
 *                (spam/inflation) where "about right, globally" is enough.
 *   • 'memory' → per-isolate Map, zero KV writes. For READS (anti-scrape) where each
 *                edge isolate policing itself is fine and a KV write per read would be
 *                pure cost at high QPS.
 *
 * Fixed windows expire via KV TTL (no cleanup job) / DO alarm / lazy memory sweep.
 * Min KV TTL is 60s, so every window here is ≥ 60s. Bindings are optional in some
 * dev setups; 'do' falls back to 'kv', and 'kv' falls back to in-memory.
 * ========================================================================== */
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

export type RateStore = 'do' | 'kv' | 'memory';

export interface RateLimitOpts {
  bucket: string;       // namespace for the counter (one per endpoint class)
  limit: number;        // max requests allowed per window
  windowSec: number;    // window length in seconds (≥ 60 for KV TTL)
  by?: 'ip' | 'user';   // key by caller IP, or by user id when authenticated (falls back to IP)
  store?: RateStore;    // 'do' (exact, auth) | 'kv' (writes) | 'memory' (reads). Default 'kv'.
}

/** Per-isolate store for the 'memory' tier and the no-binding fallback. */
const mem = new Map<string, { count: number; resetAt: number }>();

/** Resolve the rate-limit subject: the authed user id (when `requireAuth` ran first
 *  and `by:'user'`), else the Cloudflare client IP, else a shared 'anon' bucket. */
function subject(c: Context<AppEnv>, by: 'ip' | 'user'): string {
  if (by === 'user') {
    const u = c.get('user') as { id: string } | undefined;
    if (u?.id) return `u:${u.id}`;
  }
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'anon';
  return `ip:${ip}`;
}

function reject(c: Context<AppEnv>, resetAt: number): Response {
  const retry = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  c.header('Retry-After', String(retry));
  return c.json({ error: 'rate_limited', retryAfter: retry }, 429);
}

/** Increment the per-isolate counter; returns true if the request is over limit. */
function memOver(key: string, limit: number, now: number, resetAt: number): boolean {
  const e = mem.get(key);
  const count = e && e.resetAt > now ? e.count : 0;
  if (count >= limit) return true;
  mem.set(key, { count: count + 1, resetAt });
  if (mem.size > 5000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  return false;
}

/** Build a fixed-window limiter. Place AFTER `requireAuth` when `by:'user'`. */
export function rateLimit(opts: RateLimitOpts): MiddlewareHandler<AppEnv> {
  const by = opts.by ?? 'ip';
  const store: RateStore = opts.store ?? 'kv';
  const windowMs = opts.windowSec * 1000;

  return async (c, next) => {
    const now = Date.now();
    const windowId = Math.floor(now / windowMs);
    const resetAt = (windowId + 1) * windowMs;
    const subj = subject(c, by);

    // --- 'do' tier: exact atomic count via a single global Durable Object. ---
    if (store === 'do') {
      const ns = c.env.RATE_LIMITER as DurableObjectNamespace | undefined;
      if (ns) {
        const stub = ns.get(ns.idFromName(`${opts.bucket}:${subj}`));
        const res = await stub.fetch('https://rl/', {
          method: 'POST',
          body: JSON.stringify({ limit: opts.limit, windowMs }),
        });
        const out = await res.json<{ ok: boolean; resetAt: number }>();
        if (!out.ok) return reject(c, out.resetAt);
        return next();
      }
      // No DO binding (some dev setups) → fall through to KV.
    }

    const key = `rl:${opts.bucket}:${subj}:${windowId}`;

    // --- 'memory' tier: per-isolate, zero KV writes. ---
    if (store === 'memory') {
      if (memOver(key, opts.limit, now, resetAt)) return reject(c, resetAt);
      return next();
    }

    // --- 'kv' tier (default, and the fallback for 'do'). ---
    const kv = c.env.TRENDING_KV as KVNamespace | undefined;
    if (kv) {
      const count = Number(await kv.get(key)) || 0;
      if (count >= opts.limit) return reject(c, resetAt);
      // TTL a touch past the window so the key is gone before it can be reused.
      await kv.put(key, String(count + 1), { expirationTtl: Math.max(60, opts.windowSec + 5) });
    } else if (memOver(key, opts.limit, now, resetAt)) {
      return reject(c, resetAt);
    }
    return next();
  };
}

/* ----------------------------------------------------------------------------
 * PRESETS — created once, reused across routes. Grouped by tier.
 *   • AUTH  (DO, by IP)   — exact brute-force / mass-signup guards.
 *   • WRITE (KV, by user) — spam / engagement-inflation guards, split buckets so
 *     one action can't starve another (post-like ≠ comment-like; edit ≠ delete).
 *   • READ  (memory, IP)  — anti-scrape, generous so real browsing never trips.
 * Counts are "requests per window"; window is in seconds.
 * -------------------------------------------------------------------------- */
export const limits = {
  // ---- AUTH — exact (Durable Object), per IP ----
  login:        rateLimit({ bucket: 'login',    limit: 10,  windowSec: 60,   by: 'ip', store: 'do' }),  // credential brute-force
  register:     rateLimit({ bucket: 'register', limit: 5,   windowSec: 3600, by: 'ip', store: 'do' }),  // mass signup
  otpVerify:    rateLimit({ bucket: 'otp-vfy',  limit: 20,  windowSec: 300,  by: 'ip', store: 'do' }),  // 6-digit code guessing
  otpResend:    rateLimit({ bucket: 'otp-rs',   limit: 5,   windowSec: 600,  by: 'ip' }),               // code-email bombing

  // ---- AUTH-adjacent — KV, per IP (high volume / not credential-guessing) ----
  refresh:      rateLimit({ bucket: 'refresh',  limit: 60,  windowSec: 60,   by: 'ip' }),   // token rotation
  oauth:        rateLimit({ bucket: 'oauth',    limit: 20,  windowSec: 60,   by: 'ip' }),   // google start/callback
  forgot:       rateLimit({ bucket: 'forgot',   limit: 5,   windowSec: 3600, by: 'ip' }),   // reset-email bombing
  reset:        rateLimit({ bucket: 'reset',    limit: 10,  windowSec: 60,   by: 'ip' }),   // reset-token guessing

  // ---- WRITE — KV, per user, split buckets ----
  postCreate:   rateLimit({ bucket: 'post-new',  limit: 30, windowSec: 3600, by: 'user' }),
  postEdit:     rateLimit({ bucket: 'post-edit', limit: 60, windowSec: 3600, by: 'user' }),
  postDelete:   rateLimit({ bucket: 'post-del',  limit: 30, windowSec: 3600, by: 'user' }),
  comment:      rateLimit({ bucket: 'comment',   limit: 12, windowSec: 60,   by: 'user' }),
  likePost:     rateLimit({ bucket: 'like-post', limit: 60, windowSec: 60,   by: 'user' }),
  likeComment:  rateLimit({ bucket: 'like-cmt',  limit: 60, windowSec: 60,   by: 'user' }),
  save:         rateLimit({ bucket: 'save',      limit: 60, windowSec: 60,   by: 'user' }),
  read:         rateLimit({ bucket: 'read-ping', limit: 120,windowSec: 60,   by: 'user' }),
  follow:       rateLimit({ bucket: 'follow',    limit: 30, windowSec: 60,   by: 'user' }),
  notif:        rateLimit({ bucket: 'notif',     limit: 120,windowSec: 60,   by: 'user' }),  // bell read/clear
  report:       rateLimit({ bucket: 'report',    limit: 20, windowSec: 3600, by: 'user' }),
  profile:      rateLimit({ bucket: 'profile',   limit: 20, windowSec: 3600, by: 'user' }),
  upload:       rateLimit({ bucket: 'upload',    limit: 30, windowSec: 3600, by: 'user' }),
  translate:    rateLimit({ bucket: 'translate', limit: 30, windowSec: 3600, by: 'user' }),  // external DeepL+OpenAI cost
  category:     rateLimit({ bucket: 'category',  limit: 20, windowSec: 3600, by: 'user' }),
  // ---- PUBLIC writes — KV, per IP (no auth required; spam/abuse guard + email-cost) ----
  newsletter:   rateLimit({ bucket: 'newsletter',limit: 10, windowSec: 3600, by: 'ip' }),  // signup spam

  // ---- READ — in-memory per isolate, per IP ----
  search:       rateLimit({ bucket: 'search',  limit: 60,  windowSec: 60, by: 'ip', store: 'memory' }),
  autocomplete: rateLimit({ bucket: 'autocmp', limit: 120, windowSec: 60, by: 'ip', store: 'memory' }), // fires per keystroke
  feed:         rateLimit({ bucket: 'feed',    limit: 120, windowSec: 60, by: 'ip', store: 'memory' }),
  // Generous catch-all for public SSR/API reads (post + profile + category pages).
  // High enough that fast real browsing never trips; low enough to blunt scrapers
  // (anti-scrape protects AdSense from invalid-traffic strikes).
  publicRead:   rateLimit({ bucket: 'pubread', limit: 300, windowSec: 60, by: 'ip', store: 'memory' }),
};
