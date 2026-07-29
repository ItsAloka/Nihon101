import type { Context } from 'hono';
import type { AppEnv } from '../types';

/* Idle-gate flags for the scheduled() cron (src/index.ts). The cron fires every
 * 15 min but SKIPS opening Postgres on ticks where nothing changed, so Neon can
 * idle-scale to zero on a quiet site instead of being pinned awake 24/7. These KV
 * writes on the request path tell the next tick that real work is waiting. Both are
 * fire-and-forget in waitUntil — off the response path, never block or fail the
 * request — and best-effort: KV caps one write/sec per key, so a burst may drop a
 * duplicate '1', which is harmless (we only need the flag set, not counted). */

/** Engagement landed (read/like/save/comment) → the next tick must flush the
 *  buffered counters and recompute trending. The top-of-hour run does this
 *  regardless. */
export function markTrendingDirty(c: Context<AppEnv>): void {
  if (!c.env.TRENDING_KV) return;
  c.executionCtx.waitUntil(c.env.TRENDING_KV.put('trending:dirty', '1').catch(() => { /* best effort */ }));
}

/** A post was queued for auto-translation (publish/edit/retry) → the next tick must
 *  open the DB and drain the queue (lib/translation-sweep.ts). The sweep re-arms this
 *  flag while work remains; a fully drained queue leaves it clear so Neon can sleep. */
export function markTranslateDirty(c: Context<AppEnv>): void {
  if (!c.env.TRENDING_KV) return;
  c.executionCtx.waitUntil(c.env.TRENDING_KV.put('translate:dirty', '1').catch(() => { /* best effort */ }));
}
