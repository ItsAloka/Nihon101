import { eq, and, desc, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../schema';
import { posts, postLikes, postComments, commentLikes, users } from '../schema';
import { id as newId } from '../../lib/ids';

type DB = DrizzleD1Database<typeof schema>;

// ---- Post likes (toggle) -------------------------------------------------

/** Toggle a user's like on a post. Returns the new state + the post's count.
 * The UNIQUE (post_id, user_id) index makes the like idempotent. */
export async function togglePostLike(db: DB, postId: string, userId: string) {
  const existing = await db
    .select({ id: postLikes.id })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
    .get();

  if (existing) {
    await db.delete(postLikes).where(eq(postLikes.id, existing.id));
    await db.update(posts)
      .set({ likes: sql`MAX(${posts.likes} - 1, 0)` })
      .where(eq(posts.id, postId));
  } else {
    await db.insert(postLikes).values({
      id: newId('plike'), postId, userId, createdAt: Date.now(),
    });
    await db.update(posts)
      .set({ likes: sql`${posts.likes} + 1` })
      .where(eq(posts.id, postId));
  }

  const row = await db.select({ likes: posts.likes }).from(posts).where(eq(posts.id, postId)).get();
  return { liked: !existing, likes: row?.likes ?? 0 };
}

/** Whether a user has liked a post (null user → false). */
export async function hasLikedPost(db: DB, postId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const row = await db
    .select({ id: postLikes.id })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
    .get();
  return !!row;
}

// ---- Comments ------------------------------------------------------------

export type CommentRow = typeof postComments.$inferSelect & { authorName: string | null };

/** List a post's comments (newest first) with author name and, when a viewer is
 * known, that viewer's per-comment liked state in one query. */
export async function listComments(db: DB, postId: string, viewerId: string | null): Promise<(CommentRow & { liked: boolean })[]> {
  const rows = await db
    .select({
      id: postComments.id,
      postId: postComments.postId,
      userId: postComments.userId,
      parentId: postComments.parentId,
      body: postComments.body,
      likes: postComments.likes,
      createdAt: postComments.createdAt,
      updatedAt: postComments.updatedAt,
      authorName: users.displayName,
    })
    .from(postComments)
    .leftJoin(users, eq(postComments.userId, users.id))
    .where(eq(postComments.postId, postId))
    .orderBy(desc(postComments.createdAt))
    .all();

  if (!viewerId || rows.length === 0) return rows.map((r) => ({ ...r, liked: false }));

  const liked = await db
    .select({ commentId: commentLikes.commentId })
    .from(commentLikes)
    .where(eq(commentLikes.userId, viewerId))
    .all();
  const likedSet = new Set(liked.map((l) => l.commentId));
  return rows.map((r) => ({ ...r, liked: likedSet.has(r.id) }));
}

/** Create a comment and bump the post's denormalized comment count.
 * parentId (when given) is the top-level comment being replied to — callers
 * must flatten replies-to-replies onto the original parent before this call. */
export async function createComment(db: DB, postId: string, userId: string, body: string, parentId: string | null = null) {
  const now = Date.now();
  const row = {
    id: newId('cmt'), postId, userId, parentId, body, likes: 0, createdAt: now, updatedAt: now,
  };
  await db.insert(postComments).values(row);
  await db.update(posts).set({ comments: sql`${posts.comments} + 1` }).where(eq(posts.id, postId));
  return row;
}

export function getComment(db: DB, id: string) {
  return db.select().from(postComments).where(eq(postComments.id, id)).get();
}

/** Delete a comment, its likes, and (for a top-level comment) its replies +
 * their likes. Decrements the post's count by everything removed. */
export async function deleteComment(db: DB, comment: typeof postComments.$inferSelect) {
  // Gather this comment + any direct replies (one level only).
  const replies = comment.parentId
    ? []
    : await db.select({ id: postComments.id }).from(postComments).where(eq(postComments.parentId, comment.id)).all();
  const ids = [comment.id, ...replies.map((r) => r.id)];

  for (const cid of ids) {
    await db.delete(commentLikes).where(eq(commentLikes.commentId, cid));
    await db.delete(postComments).where(eq(postComments.id, cid));
  }
  await db.update(posts)
    .set({ comments: sql`MAX(${posts.comments} - ${ids.length}, 0)` })
    .where(eq(posts.id, comment.postId));
}

/** Toggle a user's like on a comment. Returns new state + count. */
export async function toggleCommentLike(db: DB, commentId: string, userId: string) {
  const existing = await db
    .select({ id: commentLikes.id })
    .from(commentLikes)
    .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)))
    .get();

  if (existing) {
    await db.delete(commentLikes).where(eq(commentLikes.id, existing.id));
    await db.update(postComments)
      .set({ likes: sql`MAX(${postComments.likes} - 1, 0)` })
      .where(eq(postComments.id, commentId));
  } else {
    await db.insert(commentLikes).values({
      id: newId('clike'), commentId, userId, createdAt: Date.now(),
    });
    await db.update(postComments)
      .set({ likes: sql`${postComments.likes} + 1` })
      .where(eq(postComments.id, commentId));
  }

  const row = await db.select({ likes: postComments.likes }).from(postComments).where(eq(postComments.id, commentId)).get();
  return { liked: !existing, likes: row?.likes ?? 0 };
}

export function publicComment(c: CommentRow & { liked?: boolean }) {
  return {
    id: c.id,
    postId: c.postId,
    userId: c.userId,
    parentId: c.parentId ?? null,
    authorName: c.authorName ?? null,
    body: c.body,
    likes: c.likes,
    liked: !!c.liked,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
