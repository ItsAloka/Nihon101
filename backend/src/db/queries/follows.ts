/* Follow graph: follow / unfollow, membership test, follower & following counts.
 * Unique (follower_id, followee_id) keeps follows idempotent. */
import { eq, and, sql } from 'drizzle-orm';
import type { DB } from '../client';
import { follows, users } from '../schema';
import { id as newId } from '../../lib/ids';

/** Follow followee. Idempotent. Returns true if a new edge was created. */
export async function follow(db: DB, followerId: string, followeeId: string): Promise<boolean> {
  if (followerId === followeeId) return false; // can't follow yourself
  const res = await db
    .insert(follows)
    .values({ id: newId('flw'), followerId, followeeId, createdAt: Date.now() })
    .onConflictDoNothing({ target: [follows.followerId, follows.followeeId] })
    .returning({ id: follows.id });
  return res.length > 0;
}

/** Unfollow. Idempotent. */
export async function unfollow(db: DB, followerId: string, followeeId: string): Promise<void> {
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
}

/** Whether follower follows followee (null follower → false). */
export async function isFollowing(db: DB, followerId: string | null, followeeId: string): Promise<boolean> {
  if (!followerId) return false;
  const [row] = await db
    .select({ id: follows.id })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
  return !!row;
}

/** followers + following counts for a user. */
export async function followCounts(db: DB, userId: string): Promise<{ followers: number; following: number }> {
  const [[f], [g]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, userId)),
  ]);
  return { followers: f?.n ?? 0, following: g?.n ?? 0 };
}

/** Ids of everyone who follows userId (used to fan out "new post" notifications). */
export async function followerIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, userId));
  return rows.map((r) => r.id);
}

/** The authors a user follows, as {id, handle} — drives the For You feed split
 *  and the follow-button state on cards. */
export async function listFollowing(db: DB, userId: string): Promise<{ id: string; handle: string }[]> {
  return db
    .select({ id: users.id, handle: users.handle })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(eq(follows.followerId, userId));
}
