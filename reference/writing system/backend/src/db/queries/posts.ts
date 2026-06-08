import { eq, and, desc, getTableColumns } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../schema';
import { posts, users } from '../schema';
import { newId } from '../../lib/ids';
import { slugify } from './categories';

type DB = DrizzleD1Database<typeof schema>;
export type PostRow = typeof posts.$inferSelect;
export type PostStatus = 'draft' | 'published';
export type PostDensity = 'compact' | 'normal' | 'relaxed';

export interface NewPostInput {
  authorId: string;
  categoryId: string;
  title: string;
  excerpt: string;
  cover: string | null;
  body: string;
  status: PostStatus;
  density: PostDensity;
  score: number | null;
  tags: string[];
}

/** Derive a globally-unique slug from the title (fallback to the id tail). */
async function uniqueSlug(db: DB, title: string, idTail: string): Promise<string> {
  const base = slugify(title).slice(0, 60) || 'post';
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
  const now = new Date();
  const row: PostRow = {
    id,
    authorId: input.authorId,
    categoryId: input.categoryId,
    title: input.title,
    slug: await uniqueSlug(db, input.title, id.slice(-6)),
    excerpt: input.excerpt,
    cover: input.cover,
    body: input.body,
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

export function getPostById(db: DB, id: string): Promise<PostRow | undefined> {
  return db.select().from(posts).where(eq(posts.id, id)).get();
}

/** Author summary embedded in public post responses (avoids a separate lookup). */
const authorCols = {
  authorUsername: users.username,
  authorName: users.displayName,
  authorColor: users.avatarColor,
};
export type PostWithAuthor = PostRow & {
  authorUsername: string | null;
  authorName: string | null;
  authorColor: string | null;
};

export function getPostWithAuthor(db: DB, id: string): Promise<PostWithAuthor | undefined> {
  return db
    .select({ ...getTableColumns(posts), ...authorCols })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, id))
    .get() as Promise<PostWithAuthor | undefined>;
}

export function getPostBySlug(db: DB, slug: string): Promise<PostRow | undefined> {
  return db.select().from(posts).where(eq(posts.slug, slug)).get();
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
  title?: string;
  excerpt?: string;
  cover?: string | null;
  body?: string;
  status?: PostStatus;
  density?: PostDensity;
  score?: number | null;
  tags?: string[];
}

export async function updatePost(db: DB, id: string, patch: UpdatePostInput): Promise<PostRow | undefined> {
  await db.update(posts).set({ ...patch, updatedAt: new Date() }).where(eq(posts.id, id));
  return getPostById(db, id);
}

export function setPublishedAt(db: DB, id: string, at: Date | null): Promise<unknown> {
  return db.update(posts).set({ publishedAt: at }).where(eq(posts.id, id));
}

export function deletePost(db: DB, id: string): Promise<unknown> {
  return db.delete(posts).where(eq(posts.id, id));
}

/** Client-facing shape (ms timestamps, never internal Date objects). Includes
 * the embedded author summary when called with a joined row. */
export function publicPost(p: PostRow | PostWithAuthor) {
  const a = p as PostWithAuthor;
  return {
    id: p.id,
    authorId: p.authorId,
    authorUsername: a.authorUsername ?? null,
    authorName: a.authorName ?? null,
    authorColor: a.authorColor ?? null,
    categoryId: p.categoryId,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    cover: p.cover,
    body: p.body,
    status: p.status,
    density: p.density,
    score: p.score,
    tags: p.tags,
    likes: p.likes,
    saves: p.saves,
    comments: p.comments,
    publishedAt: p.publishedAt ? p.publishedAt.getTime() : null,
    createdAt: p.createdAt.getTime(),
    updatedAt: p.updatedAt.getTime(),
  };
}
