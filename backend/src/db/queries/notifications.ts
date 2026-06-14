/* In-app notifications: create (fire-and-forget from engagement hooks), list
 * for the bell panel (with actor + post context), unread count, mark read. */
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
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

/** Create a notification. Skips self-notifications (acting on your own thing). */
export async function createNotification(db: DB, n: NewNotif): Promise<void> {
  if (n.userId === n.actorId) return;
  await db.insert(notifications).values({
    id: newId('ntf'),
    userId: n.userId,
    type: n.type,
    actorId: n.actorId,
    postId: n.postId ?? null,
    commentId: n.commentId ?? null,
    readAt: null,
    createdAt: Date.now(),
  });
}

/** Fan out one "new post" notification to each follower. */
export async function notifyFollowersOfPost(
  db: DB,
  followerIds: string[],
  actorId: string,
  postId: string,
): Promise<void> {
  if (!followerIds.length) return;
  const now = Date.now();
  await db.insert(notifications).values(
    followerIds.map((uid) => ({
      id: newId('ntf'), userId: uid, type: 'post' as const, actorId,
      postId, commentId: null, readAt: null, createdAt: now,
    })),
  );
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

/** A user's notifications, newest first, with actor + post context for display. */
export async function listNotifications(db: DB, userId: string, limit = 30): Promise<NotifRow[]> {
  return (await db
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
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)) as NotifRow[];
}

/** Count of unread notifications (for the bell badge). */
export async function unreadCount(db: DB, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Mark all of a user's notifications read. */
export async function markAllRead(db: DB, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
