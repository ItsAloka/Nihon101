import { eq, and, desc, sql, inArray, getTableColumns } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users, postCountEvents } from '../schema';
import { id as newId } from '../../lib/ids';
import { slugify } from './categories';
import { maskProfanity, maskProfanityHtml } from '../../lib/profanity';

export type PostRow = typeof posts.$inferSelect;
export type PostStatus = 'draft' | 'published';
export type PostDensity = 'compact' | 'normal' | 'relaxed';

/** A publicly-visible post = published AND not moderator-hidden. Use this on every
 *  public list surface (home, trending, search, feed, profile) so a hidden post
 *  disappears everywhere at once. Owner/admin paths opt out explicitly. */
export const notHidden = eq(posts.isHidden, false);

/** ORDER BY key that the listing indexes can actually serve. The indexes are
 *  `DESC NULLS LAST` (drizzle's .desc() emits that), but a plain `ORDER BY x DESC`
 *  means DESC NULLS FIRST to Postgres — the pathkeys don't match, the planner
 *  ignores the index and does a full sort (verified with EXPLAIN at 200k rows).
 *  Every query that wants posts_feed_idx/posts_cat_feed_idx/posts_author_feed_idx/
 *  posts_engagement_idx must spell the sort with this helper. */
export const descNullsLast = (col: unknown) => sql`${col} desc nulls last`;

export interface NewPostInput {
  authorId: string;
  categoryId: string;
  lang: 'en' | 'ja';
  titleEn: string;
  titleJa: string;
  excerptEn: string;
  excerptJa: string;
  bodyEn: string;
  bodyJa: string;
  cover: string | null;
  coverLabel: string;
  coverCredit: string;
  status: PostStatus;
  translationStatus?: TranslationStatus; // 'pending' when a background job rides this save
  density: PostDensity;
  score: number | null;
  tags: string[];
}

export type TranslationStatus = 'none' | 'pending' | 'done' | 'failed';

/** Globally-unique slug from a title (English wins, JA fallback, id tail last). */
async function uniqueSlug(db: DB, titleEn: string, titleJa: string, idTail: string): Promise<string> {
  const base = (slugify(titleEn) || slugify(titleJa)).slice(0, 60) || 'post';
  let candidate = base;
  let n = 0;
  while ((await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, candidate)))[0]) {
    n += 1;
    candidate = `${base}-${n === 1 ? idTail : n}`;
  }
  return candidate;
}

export async function createPost(db: DB, input: NewPostInput): Promise<PostRow> {
  const id = newId('post');
  const now = Date.now();
  // body_chars is a stored generated column — Postgres computes it, so it must
  // not appear in the INSERT. The returned row carries the same arithmetic.
  const row: Omit<PostRow, 'bodyChars'> = {
    id,
    authorId: input.authorId,
    categoryId: input.categoryId,
    lang: input.lang,
    slug: await uniqueSlug(db, input.titleEn, input.titleJa, id.slice(-6)),
    titleEn: input.titleEn,
    titleJa: input.titleJa,
    excerptEn: input.excerptEn,
    excerptJa: input.excerptJa,
    bodyEn: input.bodyEn,
    bodyJa: input.bodyJa,
    cover: input.cover,
    coverLabel: input.coverLabel,
    coverCredit: input.coverCredit,
    status: input.status,
    translationStatus: input.translationStatus ?? 'none',
    translationClaimedAt: null,
    translationAttempts: 0,
    isHidden: false,
    hiddenReason: '',
    density: input.density,
    score: input.score,
    tags: input.tags,
    likes: 0,
    saves: 0,
    comments: 0,
    trendScore: null,
    publishedAt: input.status === 'published' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(posts).values(row);
  return { ...row, bodyChars: input.bodyEn.length + input.bodyJa.length };
}

export async function getPostById(db: DB, id: string): Promise<PostRow | undefined> {
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  return row;
}

export async function getPostBySlug(db: DB, slug: string): Promise<PostRow | undefined> {
  const [row] = await db.select().from(posts).where(eq(posts.slug, slug));
  return row;
}

/** Author summary embedded in public post responses (avoids a separate lookup). */
const authorCols = {
  authorName: users.displayName,
  authorNameJa: users.displayNameJa,
  authorHandle: users.handle,
  authorAvatarUrl: users.avatarUrl,
};
export type PostWithAuthor = PostRow & {
  authorName: string | null;
  authorNameJa: string | null;
  authorAvatarUrl: string | null;
  authorHandle: string | null;
};

export async function getPostWithAuthor(db: DB, id: string): Promise<PostWithAuthor | undefined> {
  const [row] = await db
    .select({ ...getTableColumns(posts), ...authorCols })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, id));
  return row as PostWithAuthor | undefined;
}

export async function getPostWithAuthorBySlug(db: DB, slug: string): Promise<PostWithAuthor | undefined> {
  const [row] = await db
    .select({ ...getTableColumns(posts), ...authorCols })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.slug, slug));
  return row as PostWithAuthor | undefined;
}

/** Live engagement counters for one post — merged over a getDbCached shell on the
 * reading path, so a like/comment made this minute is never masked by the 60s
 * query cache. Each count folds in the still-unflushed post_count_events deltas
 * (the counters are buffered now — see engagement.ts) in the SAME statement, so a
 * like made this minute shows immediately even though posts.likes only moves on
 * the cron flush. Undefined when the row is gone (deleted; only the cache survived). */
export async function getPostCounts(db: DB, id: string): Promise<{ likes: number; saves: number; comments: number } | undefined> {
  const pending = (kind: 'like' | 'save' | 'comment') =>
    sql<number>`COALESCE((SELECT SUM(${postCountEvents.delta}) FROM ${postCountEvents} WHERE ${postCountEvents.postId} = ${posts.id} AND ${postCountEvents.kind} = ${kind}), 0)`;
  const [row] = await db
    .select({
      likes: sql<number>`GREATEST(${posts.likes} + ${pending('like')}, 0)`,
      saves: sql<number>`GREATEST(${posts.saves} + ${pending('save')}, 0)`,
      comments: sql<number>`GREATEST(${posts.comments} + ${pending('comment')}, 0)`,
    })
    .from(posts)
    .where(eq(posts.id, id));
  return row ? { likes: Number(row.likes), saves: Number(row.saves), comments: Number(row.comments) } : undefined;
}

/** Card column set for list surfaces (home feed): everything except the bodies.
 * readMins comes from the stored `body_chars` generated column — computing
 * char_length() here forced Postgres to detoast both ~20KB bodies per row on
 * every card query just to produce one small integer. */
const { bodyEn: _cardBodyEn, bodyJa: _cardBodyJa, ...postCardCols } = getTableColumns(posts);
export const cardCols = {
  ...postCardCols,
  ...authorCols,
};
export type PostCardRow = Omit<PostWithAuthor, 'bodyEn' | 'bodyJa'>;

/** Newest published posts, card shape (no bodies selected at all). Sort matches
 * posts_feed_idx exactly (published_at DESC, id DESC) so it's one index walk. */
export function listRecentPosts(db: DB, limit: number): Promise<PostCardRow[]> {
  return db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.status, 'published'), notHidden))
    .orderBy(descNullsLast(posts.publishedAt), descNullsLast(posts.id))
    .limit(limit) as Promise<PostCardRow[]>;
}

/** Published posts (card shape) for the given ids, returned in the order the ids
 *  were passed (callers like the Saved tab want newest-saved-first, not DB order). */
export async function listCardsByIds(db: DB, ids: string[]): Promise<PostCardRow[]> {
  if (!ids.length) return [];
  const rows = (await db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(inArray(posts.id, ids), eq(posts.status, 'published'), notHidden))) as PostCardRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is PostCardRow => !!r);
}

export interface ListPostsFilter {
  categoryId?: string;
  authorId?: string;
  status?: PostStatus;
  includeHidden?: boolean; // owner/admin views pass true; public reads exclude hidden
  limit?: number;          // hard cap — no list query is ever unbounded
  offset?: number;         // simple page offset (owner "my posts" / drafts)
}

// Owner/admin "my posts" + drafts. Bounded, and CARD shape — the list never ships
// bodies (two ~20KB bilingual bodies × 200 rows was a multi-megabyte response for
// one dashboard load). The editor fetches the single post by id when opening.
const OWNER_LIST_CAP = 200;

function listWhere(f: ListPostsFilter) {
  return [
    f.categoryId ? eq(posts.categoryId, f.categoryId) : undefined,
    f.authorId ? eq(posts.authorId, f.authorId) : undefined,
    f.status ? eq(posts.status, f.status) : undefined,
    f.includeHidden ? undefined : notHidden,
  ].filter(Boolean);
}

export function listPosts(db: DB, f: ListPostsFilter): Promise<PostCardRow[]> {
  const where = listWhere(f);
  // createdAt (not id) tiebreak on purpose: drafts all have published_at NULL, so
  // the second key is their entire order — it must stay newest-first, not random.
  return db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(Math.min(f.limit ?? OWNER_LIST_CAP, OWNER_LIST_CAP))
    .offset(f.offset ?? 0) as Promise<PostCardRow[]>;
}

// Public list surface (the default /posts read). CARD shape — bodies are never
// selected, so a category/author listing can't ship megabytes of HTML — and always
// paginated. Fetches limit+1 to tell the caller whether another page exists.
export const PUBLIC_LIST_LIMIT = 24;
export const PUBLIC_LIST_MAX = 60;

export async function listPostCards(
  db: DB,
  f: ListPostsFilter,
  limit = PUBLIC_LIST_LIMIT,
  offset = 0,
): Promise<{ cards: PostCardRow[]; hasMore: boolean }> {
  const where = listWhere(f);
  const capped = Math.min(Math.max(1, limit), PUBLIC_LIST_MAX);
  const rows = (await db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where.length ? and(...where) : undefined)
    // Matches posts_feed_idx / posts_cat_feed_idx / posts_author_feed_idx exactly
    // (including NULLS LAST — see descNullsLast), so every numbered page (the
    // Pager UI) is an ordered index walk — no sort, shallow or deep.
    .orderBy(descNullsLast(posts.publishedAt), descNullsLast(posts.id))
    .limit(capped + 1)
    .offset(Math.max(0, offset))) as PostCardRow[];
  const hasMore = rows.length > capped;
  return { cards: hasMore ? rows.slice(0, capped) : rows, hasMore };
}

export interface UpdatePostInput {
  categoryId?: string;
  lang?: 'en' | 'ja';
  titleEn?: string;
  titleJa?: string;
  excerptEn?: string;
  excerptJa?: string;
  bodyEn?: string;
  bodyJa?: string;
  cover?: string | null;
  coverLabel?: string;
  coverCredit?: string;
  status?: PostStatus;
  translationStatus?: TranslationStatus;
  translationAttempts?: number;        // reset to 0 when (re)queueing
  translationClaimedAt?: number | null; // cleared when (re)queueing
  density?: PostDensity;
  score?: number | null;
  tags?: string[];
}

export async function updatePost(db: DB, id: string, patch: UpdatePostInput): Promise<PostRow | undefined> {
  const set: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
  await db.update(posts).set(set).where(eq(posts.id, id));
  return getPostById(db, id);
}

export function setPublishedAt(db: DB, id: string, at: number | null): Promise<unknown> {
  return db.update(posts).set({ publishedAt: at }).where(eq(posts.id, id));
}

export function deletePost(db: DB, id: string): Promise<unknown> {
  return db.delete(posts).where(eq(posts.id, id));
}

/** Client-facing card shape for list surfaces: publicPost minus the bodies,
 * plus readMins derived from the body character count (~1100 chars/min).
 * Profanity is masked at read time (same contract as publicComment) — the DB
 * keeps the original. Pass raw=true ONLY for owner/editor surfaces; a masked
 * title round-tripped through the editor would overwrite the original with ●●●. */
export function publicPostCard(p: PostCardRow, raw = false) {
  const m = raw ? (t: string) => t : maskProfanity;
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: p.authorName ? m(p.authorName) : null,
    authorNameJa: p.authorNameJa ? m(p.authorNameJa) : null,
    authorHandle: p.authorHandle ?? null,
    authorAvatarUrl: p.authorAvatarUrl ?? null,
    categoryId: p.categoryId,
    lang: p.lang,
    slug: p.slug,
    titleEn: m(p.titleEn),
    titleJa: m(p.titleJa),
    excerptEn: m(p.excerptEn),
    excerptJa: m(p.excerptJa),
    cover: p.cover,
    coverLabel: p.coverLabel,
    coverCredit: p.coverCredit,
    status: p.status,
    translationStatus: p.translationStatus,
    isHidden: p.isHidden,
    density: p.density,
    score: p.score,
    tags: (p.tags ?? []) as string[],
    likes: p.likes,
    saves: p.saves,
    comments: p.comments,
    readMins: Math.max(1, Math.round(Number(p.bodyChars) / 1100)),
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Client-facing shape. Parses tags JSON; includes the embedded author summary
 * when called with a joined row. Timestamps are raw ms (portable).
 * Read-time profanity masking, same rules as publicPostCard: raw=true is for
 * the OWNER/ADMIN view only (the editor round-trips this shape back into the
 * DB, so a masked body here would permanently destroy the original text). */
export function publicPost(p: PostRow | PostWithAuthor, raw = false) {
  const a = p as PostWithAuthor;
  const tags: string[] = p.tags ?? [];
  const m = raw ? (t: string) => t : maskProfanity;
  const mh = raw ? (t: string) => t : maskProfanityHtml;
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: a.authorName ? m(a.authorName) : null,
    authorNameJa: a.authorNameJa ? m(a.authorNameJa) : null,
    authorHandle: a.authorHandle ?? null,
    authorAvatarUrl: a.authorAvatarUrl ?? null,
    categoryId: p.categoryId,
    lang: p.lang,
    slug: p.slug,
    titleEn: m(p.titleEn),
    titleJa: m(p.titleJa),
    excerptEn: m(p.excerptEn),
    excerptJa: m(p.excerptJa),
    bodyEn: mh(p.bodyEn),
    bodyJa: mh(p.bodyJa),
    cover: p.cover,
    coverLabel: p.coverLabel,
    coverCredit: p.coverCredit,
    status: p.status,
    translationStatus: p.translationStatus,
    isHidden: p.isHidden,
    hiddenReason: p.hiddenReason,
    density: p.density,
    score: p.score,
    tags,
    likes: p.likes,
    saves: p.saves,
    comments: p.comments,
    // Same ~1100 chars/min as publicPostCard's bodyChars, so the owner list
    // (this shape) shows the same read time as every public card surface.
    readMins: Math.max(1, Math.round(((p.bodyEn ?? '').length + (p.bodyJa ?? '').length) / 1100)),
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
