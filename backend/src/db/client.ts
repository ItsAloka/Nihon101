import type { Context } from 'hono';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

/** Structural type for a Cloudflare Hyperdrive binding (avoids a hard dependency
 * on workers-types' Hyperdrive interface). */
type HyperdriveBinding = { connectionString: string };

type DbEnv = {
  DATABASE_URL: string;
  DB_POOLED?: string;
  HYPERDRIVE?: HyperdriveBinding;
  HYPERDRIVE_CACHED?: HyperdriveBinding;
};
const isPooled = (env: DbEnv) => env.DB_POOLED === 'true';

/* CONNECTION STRATEGIES, in priority order:
 *
 *  • Hyperdrive (prod) — Hyperdrive pools + keeps the real Neon connections warm,
 *    AND a Worker isolate can't reliably reuse a pg socket across requests: a
 *    reused socket dies between invocations and the next request hangs on it until
 *    the runtime cancels (intermittent 500s — this bit Not Bagel in production on
 *    2026-07-07). So over Hyperdrive we open a FRESH per-request pool on its LOCAL
 *    socket (cheap: no DB-region handshake) and close it when the request ends.
 *    NEVER cache a pool across requests when HYPERDRIVE is bound.
 *
 *  • Pooled without Hyperdrive (DB_POOLED="true", Neon `-pooler` direct) — one
 *    per-isolate pool reused across requests, never closed per request. Only for
 *    a PgBouncer-style pooler reached over the network; carries the socket-reuse
 *    hang risk above on Workers, so prefer Hyperdrive in prod.
 *
 *  • Unpooled (local dev) — direct Docker Postgres; per-request pool (max 1),
 *    closed by the cleanup middleware. Simple and leak-free. */

// Per-request pools (Hyperdrive + unpooled modes), memoized on the Hono context.
// `cached` is the second handle over HYPERDRIVE_CACHED (see getDbCached).
type ReqEntry = { db?: { db: DB; pool: pg.Pool }; cached?: { db: DB; pool: pg.Pool } };
const reqPools = new WeakMap<object, ReqEntry>();
// Per-isolate shared pool (pooled-without-Hyperdrive mode only).
let shared: { url: string; db: DB; pool: pg.Pool } | null = null;

function reqEntry(c: Context): ReqEntry {
  const key = c as unknown as object;
  let entry = reqPools.get(key);
  if (!entry) { entry = {}; reqPools.set(key, entry); }
  return entry;
}

export function getDb(c: Context): DB {
  const env = c.env as DbEnv;
  const hyper = env.HYPERDRIVE?.connectionString;
  if (!hyper && isPooled(env)) {
    if (!shared || shared.url !== env.DATABASE_URL) {
      const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
      shared = { url: env.DATABASE_URL, db: drizzle(pool, { schema }), pool };
    }
    return shared.db;
  }
  const entry = reqEntry(c);
  if (!entry.db) {
    const pool = new pg.Pool({ connectionString: hyper ?? env.DATABASE_URL, max: 1 });
    entry.db = { db: drizzle(pool, { schema }), pool };
  }
  return entry.db.db;
}

/** The same database through the CACHING Hyperdrive config (60s query cache).
 * Content-only SELECT call-sites opt in — post bodies/listings, categories,
 * trending, search, public profiles, the logged-out feed. Anything per-user
 * (liked/saved/comments/follows/notifications/auth) must stay on getDb, and
 * the reading path merges live counts over the cached shell. No binding (dev,
 * or before the second Hyperdrive config exists) ⇒ alias of getDb, so a
 * forgotten binding is merely uncached, never stale. */
export function getDbCached(c: Context): DB {
  const env = c.env as DbEnv;
  const url = env.HYPERDRIVE_CACHED?.connectionString;
  if (!url) return getDb(c);
  const entry = reqEntry(c);
  if (!entry.cached) {
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    entry.cached = { db: drizzle(pool, { schema }), pool };
  }
  return entry.cached.db;
}

export async function closeDb(c: Context): Promise<void> {
  // Pooled-without-Hyperdrive mode: the per-isolate pool is shared — leave it open.
  const key = c as unknown as object;
  const entry = reqPools.get(key);
  if (!entry) return;
  reqPools.delete(key);
  for (const opened of [entry.db, entry.cached]) {
    if (opened) {
      try { await opened.pool.end(); } catch { /* already closing */ }
    }
  }
}

/** A standalone pool+db not tied to a request context — for background work
 * (waitUntil, cron) that outlives the request. Runs over Hyperdrive when bound
 * (same per-use fresh pool rule). Caller MUST close the pool. */
export function standaloneDb(env: { DATABASE_URL: string; HYPERDRIVE?: HyperdriveBinding }): { db: DB; pool: pg.Pool } {
  const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  return { db: drizzle(pool, { schema }), pool };
}
