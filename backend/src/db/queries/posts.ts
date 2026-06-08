import { eq, and, desc, getTableColumns } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../schema';
import { posts, users } from '../schema';
import { id as newId } from '../../lib/ids';
import { slugify } from './categories';

type DB = DrizzleD1Database<typeof schema>;
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
  while (await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, candidate)).get()) {
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
    status: input.status,
    density: input.density,
    score: input.score,
    tags: JSON.stringify(input.tags),
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

export function getPostById(db: DB, id: string): Promise<PostRow | undefined> {
  return db.select().from(posts).where(eq(posts.id, id)).get();
}

/** Author summary embedded in public post responses (avoids a separate lookup). */
const authorCols = {
  authorName: users.displayName,
};
export type PostWithAuthor = PostRow & { authorName: string | null };

export function getPostWithAuthor(db: DB, id: string): Promise<PostWithAuthor | undefined> {
  return db
    .select({ ...getTableColumns(posts), ...authorCols })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, id))
    .get() as Promise<PostWithAuthor | undefined>;
}

export function getPostWithAuthorBySlug(db: DB, slug: string): Promise<PostWithAuthor | undefined> {
  return db
    .select({ ...getTableColumns(posts), ...authorCols })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.slug, slug))
    .get() as Promise<PostWithAuthor | undefined>;
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
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .all() as Promise<PostWithAuthor[]>;
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
  status?: PostStatus;
  density?: PostDensity;
  score?: number | null;
  tags?: string[];
}

export async function updatePost(db: DB, id: string, patch: UpdatePostInput): Promise<PostRow | undefined> {
  const set: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
  if (patch.tags !== undefined) set.tags = JSON.stringify(patch.tags);
  await db.update(posts).set(set).where(eq(posts.id, id));
  return getPostById(db, id);
}

export function setPublishedAt(db: DB, id: string, at: number | null): Promise<unknown> {
  return db.update(posts).set({ publishedAt: at }).where(eq(posts.id, id));
}

export function deletePost(db: DB, id: string): Promise<unknown> {
  return db.delete(posts).where(eq(posts.id, id));
}

/** Client-facing shape. Parses tags JSON; includes the embedded author summary
 * when called with a joined row. Timestamps are raw ms (portable). */
export function publicPost(p: PostRow | PostWithAuthor) {
  const a = p as PostWithAuthor;
  let tags: string[] = [];
  try { tags = JSON.parse(p.tags); } catch { tags = []; }
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: a.authorName ?? null,
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
