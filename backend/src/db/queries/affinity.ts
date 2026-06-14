/* Per-user category affinity for the For You feed.
 *
 * Signal: read×1 + like×3 + comment×4 over the last 90 days, grouped by the
 * post's category_id, normalized to max 1. This is what tilts the feed toward
 * the kind of topics a reader actually engages with.
 *
 * At 50K users, running the 3-way UNION on every feed request is the cost. So
 * we cache it in `user_affinity` and only recompute when the snapshot is older
 * than TTL (or missing). The recompute is a single delete + insert batch.
 */
import { eq, sql } from 'drizzle-orm';
import type { DB } from '../client';
import { userAffinity } from '../schema';
import { id as newId } from '../../lib/ids';

const HOUR = 3_600_000;
const TTL = 1 * HOUR; // recompute a user's snapshot at most once per hour
const WINDOW = 90 * 24 * HOUR;

/** category id → preference weight in [0, 1]. */
export type Affinity = Map<string, number>;

/** Raw category weights, normalized to max 1. */
async function compute(db: DB, userId: string): Promise<Affinity> {
  const since = Date.now() - WINDOW;
  const rows = await db.execute(sql`
    SELECT p.category_id AS cat, SUM(w.weight) AS weight FROM (
      SELECT post_id, 1.0 AS weight FROM post_reads    WHERE user_id = ${userId} AND created_at > ${since}
      UNION ALL
      SELECT post_id, 3.0 AS weight FROM post_likes    WHERE user_id = ${userId} AND created_at > ${since}
      UNION ALL
      SELECT post_id, 4.0 AS weight FROM post_comments WHERE user_id = ${userId} AND created_at > ${since}
    ) w JOIN posts p ON p.id = w.post_id
    GROUP BY p.category_id
  `);
  const cat: Affinity = new Map();
  for (const r of rows.rows as Array<{ cat: string; weight: string }>) {
    cat.set(r.cat, (cat.get(r.cat) ?? 0) + Number(r.weight));
  }
  let max = 0;
  for (const v of cat.values()) if (v > max) max = v;
  if (max > 0) for (const [k, v] of cat) cat.set(k, v / max);
  return cat;
}

/** Persist a freshly computed snapshot (replace the user's rows). */
async function persist(db: DB, userId: string, aff: Affinity): Promise<void> {
  const now = Date.now();
  const values = [...aff].map(([key, weight]) => ({
    id: newId('aff'), userId, dimension: 'cat' as const, key, weight, updatedAt: now,
  }));
  await db.delete(userAffinity).where(eq(userAffinity.userId, userId));
  if (values.length) {
    await db.insert(userAffinity).values(values);
  } else {
    // No engagement: stamp a sentinel so we don't recompute every request.
    await db.insert(userAffinity).values({
      id: newId('aff'), userId, dimension: 'cat', key: '', weight: 0, updatedAt: now,
    });
  }
}

/** Read the cached snapshot if fresh, else recompute + persist. */
export async function userAffinityFor(db: DB, userId: string): Promise<Affinity> {
  const cached = await db
    .select({ key: userAffinity.key, weight: userAffinity.weight, updatedAt: userAffinity.updatedAt })
    .from(userAffinity)
    .where(eq(userAffinity.userId, userId));

  const fresh = cached.length > 0 && cached.every((r) => Date.now() - r.updatedAt < TTL);
  if (fresh) {
    const cat: Affinity = new Map();
    for (const r of cached) if (r.key !== '') cat.set(r.key, r.weight); // skip sentinel
    return cat;
  }

  const aff = await compute(db, userId);
  await persist(db, userId, aff);
  return aff;
}
