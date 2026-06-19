import { eq, and, desc, sql, count } from 'drizzle-orm';
import type { DB } from '../client';
import { users, posts } from '../schema';
import { slugify } from './categories';
import { notHidden } from './posts';

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
    .innerJoin(posts, and(eq(posts.authorId, users.id), eq(posts.status, 'published'), notHidden))
    .groupBy(users.id)
    .orderBy(desc(score))
    .limit(limit);
}

