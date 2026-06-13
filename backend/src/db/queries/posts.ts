import { eq, and, desc, sql, getTableColumns } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users } from '../schema';
import { id as newId } from '../../lib/ids';
import { slugify } from './categories';

export type PostRow = typeof posts.$inferSelect;
export type PostStatus = 'draft' | 'published';
export type PostDensity = 'compact' | 'normal' | 'relaxed';

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
  density: PostDensity;
  score: number | null;
  tags: string[];
}

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
  const row: PostRow = {
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
    density: input.density,
    score: input.score,
    tags: input.tags,
    likes: 0,
    saves: 0,
    comments: 0,
    publishedAt: input.status === 'published' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(posts).values(row);
  return row;
}

export async function getPostById(db: DB, id: string): Promise<PostRow | undefined> {
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  return row;
}

/** Author summary embedded in public post responses (avoids a separate lookup). */
const authorCols = {
  authorName: users.displayName,
  authorNameJa: users.displayNameJa,
  authorHandle: users.handle,
};
export type PostWithAuthor = PostRow & {
  authorName: string | null;
  authorNameJa: string | null;
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

/** Card column set for list surfaces (home feed): everything except the bodies,
 * plus a server-side character count so readMins never ships body bytes. */
const { bodyEn: _cardBodyEn, bodyJa: _cardBodyJa, ...postCardCols } = getTableColumns(posts);
export const cardCols = {
  ...postCardCols,
  ...authorCols,
  bodyChars: sql<number>`char_length(coalesce(${posts.bodyEn}, '')) + char_length(coalesce(${posts.bodyJa}, ''))`,
};
export type PostCardRow = Omit<PostWithAuthor, 'bodyEn' | 'bodyJa'> & { bodyChars: number };

/** Newest published posts, card shape (no bodies selected at all). */
export function listRecentPosts(db: DB, limit: number): Promise<PostCardRow[]> {
  return db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit) as Promise<PostCardRow[]>;
}

export interface ListPostsFilter {
  categoryId?: string;
  authorId?: string;
  status?: PostStatus;
}

export function listPosts(db: DB, f: ListPostsFilter): Promise<PostWithAuthor[]> {
  const where = [
    f.categoryId ? eq(posts.categoryId, f.categoryId) : undefined,
    f.authorId ? eq(posts.authorId, f.authorId) : undefined,
    f.status ? eq(posts.status, f.status) : undefined,
  ].filter(Boolean);
  return db
    .select({ ...getTableColumns(posts), ...authorCols })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt)) as Promise<PostWithAuthor[]>;
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
 * plus readMins derived from the body character count (~1100 chars/min). */
export function publicPostCard(p: PostCardRow) {
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: p.authorName ?? null,
    authorNameJa: p.authorNameJa ?? null,
    authorHandle: p.authorHandle ?? null,
    categoryId: p.categoryId,
    lang: p.lang,
    slug: p.slug,
    titleEn: p.titleEn,
    titleJa: p.titleJa,
    excerptEn: p.excerptEn,
    excerptJa: p.excerptJa,
    cover: p.cover,
    coverLabel: p.coverLabel,
    coverCredit: p.coverCredit,
    status: p.status,
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
 * when called with a joined row. Timestamps are raw ms (portable). */
export function publicPost(p: PostRow | PostWithAuthor) {
  const a = p as PostWithAuthor;
  const tags: string[] = p.tags ?? [];
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: a.authorName ?? null,
    authorNameJa: a.authorNameJa ?? null,
    authorHandle: a.authorHandle ?? null,
    categoryId: p.categoryId,
    lang: p.lang,
    slug: p.slug,
    titleEn: p.titleEn,
    titleJa: p.titleJa,
    excerptEn: p.excerptEn,
    excerptJa: p.excerptJa,
    bodyEn: p.bodyEn,
    bodyJa: p.bodyJa,
    cover: p.cover,
    coverLabel: p.coverLabel,
    coverCredit: p.coverCredit,
    status: p.status,
    density: p.density,
    score: p.score,
    tags,
    likes: p.likes,
    saves: p.saves,
    comments: p.comments,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
