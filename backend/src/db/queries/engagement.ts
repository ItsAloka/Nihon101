import { eq, and, asc, desc, isNull, sql, inArray } from 'drizzle-orm';
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

  // The counter is a denormalized cache of the post_likes rows, so a concurrent
  // double-tap must never +2 (or 500 on the UNIQUE index) — only adjust it when the
  // row actually changed. ON CONFLICT/affected-rowcount makes the toggle idempotent:
  // the row mutation and the increment agree even when two requests race.
  let liked: boolean;
  if (existing) {
    const del = await db.delete(postLikes).where(eq(postLikes.id, existing.id)).returning({ id: postLikes.id });
    if (del.length) {
      await recordNegative(db, postId, userId, -3); // unlike → strong negative taste signal
      await db.update(posts).set({ likes: sql`GREATEST(${posts.likes} - 1, 0)` }).where(eq(posts.id, postId));
    }
    liked = false;
  } else {
    const ins = await db.insert(postLikes)
      .values({ id: newId('plike'), postId, userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .returning({ id: postLikes.id });
    if (ins.length) await db.update(posts).set({ likes: sql`${posts.likes} + 1` }).where(eq(posts.id, postId));
    liked = true;
  }

  const [row] = await db.select({ likes: posts.likes }).from(posts).where(eq(posts.id, postId));
  return { liked, likes: row?.likes ?? 0 };
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

/** Which of `postIds` the viewer has liked — one batched query for a card list
 *  (null viewer / empty list → empty set). Lets every card render an honest
 *  filled-vs-outline heart instead of always-filled. */
export async function likedPostIds(db: DB, viewerId: string | null, postIds: string[]): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();
  const rows = await db
    .select({ postId: postLikes.postId })
    .from(postLikes)
    .where(and(eq(postLikes.userId, viewerId), inArray(postLikes.postId, postIds)));
  return new Set(rows.map((r) => r.postId));
}

// ---- Post saves (toggle) -------------------------------------------------

/** Toggle a user's save (bookmark) on a post. Returns the new state + the post's
 * count. The UNIQUE (post_id, user_id) index makes the save idempotent. */
export async function togglePostSave(db: DB, postId: string, userId: string) {
  const [existing] = await db
    .select({ id: postSaves.id })
    .from(postSaves)
    .where(and(eq(postSaves.postId, postId), eq(postSaves.userId, userId)));

  // Same race-safe pattern as likes: only move the counter when the row truly changed.
  let saved: boolean;
  if (existing) {
    const del = await db.delete(postSaves).where(eq(postSaves.id, existing.id)).returning({ id: postSaves.id });
    if (del.length) {
      await recordNegative(db, postId, userId, -2); // unsave → moderate negative taste signal
      await db.update(posts).set({ saves: sql`GREATEST(${posts.saves} - 1, 0)` }).where(eq(posts.id, postId));
    }
    saved = false;
  } else {
    const ins = await db.insert(postSaves)
      .values({ id: newId('psave'), postId, userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .returning({ id: postSaves.id });
    if (ins.length) await db.update(posts).set({ saves: sql`${posts.saves} + 1` }).where(eq(posts.id, postId));
    saved = true;
  }

  const [row] = await db.select({ saves: posts.saves }).from(posts).where(eq(posts.id, postId));
  return { saved, saves: row?.saves ?? 0 };
}

// Hard cap on the Saved tab. Same reasoning as OWNER_LIST_CAP/MAX_COMMENTS_PAGE: the
// query must be bounded — a power user's multi-year save history would otherwise
// load in full (ids here, then a card per id) on every Saved view. Newest-first
// means the cap drops the oldest tail, which is what a bookmarks view wants.
export const MAX_SAVED = 200;

/** The ids of posts a user has saved, newest-saved first (drives the Saved tab
 *  and the saved-state on cards). Capped at MAX_SAVED. */
export async function savedPostIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: postSaves.postId })
    .from(postSaves)
    .where(eq(postSaves.userId, userId))
    .orderBy(desc(postSaves.createdAt))
    .limit(MAX_SAVED);
  return rows.map((r) => r.id);
}

// ---- Comments ------------------------------------------------------------

export type CommentRow = typeof postComments.$inferSelect & {
  authorName: string | null;
  authorNameJa: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
};

const commentCols = {
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
};

export interface CommentPage {
  items: (CommentRow & { liked: boolean })[];
  total: number;            // post's full comment count (top-level + replies)
  nextOffset: number | null;
}

const COMMENTS_PAGE = 50;
const MAX_COMMENTS_PAGE = 100;

/** A page of a post's comments. Only the TOP-LEVEL comments are paginated — a
 * brigaded thread must never load in one unbounded query — and each returned
 * parent's one level of replies rides along, so a thread is never split across
 * a page boundary. Ordering ('top' = most-liked, 'new' = newest) is done in SQL
 * so "Top" is a real global ranking, not a re-sort of whatever happened to load.
 * When a viewer is known, their per-comment liked state comes in one extra query
 * scoped to just this page's rows. */
export async function listComments(
  db: DB,
  postId: string,
  viewerId: string | null,
  opts: { sort?: 'top' | 'new'; offset?: number; limit?: number } = {},
): Promise<CommentPage> {
  const limit = Math.min(MAX_COMMENTS_PAGE, Math.max(1, Math.trunc(opts.limit ?? COMMENTS_PAGE)));
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const order = opts.sort === 'top'
    ? [desc(postComments.likes), desc(postComments.createdAt), desc(postComments.id)]
    : [desc(postComments.createdAt), desc(postComments.id)];

  // limit+1 to detect a next page without a second count query.
  const topRows = await db
    .select(commentCols)
    .from(postComments)
    .leftJoin(users, eq(postComments.userId, users.id))
    .where(and(eq(postComments.postId, postId), isNull(postComments.parentId)))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(offset);

  const hasMore = topRows.length > limit;
  const top = hasMore ? topRows.slice(0, limit) : topRows;

  // Replies for exactly this page's parents — one batched IN query (no N+1),
  // chronological under each parent.
  const parentIds = top.map((r) => r.id);
  const replies = parentIds.length
    ? await db
        .select(commentCols)
        .from(postComments)
        .leftJoin(users, eq(postComments.userId, users.id))
        .where(and(eq(postComments.postId, postId), inArray(postComments.parentId, parentIds)))
        .orderBy(asc(postComments.createdAt))
    : [];

  const rows = [...top, ...replies];

  // Header shows the true total (from the post's denormalized counter), not just
  // what's loaded on this page.
  const [countRow] = await db.select({ total: posts.comments }).from(posts).where(eq(posts.id, postId));
  const total = countRow?.total ?? rows.length;
  const nextOffset = hasMore ? offset + limit : null;

  if (!viewerId || rows.length === 0) {
    return { items: rows.map((r) => ({ ...r, liked: false })), total, nextOffset };
  }

  // Scope to the comments we're actually returning — not every like this viewer has
  // ever made site-wide (that set grows unbounded with a power user's activity).
  const liked = await db
    .select({ commentId: commentLikes.commentId })
    .from(commentLikes)
    .where(and(eq(commentLikes.userId, viewerId), inArray(commentLikes.commentId, rows.map((r) => r.id))));
  const likedSet = new Set(liked.map((l) => l.commentId));
  return { items: rows.map((r) => ({ ...r, liked: likedSet.has(r.id) })), total, nextOffset };
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

  // Race-safe: adjust the cached count only when the like row actually changed.
  if (existing) {
    const del = await db.delete(commentLikes).where(eq(commentLikes.id, existing.id)).returning({ id: commentLikes.id });
    if (del.length) await db.update(postComments).set({ likes: sql`GREATEST(${postComments.likes} - 1, 0)` }).where(eq(postComments.id, commentId));
  } else {
    const ins = await db.insert(commentLikes)
      .values({ id: newId('clike'), commentId, userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .returning({ id: commentLikes.id });
    if (ins.length) await db.update(postComments).set({ likes: sql`${postComments.likes} + 1` }).where(eq(postComments.id, commentId));
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
