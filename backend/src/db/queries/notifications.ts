/* In-app notifications: create (fire-and-forget from engagement hooks), list
 * for the bell panel (with actor + post context), unread count, mark read. */
import { eq, and, desc, sql, isNull, lt, inArray } from 'drizzle-orm';
import type { DB } from '../client';
import { notifications, users, posts } from '../schema';
import { id as newId } from '../../lib/ids';

export type NotifType = 'like' | 'comment' | 'reply' | 'follow' | 'post';

export interface NewNotif {
  userId: string;   // recipient
  type: NotifType;
  actorId: string;  // who triggered it
  postId?: string | null;
  commentId?: string | null;
}

/** Create a notification. No-op if actor === recipient, or if an identical
 *  notification is already sitting UNREAD in the recipient's bell — so toggling
 *  like/follow on and off (rate-capped at 60/min) can't flood one author with
 *  duplicates. Comments/replies always carry a fresh commentId, so they still
 *  stack normally.
 *
 *  Never throws. A notification is a side effect of a like/comment/follow that has
 *  ALREADY committed; letting its insert bubble up would 500 an action the user
 *  successfully performed. */
export async function createNotification(db: DB, n: NewNotif): Promise<void> {
  try {
    if (n.userId === n.actorId) return;
    await db.execute(sql`
      INSERT INTO notifications (id, user_id, actor_id, type, post_id, comment_id, read_at, created_at)
      SELECT ${newId('ntf')}, ${n.userId}, ${n.actorId}, ${n.type}, ${n.postId ?? null}, ${n.commentId ?? null}, NULL, ${Date.now()}
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = ${n.userId} AND actor_id = ${n.actorId} AND type = ${n.type}
          AND post_id IS NOT DISTINCT FROM ${n.postId ?? null}
          AND comment_id IS NOT DISTINCT FROM ${n.commentId ?? null}
          AND read_at IS NULL
      )
    `);
  } catch (err) {
    console.error('createNotification failed', err);
  }
}

/** Fan out a "new post" notification to every follower of the author. One
 *  INSERT…SELECT — scales without pulling the follower list into JS. Best-effort:
 *  a fan-out failure must never break publishing. */
export async function notifyFollowersOfPost(db: DB, actorId: string, postId: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO notifications (id, user_id, type, actor_id, post_id, comment_id, read_at, created_at)
      SELECT ${'ntf_'} || substr(md5(random()::text || follower_id), 1, 21),
             follower_id, 'post', ${actorId}, ${postId}, NULL, NULL, ${Date.now()}
      FROM follows WHERE followee_id = ${actorId}
    `);
  } catch (err) {
    console.error('notifyFollowersOfPost failed', err);
  }
}

export interface NotifRow {
  id: string;
  type: NotifType;
  actorId: string;
  actorName: string | null;
  actorNameJa: string | null;
  actorHandle: string | null;
  postId: string | null;
  postSlug: string | null;
  postTitleEn: string | null;
  postTitleJa: string | null;
  commentId: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface NotifPage {
  items: NotifRow[];
  /** Pass back as `before` to fetch the next page; null = no more. */
  nextBefore: number | null;
}

/** A page of a user's notifications, newest first, with actor + post context.
 *  Keyset-paginated by createdAt (pass the last item's createdAt as `before`) —
 *  an OFFSET would re-scan everything the user has already seen, and a hard
 *  `limit` with no cursor would make the 31st notification unreachable forever. */
export async function listNotifications(
  db: DB,
  userId: string,
  opts: { before?: number; limit?: number } = {},
): Promise<NotifPage> {
  const limit = Math.min(50, Math.max(1, Math.trunc(opts.limit ?? 20)));
  const where = opts.before
    ? and(eq(notifications.userId, userId), lt(notifications.createdAt, opts.before))
    : eq(notifications.userId, userId);

  // limit+1 to detect a next page without a second count query.
  const rows = (await db
    .select({
      id: notifications.id,
      type: notifications.type,
      actorId: notifications.actorId,
      actorName: users.displayName,
      actorNameJa: users.displayNameJa,
      actorHandle: users.handle,
      postId: notifications.postId,
      postSlug: posts.slug,
      postTitleEn: posts.titleEn,
      postTitleJa: posts.titleJa,
      commentId: notifications.commentId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(posts, eq(notifications.postId, posts.id))
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1)) as NotifRow[];

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextBefore: hasMore ? items[items.length - 1].createdAt : null };
}

/** Count of unread notifications (for the bell badge). */
export async function unreadCount(db: DB, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Mark some (or all) of a user's notifications read. No ids → marks the lot.
 *  Always scoped to the owner, so a caller can never touch someone else's rows.
 *  Returns how many rows were updated. */
export async function markRead(db: DB, userId: string, ids?: string[]): Promise<number> {
  const scope = ids?.length
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt), inArray(notifications.id, ids))
    : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const updated = await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(scope)
    .returning({ id: notifications.id });
  return updated.length;
}

/** Retention sweep (cron): drop already-read notifications older than `maxAgeMs`.
 *  The table grows with every like/comment/reply/follow/new-post fan-out; left
 *  unbounded it becomes the biggest table on the platform. Unread rows are always
 *  kept — only read, aged-out rows go. The (user_id, created_at) index plus the
 *  created_at filter keeps this a bounded delete each run. Returns rows removed. */
export async function pruneReadNotifications(db: DB, maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const removed = await db
    .delete(notifications)
    .where(and(sql`${notifications.readAt} IS NOT NULL`, lt(notifications.createdAt, cutoff)))
    .returning({ id: notifications.id });
  return removed.length;
}

/** Delete some (or all) of a user's notifications. No ids → clears the lot.
 *  Scoped to the owner so a caller can never delete someone else's rows.
 *  Returns how many rows were removed. */
export async function deleteNotifications(db: DB, userId: string, ids?: string[]): Promise<number> {
  const scope = ids?.length
    ? and(eq(notifications.userId, userId), inArray(notifications.id, ids))
    : eq(notifications.userId, userId);
  const removed = await db.delete(notifications).where(scope).returning({ id: notifications.id });
  return removed.length;
}
