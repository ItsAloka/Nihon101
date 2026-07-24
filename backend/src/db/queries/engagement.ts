import { eq, and, asc, desc, isNull, sql, inArray } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, postLikes, postComments, commentLikes, postSaves, postCountEvents, userSignals, users } from '../schema';
import { descNullsLast } from './posts';
import { id as newId } from '../../lib/ids';
import { maskProfanity } from '../../lib/profanity';

/** Drop a negative taste signal when a user reverses a positive (unlike/unsave).
 *  The original event row is deleted, so this is the only trace left for the For
 *  You profile. Fire-and-forget weight; mirrors the +base values in computeAffinity. */
function recordNegative(db: DB, postId: string, userId: string, base: number) {
  return db.insert(userSignals).values({ id: newId('neg'), postId, userId, base, createdAt: Date.now() });
}

// ---- Denormalized post counters (buffered — see schema `postCountEvents`) ------
// Likes/saves/comments on the posts row are no longer bumped in place (one hot row,
// serialized locks + dead-tuple churn on a viral post). Each event appends a delta;
// the per-minute cron folds deltas into posts (flushPostCountEvents). The acting
// user's own response and the single-post read merge the still-pending delta so
// their number is exact; card listings read posts.* and may lag one flush (~60s).

const COUNT_COL = { like: posts.likes, save: posts.saves, comment: posts.comments } as const;
export type CountKind = keyof typeof COUNT_COL;

/** Append a counter delta instead of UPDATEing the hot posts row. */
function bumpPostCount(db: DB, postId: string, kind: CountKind, delta: number) {
  return db.insert(postCountEvents).values({ id: newId('cnt'), postId, kind, delta, createdAt: Date.now() });
}

/** A post's live count for one kind: the flushed base (posts.<col>) PLUS the
 *  still-unflushed deltas, read in ONE statement so it stays exact even if the
 *  cron flush lands mid-read — base and pending always partition the true total,
 *  so a single snapshot sees one or the other, never a double-count or a gap.
 *  GREATEST clamps the belt-and-suspenders case (the invariant never goes negative:
 *  a delta is only appended when the source like/save/comment row truly changed). */
async function mergedPostCount(db: DB, postId: string, kind: CountKind): Promise<number> {
  const col = COUNT_COL[kind];
  const [row] = await db
    .select({ n: sql<number>`GREATEST(${col} + COALESCE((SELECT SUM(${postCountEvents.delta}) FROM ${postCountEvents} WHERE ${postCountEvents.postId} = ${postId} AND ${postCountEvents.kind} = ${kind}), 0), 0)` })
    .from(posts)
    .where(eq(posts.id, postId));
  return Number(row?.n ?? 0);
}

/** Fold all pending counter deltas into posts, then delete them — one atomic
 *  statement (data-modifying CTE: the DELETE and UPDATE share a snapshot, so an
 *  event INSERTed mid-flush is simply not in the DELETE's snapshot and survives
 *  for the next run — no lost updates, no double counts). Called each minute by
 *  the cron. Returns how many post rows moved (for the log line). */
export async function flushPostCountEvents(db: DB): Promise<number> {
  const res = await db.execute(sql`
    WITH flushed AS (
      DELETE FROM post_count_events RETURNING post_id, kind, delta
    ), agg AS (
      SELECT post_id,
        COALESCE(SUM(delta) FILTER (WHERE kind = 'like'), 0)    AS dlike,
        COALESCE(SUM(delta) FILTER (WHERE kind = 'save'), 0)    AS dsave,
        COALESCE(SUM(delta) FILTER (WHERE kind = 'comment'), 0) AS dcomment
      FROM flushed GROUP BY post_id
    )
    UPDATE posts SET
      likes    = GREATEST(posts.likes    + agg.dlike, 0),
      saves    = GREATEST(posts.saves    + agg.dsave, 0),
      comments = GREATEST(posts.comments + agg.dcomment, 0)
    FROM agg WHERE posts.id = agg.post_id
    RETURNING posts.id
  `);
  return res.rows.length;
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
      await bumpPostCount(db, postId, 'like', -1);
    }
    liked = false;
  } else {
    const ins = await db.insert(postLikes)
      .values({ id: newId('plike'), postId, userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .returning({ id: postLikes.id });
    if (ins.length) await bumpPostCount(db, postId, 'like', 1);
    liked = true;
  }

  return { liked, likes: await mergedPostCount(db, postId, 'like') };
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
      await bumpPostCount(db, postId, 'save', -1);
    }
    saved = false;
  } else {
    const ins = await db.insert(postSaves)
      .values({ id: newId('psave'), postId, userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .returning({ id: postSaves.id });
    if (ins.length) await bumpPostCount(db, postId, 'save', 1);
    saved = true;
  }

  return { saved, saves: await mergedPostCount(db, postId, 'save') };
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
  nextCursor: string | null;
}

const COMMENTS_PAGE = 50;
const MAX_COMMENTS_PAGE = 100;

/** Opaque keyset cursor over the TOP-LEVEL thread. Carries the last row's sort
 * key so the next page is an index range scan, not an OFFSET walk: 'new' keys on
 * (createdAt, id); 'top' keys on (likes, createdAt, id). base64url of a compact
 * JSON tuple. The cursor is always paired with the sort it was minted under (the
 * client re-fetches from scratch when the sort changes), so it need not self-describe. */
type NewCur = { c: number; i: string };
type TopCur = { l: number; c: number; i: string };
function encodeCommentCursor(sort: 'top' | 'new', r: { likes: number; createdAt: number; id: string }): string {
  const payload = sort === 'top' ? { l: r.likes, c: r.createdAt, i: r.id } : { c: r.createdAt, i: r.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
function decodeCommentCursor(sort: 'top' | 'new', cur: string): NewCur | TopCur | null {
  try {
    const o = JSON.parse(Buffer.from(cur, 'base64url').toString('utf8'));
    if (sort === 'top') {
      if (typeof o?.l === 'number' && typeof o?.c === 'number' && typeof o?.i === 'string') return o as TopCur;
    } else if (typeof o?.c === 'number' && typeof o?.i === 'string') {
      return o as NewCur;
    }
  } catch { /* malformed cursor → treat as first page */ }
  return null;
}

/** A page of a post's comments. Only the TOP-LEVEL comments are paginated — a
 * brigaded thread must never load in one unbounded query — and each returned
 * parent's one level of replies rides along, so a thread is never split across
 * a page boundary. Ordering ('top' = most-liked, 'new' = newest) is done in SQL
 * so "Top" is a real global ranking, not a re-sort of whatever happened to load.
 * Pagination is KEYSET (opts.cursor), not offset — a deep page costs the same as
 * the first (served by post_comments_new_idx / post_comments_top_idx). When a
 * viewer is known, their per-comment liked state comes in one extra query scoped
 * to just this page's rows. */
export async function listComments(
  db: DB,
  postId: string,
  viewerId: string | null,
  opts: { sort?: 'top' | 'new'; cursor?: string; limit?: number } = {},
): Promise<CommentPage> {
  const sort = opts.sort === 'top' ? 'top' : 'new';
  const limit = Math.min(MAX_COMMENTS_PAGE, Math.max(1, Math.trunc(opts.limit ?? COMMENTS_PAGE)));
  const cur = opts.cursor ? decodeCommentCursor(sort, opts.cursor) : null;

  // descNullsLast to match the partial keyset indexes (the columns are NOT NULL,
  // but the planner still pathkey-matches on null ordering — see the gotcha).
  const order = sort === 'top'
    ? [descNullsLast(postComments.likes), descNullsLast(postComments.createdAt), descNullsLast(postComments.id)]
    : [descNullsLast(postComments.createdAt), descNullsLast(postComments.id)];

  // Keyset predicate: a ROW(...) comparison (an index start condition, unlike the
  // equivalent OR form) that resumes strictly after the cursor's row.
  const keyset = cur
    ? (sort === 'top'
        ? sql`(${postComments.likes}, ${postComments.createdAt}, ${postComments.id}) < (${(cur as TopCur).l}, ${(cur as TopCur).c}, ${cur.i})`
        : sql`(${postComments.createdAt}, ${postComments.id}) < (${(cur as NewCur).c}, ${cur.i})`)
    : undefined;

  // limit+1 to detect a next page without a second count query.
  const topRows = await db
    .select(commentCols)
    .from(postComments)
    .leftJoin(users, eq(postComments.userId, users.id))
    .where(and(eq(postComments.postId, postId), isNull(postComments.parentId), keyset))
    .orderBy(...order)
    .limit(limit + 1);

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

  // Header shows the true total (top-level + replies) from the post's denormalized
  // counter, merged with the still-unflushed comment deltas (buffered counters —
  // see the top of this file) so a comment added this minute is counted.
  const total = await mergedPostCount(db, postId, 'comment');
  // Cursor off the LAST top-level parent of this page (replies never advance it).
  const lastTop = top[top.length - 1];
  const nextCursor = hasMore && lastTop ? encodeCommentCursor(sort, lastTop) : null;

  if (!viewerId || rows.length === 0) {
    return { items: rows.map((r) => ({ ...r, liked: false })), total, nextCursor };
  }

  // Scope to the comments we're actually returning — not every like this viewer has
  // ever made site-wide (that set grows unbounded with a power user's activity).
  const liked = await db
    .select({ commentId: commentLikes.commentId })
    .from(commentLikes)
    .where(and(eq(commentLikes.userId, viewerId), inArray(commentLikes.commentId, rows.map((r) => r.id))));
  const likedSet = new Set(liked.map((l) => l.commentId));
  return { items: rows.map((r) => ({ ...r, liked: likedSet.has(r.id) })), total, nextCursor };
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
  await bumpPostCount(db, postId, 'comment', 1);
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
  await bumpPostCount(db, comment.postId, 'comment', -ids.length);
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
