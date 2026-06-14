/* Follow graph: follow / unfollow, membership test, follower & following counts.
 * Unique (follower_id, followee_id) keeps follows idempotent. */
import { eq, and, desc, sql } from 'drizzle-orm';
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

export interface FollowUser {
  id: string;
  handle: string;
  displayName: string;
  displayNameJa: string | null;
  avatarUrl: string | null;
  role: string;
  followedAt: number;
  viewerFollows: boolean; // does the requesting viewer follow this row?
}

/** Rich follower/following rows for the Readers/Writers modal — newest follow
 *  first (the "recently followed" view), with each row's follow-state from the
 *  viewer's perspective so the modal can show Follow / Following per row.
 *  dir 'followers' = people who follow userId; 'following' = people userId follows. */
async function listFollowDir(
  db: DB,
  dir: 'followers' | 'following',
  userId: string,
  { viewerId, q, limit = 30, offset = 0 }: { viewerId?: string | null; q?: string; limit?: number; offset?: number },
): Promise<FollowUser[]> {
  const isFollowers = dir === 'followers';
  const matchCol = isFollowers ? follows.followeeId : follows.followerId;   // fixed side = profile owner
  const joinCol = isFollowers ? follows.followerId : follows.followeeId;     // the listed user
  const viewerFollows = viewerId
    ? sql<boolean>`EXISTS (SELECT 1 FROM follows vf WHERE vf.follower_id = ${viewerId} AND vf.followee_id = ${users.id})`
    : sql<boolean>`false`;
  // Optional name/handle filter (matches the display name, JA name, or handle).
  const search = q?.trim()
    ? sql`AND (${users.displayName} ILIKE ${'%' + q.trim() + '%'} OR ${users.displayNameJa} ILIKE ${'%' + q.trim() + '%'} OR ${users.handle} ILIKE ${'%' + q.trim() + '%'})`
    : sql``;
  return (await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      displayNameJa: users.displayNameJa,
      avatarUrl: users.avatarUrl,
      role: users.role,
      followedAt: follows.createdAt,
      viewerFollows,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, joinCol))
    .where(sql`${eq(matchCol, userId)} ${search}`)
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset)) as FollowUser[];
}

export const listFollowers = (db: DB, userId: string, opts: { viewerId?: string | null; q?: string; limit?: number; offset?: number } = {}) =>
  listFollowDir(db, 'followers', userId, opts);
export const listFollowingUsers = (db: DB, userId: string, opts: { viewerId?: string | null; q?: string; limit?: number; offset?: number } = {}) =>
  listFollowDir(db, 'following', userId, opts);
