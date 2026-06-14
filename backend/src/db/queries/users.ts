import { eq, and, desc, sql, count } from 'drizzle-orm';
import type { DB } from '../client';
import { users, posts } from '../schema';
import { slugify } from './categories';

export const HANDLE_RE = /^[a-z0-9-]{3,30}$/;

/** Unique handle from a display name (id tail fallback, numeric suffix on collision). */
export async function uniqueHandle(db: DB, displayName: string, idTail: string): Promise<string> {
  const base = slugify(displayName).slice(0, 30) || `user-${idTail}`;
  let candidate = base.length >= 3 ? base : `${base}-${idTail}`.slice(0, 30);
  let n = 1;
  while ((await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate)))[0]) {
    candidate = `${base.slice(0, 26)}-${++n}`;
  }
  return candidate;
}

export async function getUserByHandle(db: DB, handle: string) {
  const [u] = await db.select().from(users).where(eq(users.handle, handle));
  return u;
}

export async function getUserById(db: DB, id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

export async function handleTaken(db: DB, handle: string, exceptUserId?: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle));
  return !!row && row.id !== exceptUserId;
}

/** Top writers for the home authors grid: ranked by published-post count plus
 * likes received. Inner join = only authors with at least one published post.
 * (Phase 6 may fold a real trend score into this.) */
export function listTopAuthors(db: DB, limit = 15) {
  const score = sql<number>`count(${posts.id}) + coalesce(sum(${posts.likes}), 0)`;
  return db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      displayNameJa: users.displayNameJa,
      avatarUrl: users.avatarUrl,
      location: users.location,
      postCount: count(posts.id),
      likes: sql<number>`coalesce(sum(${posts.likes}), 0)::int`,
    })
    .from(users)
    .innerJoin(posts, and(eq(posts.authorId, users.id), eq(posts.status, 'published')))
    .groupBy(users.id)
    .orderBy(desc(score))
    .limit(limit);
}

/** Full writers directory: every author with at least one published post, with
 *  bio/role + post and like counts. sort 'top' (engagement) | 'new' (joined).
 *  Paginated for the SSR Writers page. */
export function listAuthors(db: DB, { sort = 'top', limit = 24, offset = 0 }: { sort?: 'top' | 'new'; limit?: number; offset?: number }) {
  const score = sql<number>`count(${posts.id}) + coalesce(sum(${posts.likes}), 0)`;
  const order = sort === 'new' ? desc(users.createdAt) : desc(score);
  return db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      displayNameJa: users.displayNameJa,
      avatarUrl: users.avatarUrl,
      location: users.location,
      bio: users.bio,
      bioJa: users.bioJa,
      role: users.role,
      joinedAt: users.createdAt,
      postCount: count(posts.id),
      likes: sql<number>`coalesce(sum(${posts.likes}), 0)::int`,
    })
    .from(users)
    .innerJoin(posts, and(eq(posts.authorId, users.id), eq(posts.status, 'published')))
    .groupBy(users.id)
    .orderBy(order)
    .limit(limit)
    .offset(offset);
}

/** Count of authors with at least one published post (for Writers pagination). */
export async function countAuthors(db: DB): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${posts.authorId})::int` })
    .from(posts)
    .where(eq(posts.status, 'published'));
  return row?.n ?? 0;
}
