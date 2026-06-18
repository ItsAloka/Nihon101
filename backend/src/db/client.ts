import type { Context } from 'hono';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

type DbEnv = { DATABASE_URL: string; DB_POOLED?: string };
const isPooled = (env: DbEnv) => env.DB_POOLED === 'true';

/* TWO connection strategies, picked by DB_POOLED:
 *
 *  • Pooled (prod, DB_POOLED="true") — behind Cloudflare Hyperdrive or Neon's
 *    PgBouncer pooler, which multiplex many client connections onto few server
 *    ones. Here we keep ONE pool per isolate, reused across every request and
 *    NEVER closed per request (closeDb is a no-op). Opening+closing a pool per
 *    request against a real pooler wastes the very pooling it provides and adds
 *    handshake latency — at 50k users that's the difference between steady and
 *    connection-storming the database.
 *
 *  • Unpooled (local dev, DB_POOLED unset) — direct Docker Postgres with no
 *    pooler in front. A per-request pool (max 1), closed when the request ends by
 *    the cleanup middleware, keeps dev simple and leak-free.
 *
 *  Flip prod on with `DB_POOLED="true"` once Hyperdrive/Neon-pooler is in front;
 *  set DATABASE_URL to the Hyperdrive binding / `-pooler` host. */

// Per-request pool (unpooled mode), memoized on the Hono context.
const reqPools = new WeakMap<object, { db: DB; pool: pg.Pool }>();
// Per-isolate shared pool (pooled mode), reused across requests for the isolate's life.
let shared: { url: string; db: DB; pool: pg.Pool } | null = null;

export function getDb(c: Context): DB {
  const env = c.env as DbEnv;
  if (isPooled(env)) {
    if (!shared || shared.url !== env.DATABASE_URL) {
      const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
      shared = { url: env.DATABASE_URL, db: drizzle(pool, { schema }), pool };
    }
    return shared.db;
  }
  const key = c as unknown as object;
  let entry = reqPools.get(key);
  if (!entry) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
    entry = { db: drizzle(pool, { schema }), pool };
    reqPools.set(key, entry);
  }
  return entry.db;
}

export async function closeDb(c: Context): Promise<void> {
  // Pooled mode: the per-isolate pool is shared across requests — leave it open.
  if (isPooled(c.env as DbEnv)) return;
  const key = c as unknown as object;
  const entry = reqPools.get(key);
  if (entry) {
    reqPools.delete(key);
    try { await entry.pool.end(); } catch { /* already closing */ }
  }
}

/** A standalone pool+db not tied to a request context — for background work
 * (waitUntil) that outlives the request. Caller MUST close the pool. */
export function standaloneDb(env: { DATABASE_URL: string }): { db: DB; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  return { db: drizzle(pool, { schema }), pool };
}
