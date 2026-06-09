import type { Context } from 'hono';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

// One Postgres pool per request, memoized on the Hono context. Workers can't
// safely reuse sockets across requests, so we create per request and close the
// pool when the request finishes (see the cleanup middleware in index.ts).
// `max: 1` — a single Worker request never needs concurrent connections.
const pools = new WeakMap<object, { db: DB; pool: pg.Pool }>();

export function getDb(c: Context): DB {
  const key = c as unknown as object;
  let entry = pools.get(key);
  if (!entry) {
    const pool = new pg.Pool({ connectionString: (c.env as { DATABASE_URL: string }).DATABASE_URL, max: 1 });
    entry = { db: drizzle(pool, { schema }), pool };
    pools.set(key, entry);
  }
  return entry.db;
}

export async function closeDb(c: Context): Promise<void> {
  const key = c as unknown as object;
  const entry = pools.get(key);
  if (entry) {
    pools.delete(key);
    try { await entry.pool.end(); } catch { /* already closing */ }
  }
}

/** A standalone pool+db not tied to a request context — for background work
 * (waitUntil) that outlives the request. Caller MUST close the pool. */
export function standaloneDb(env: { DATABASE_URL: string }): { db: DB; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  return { db: drizzle(pool, { schema }), pool };
}
