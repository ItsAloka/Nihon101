import { eq, and, desc, sql } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, postLikes, postComments, commentLikes, postSaves, userSignals, users } from '../schema';
import { id as newId } from '../../lib/ids';
import { maskProfanity } from '../../lib/profanity';

/** Drop a negative taste signal when a user reverses a positive (unlike/unsave).
 *  The original event row is deleted, so this is the only trace left for the For
 *  You profile. Fire-and-forget weight; mirrors the +base values in computeAffinity. */
function recordNegative(db: DB, postId: string, userId: string, base: number) {
  return db.insert(userSignals).values({ id: newId('neg'), postId, userId, base, createdAt: Date.now() });
}

// ---- Post likes (toggle) -------------------------------------------------

/** Toggle a user's like on a post. Returns the new state + the post's count.
 * The UNIQUE (post_id, user_id) index makes the like idempotent. */
export async function togglePostLike(db: DB, postId: string, userId: string) {
  const [existing] = await db
    .select({ id: postLikes.id })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));

  if (existing) {
    await db.delete(postLikes).where(eq(postLikes.id, existing.id));
    await recordNegative(db, postId, userId, -3); // unlike → strong negative taste signal
    await db.update(posts)
      .set({ likes: sql`GREATEST(${posts.likes} - 1, 0)` })
      .where(eq(posts.id, postId));
  } else {
    await db.insert(postLikes).values({
      id: newId('plike'), postId, userId, createdAt: Date.now(),
    });
    await db.update(posts)
      .set({ likes: sql`${posts.likes} + 1` })
      .where(eq(posts.id, postId));
  }

  const [row] = await db.select({ likes: posts.likes }).from(posts).where(eq(posts.id, postId));
  return { liked: !existing, likes: row?.likes ?? 0 };
}

/** Whether a user has liked a post (null user → false). */
export async function hasLikedPost(db: DB, postId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db
    .select({ id: postLikes.id })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
  return !!row;
}

// ---- Post saves (toggle) -------------------------------------------------

/** Toggle a user's save (bookmark) on a post. Returns the new state + the post's
 * count. The UNIQUE (post_id, user_id) index makes the save idempotent. */
export async function togglePostSave(db: DB, postId: string, userId: string) {
  const [existing] = await db
    .select({ id: postSaves.id })
    .from(postSaves)
    .where(and(eq(postSaves.postId, postId), eq(postSaves.userId, userId)));

  if (existing) {
    await db.delete(postSaves).where(eq(postSaves.id, existing.id));
    await recordNegative(db, postId, userId, -2); // unsave → moderate negative taste signal
    await db.update(posts)
      .set({ saves: sql`GREATEST(${posts.saves} - 1, 0)` })
      .where(eq(posts.id, postId));
  } else {
    await db.insert(postSaves).values({
      id: newId('psave'), postId, userId, createdAt: Date.now(),
    });
    await db.update(posts)
      .set({ saves: sql`${posts.saves} + 1` })
      .where(eq(posts.id, postId));
  }

  const [row] = await db.select({ saves: posts.saves }).from(posts).where(eq(posts.id, postId));
  return { saved: !existing, saves: row?.saves ?? 0 };
}

/** Whether a user has saved a post (null user → false). */
export async function hasSavedPost(db: DB, postId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db
    .select({ id: postSaves.id })
    .from(postSaves)
    .where(and(eq(postSaves.postId, postId), eq(postSaves.userId, userId)));
  return !!row;
}

/** The ids of posts a user has saved, newest-saved first (drives the Saved tab
 *  and the saved-state on cards). */
export async function savedPostIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: postSaves.postId })
    .from(postSaves)
    .where(eq(postSaves.userId, userId))
    .orderBy(desc(postSaves.createdAt));
  return rows.map((r) => r.id);
}

// ---- Comments ------------------------------------------------------------

export type CommentRow = typeof postComments.$inferSelect & {
  authorName: string | null;
  authorNameJa: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
};

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
      isHidden: postComments.isHidden,
      createdAt: postComments.createdAt,
      updatedAt: postComments.updatedAt,
      authorName: users.displayName,
      authorNameJa: users.displayNameJa,
      authorHandle: users.handle,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(postComments)
    .leftJoin(users, eq(postComments.userId, users.id))
    .where(eq(postComments.postId, postId))
    .orderBy(desc(postComments.createdAt));

  if (!viewerId || rows.length === 0) return rows.map((r) => ({ ...r, liked: false }));

  const liked = await db
    .select({ commentId: commentLikes.commentId })
    .from(commentLikes)
    .where(eq(commentLikes.userId, viewerId));
  const likedSet = new Set(liked.map((l) => l.commentId));
  return rows.map((r) => ({ ...r, liked: likedSet.has(r.id) }));
}

/** Create a comment and bump the post's denormalized comment count.
 * parentId (when given) is the top-level comment being replied to — callers
 * must flatten replies-to-replies onto the original parent before this call. */
export async function createComment(db: DB, postId: string, userId: string, body: string, parentId: string | null = null) {
  const now = Date.now();
  const row = {
    id: newId('cmt'), postId, userId, parentId, body, likes: 0, isHidden: false, createdAt: now, updatedAt: now,
  };
  await db.insert(postComments).values(row);
  await db.update(posts).set({ comments: sql`${posts.comments} + 1` }).where(eq(posts.id, postId));
  return row;
}

export async function getComment(db: DB, id: string) {
  const [row] = await db.select().from(postComments).where(eq(postComments.id, id));
  return row;
}

/** Delete a comment, its likes, and (for a top-level comment) its replies +
 * their likes. Decrements the post's count by everything removed. */
export async function deleteComment(db: DB, comment: typeof postComments.$inferSelect) {
  // Gather this comment + any direct replies (one level only).
  const replies = comment.parentId
    ? []
    : await db.select({ id: postComments.id }).from(postComments).where(eq(postComments.parentId, comment.id));
  const ids = [comment.id, ...replies.map((r) => r.id)];

  for (const cid of ids) {
    await db.delete(commentLikes).where(eq(commentLikes.commentId, cid));
    await db.delete(postComments).where(eq(postComments.id, cid));
  }
  await db.update(posts)
    .set({ comments: sql`GREATEST(${posts.comments} - ${ids.length}, 0)` })
    .where(eq(posts.id, comment.postId));
}

/** Toggle a user's like on a comment. Returns new state + count. */
export async function toggleCommentLike(db: DB, commentId: string, userId: string) {
  const [existing] = await db
    .select({ id: commentLikes.id })
    .from(commentLikes)
    .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)));

  if (existing) {
    await db.delete(commentLikes).where(eq(commentLikes.id, existing.id));
    await db.update(postComments)
      .set({ likes: sql`GREATEST(${postComments.likes} - 1, 0)` })
      .where(eq(postComments.id, commentId));
  } else {
    await db.insert(commentLikes).values({
      id: newId('clike'), commentId, userId, createdAt: Date.now(),
    });
    await db.update(postComments)
      .set({ likes: sql`${postComments.likes} + 1` })
      .where(eq(postComments.id, commentId));
  }

  const [row] = await db.select({ likes: postComments.likes }).from(postComments).where(eq(postComments.id, commentId));
  return { liked: !existing, likes: row?.likes ?? 0 };
}

export function publicComment(c: CommentRow & { liked?: boolean }) {
  // Moderator-hidden: keep the row (so replies stay threaded) but never emit the
  // body or author identity — the frontend renders a "removed" placeholder.
  const hidden = !!c.isHidden;
  return {
    id: c.id,
    postId: c.postId,
    userId: hidden ? '' : c.userId,
    parentId: c.parentId ?? null,
    authorName: hidden ? null : (c.authorName ?? null),
    authorNameJa: hidden ? null : (c.authorNameJa ?? null),
    authorHandle: hidden ? null : (c.authorHandle ?? null),
    authorAvatarUrl: hidden ? null : (c.authorAvatarUrl ?? null),
    body: hidden ? '' : maskProfanity(c.body), // original kept in DB; masked only on the way out
    isHidden: hidden,
    likes: hidden ? 0 : c.likes,
    liked: !hidden && !!c.liked,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
