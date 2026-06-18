import { eq, and, desc, sql, count, type SQL } from 'drizzle-orm';
import type { DB } from '../client';
import { users, posts, follows } from '../schema';
import { slugify } from './categories';
import { notHidden } from './posts';

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

/** Live follower count for the author row (index-backed by follows_followee_idx).
 *  Correlated subquery so it survives the posts groupBy without multiplying rows. */
const followersExpr = sql<number>`(SELECT count(*)::int FROM ${follows} WHERE ${follows.followeeId} = ${users.id})`;

/** Trending-flavored writer popularity. Lifetime likes form the base; followers
 *  (social proof), output volume, and likes earned on *recent* posts (momentum)
 *  each add weight — so a prolific, followed writer who is still publishing beats
 *  a one-hit author. Ranks both the featured podium and the "Most read" directory. */
function writerScore(now: number): SQL<number> {
  const cutoff = now - NINETY_DAYS;
  return sql<number>`(
    coalesce(sum(${posts.likes}), 0)
    + 5 * count(${posts.id})
    + 10 * (SELECT count(*) FROM ${follows} WHERE ${follows.followeeId} = ${users.id})
    + 2 * coalesce(sum(${posts.likes}) FILTER (WHERE ${posts.publishedAt} > ${cutoff}), 0)
  )`;
}

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

export interface AuthorRow {
  id: string;
  handle: string;
  displayName: string;
  displayNameJa: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
  bioJa: string | null;
  role: string;
  joinedAt: number;
  postCount: number;
  likes: number;
  followers: number;
}

/** Name/handle match for the writer search bar — substring (EN + JA name, handle)
 *  plus a trigram-similarity catch so a one-typo name ("shirakaw") still resolves.
 *  Sub-2-char queries are ignored upstream so a lone letter can't match-all. */
function authorNameMatch(q: string): SQL {
  const esc = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = `%${esc}%`;
  return sql`(${users.displayName} ILIKE ${like} OR ${users.displayNameJa} ILIKE ${like} OR ${users.handle} ILIKE ${like}
    OR similarity(${users.displayName}, ${q}) > 0.3 OR similarity(coalesce(${users.displayNameJa}, ''), ${q}) > 0.3)`;
}

/** Full writers directory: every author with at least one published post, with
 *  bio/role, post/like/follower counts. sort 'top' (trending writer score) | 'new'
 *  (joined). Optional `q` turns it into the writer search (relevance-ordered).
 *  Paginated for the SSR Writers page. */
export function listAuthors(
  db: DB,
  { sort = 'top', q, limit = 24, offset = 0, now = Date.now() }:
    { sort?: 'top' | 'new'; q?: string; limit?: number; offset?: number; now?: number },
) {
  const score = writerScore(now);
  const needle = q?.trim();
  const order = needle
    ? sql`GREATEST(similarity(${users.displayName}, ${needle}), similarity(coalesce(${users.displayNameJa}, ''), ${needle}), similarity(${users.handle}, ${needle})) DESC, ${score} DESC`
    : sort === 'new' ? desc(users.createdAt) : desc(score);
  const where = needle
    ? and(eq(posts.status, 'published'), notHidden, authorNameMatch(needle))
    : and(eq(posts.status, 'published'), notHidden);
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
      followers: followersExpr,
    })
    .from(users)
    .innerJoin(posts, eq(posts.authorId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(order)
    .limit(limit)
    .offset(offset) as Promise<AuthorRow[]>;
}

/** The featured podium — the top writers by trending score. Same ranking as the
 *  "Most read" directory's first rows, surfaced as a hero strip on page 1. */
export function listFeaturedWriters(db: DB, limit = 3, now = Date.now()) {
  return listAuthors(db, { sort: 'top', limit, offset: 0, now });
}

/** Count of authors with at least one published post — or, when `q` is given, the
 *  count matching that name search (keeps the Writers pager honest). */
export async function countAuthors(db: DB, q?: string): Promise<number> {
  const needle = q?.trim();
  if (!needle) {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${posts.authorId})::int` })
      .from(posts)
      .where(and(eq(posts.status, 'published'), notHidden));
    return row?.n ?? 0;
  }
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${users.id})::int` })
    .from(users)
    .innerJoin(posts, eq(posts.authorId, users.id))
    .where(and(eq(posts.status, 'published'), notHidden, authorNameMatch(needle)));
  return row?.n ?? 0;
}
