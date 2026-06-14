/* For You feed algo. Three candidate pools — following / trending / fresh —
 * scored into one ranked list, personalized by per-category affinity learned
 * from the user's reads, likes and comments. All computed on the fly: at this
 * scale (hundreds of posts) one candidate query + one affinity query beats a
 * cron. Revisit in Phase 6 when posts.trend_score lands.
 *
 *   trend(post)  = (likes + 2·comments + 0.5·saves) / (age_hours + 2)^1.4
 *   affinity[cat] = Σ 1.0·read + 3.0·like + 4.0·comment   (90 days, normalized)
 *   final(post)  = base(pool) · (1 + affinity[cat]) · (trend + 0.05)
 *                  · 0.35 if already read/liked (pushed down, not hidden)
 */
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users, follows, postLikes, postReads } from '../schema';
import { id as newId } from '../../lib/ids';
import { cardCols, type PostCardRow } from './posts';
import type { Affinity } from './affinity';

const HOUR = 3_600_000;

/** SQL trending score for a published post, decayed by age. */
const trendExpr = () => sql<number>`
  (${posts.likes} + 2 * ${posts.comments} + 0.5 * ${posts.saves})::float
  / power(((${Date.now()}::bigint - ${posts.publishedAt}) / ${sql.raw(`${HOUR}.0`)}) + 2, 1.4)
`;

export type FeedCard = PostCardRow & { trend: number };

/** Most recent published posts (candidate pool), card shape + trend, no body. */
export async function feedCandidates(db: DB, poolSize = 120): Promise<FeedCard[]> {
  return (await db
    .select({ ...cardCols, trend: trendExpr() })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(poolSize)) as FeedCard[];
}

/** Recent published posts by the authors a user follows. Guarantees followed
 *  posts are present even when they fall outside the global recent slice.
 *  Empty author set → empty result. */
export async function followedCandidates(
  db: DB,
  authorIds: string[],
  poolSize = 120,
): Promise<FeedCard[]> {
  if (!authorIds.length) return [];
  return (await db
    .select({ ...cardCols, trend: trendExpr() })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.status, 'published'), inArray(posts.authorId, authorIds)))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(poolSize)) as FeedCard[];
}

/** Ids of authors the user follows. */
export async function followedAuthorIds(db: DB, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId));
  return new Set(rows.map((r) => r.id));
}

/** Post ids the user has already read or liked (among the given candidates). */
export async function seenPostIds(db: DB, userId: string, postIds: string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  const [reads, likes] = await Promise.all([
    db.select({ id: postReads.postId }).from(postReads)
      .where(and(eq(postReads.userId, userId), inArray(postReads.postId, postIds))),
    db.select({ id: postLikes.postId }).from(postLikes)
      .where(and(eq(postLikes.userId, userId), inArray(postLikes.postId, postIds))),
  ]);
  return new Set([...reads, ...likes].map((r) => r.id));
}

export interface RankOpts {
  affinity: Affinity;        // per-category preference, learned from engagement
  following: Set<string>;
  seen: Set<string>;
  /** Multiplier for followed authors (the For You feed leans hard on follows). */
  followBoost?: number;
  /** Diversity knobs (Step 1). Defaults are sensible for a real feed. */
  maxPerAuthor?: number;     // cap how many posts one author can take up top
  followCap?: number;        // max share of the feed that may be followed-author posts
  exploreEvery?: number;     // every Nth slot, surface the freshest under-ranked post (0 = off)
}

/** Score a single candidate. Pulled out so the diversity pass and tests can reuse it.
 *  trend already folds engagement + recency; +0.05 floor keeps zero-engagement
 *  fresh posts from vanishing entirely. */
function scoreCard(p: FeedCard, opts: RankOpts, trendingIds: Set<string>, followBoost: number): number {
  const base = opts.following.has(p.authorId) ? followBoost : trendingIds.has(p.id) ? 2.0 : 1.0;
  const catAff = 1 + (opts.affinity.get(p.categoryId) ?? 0);
  const seenPenalty = opts.seen.has(p.id) ? 0.35 : 1.0;
  return base * catAff * (p.trend + 0.05) * seenPenalty;
}

/** Blend the pools into one ranked list, then diversify it (Step 1):
 *  - no single author floods the top (`maxPerAuthor`)
 *  - followed authors can't swamp the whole feed (`followCap`)
 *  - light exploration: every Nth slot surfaces the freshest under-ranked post,
 *    so brand-new writers get a chance and the feed doesn't ossify.
 *  Pure + deterministic — easy to test. */
export function rankFeed(cands: FeedCard[], opts: RankOpts): FeedCard[] {
  // Trending pool = top quartile by trend score among candidates.
  const byTrend = [...cands].sort((a, b) => b.trend - a.trend);
  const trendingIds = new Set(byTrend.slice(0, Math.max(5, Math.ceil(cands.length / 4))).map((p) => p.id));
  const followBoost = opts.followBoost ?? 6.0;
  const maxPerAuthor = opts.maxPerAuthor ?? 2;
  const followCap = opts.followCap ?? 0.6;
  const exploreEvery = opts.exploreEvery ?? 6;

  const ranked = [...cands].sort(
    (a, b) => scoreCard(b, opts, trendingIds, followBoost) - scoreCard(a, opts, trendingIds, followBoost),
  );

  // Greedy diversity pass: place a post unless its author already hit the cap or
  // followed posts already exceed their share — deferred posts go to a tail bucket
  // (kept in score order) so nothing is dropped, just pushed down.
  const out: FeedCard[] = [];
  const tail: FeedCard[] = [];
  const perAuthor = new Map<string, number>();
  let followedUsed = 0;
  for (const p of ranked) {
    const count = perAuthor.get(p.authorId) ?? 0;
    const isFollowed = opts.following.has(p.authorId);
    const followShare = out.length ? followedUsed / out.length : 0;
    if (count >= maxPerAuthor) { tail.push(p); continue; }
    if (isFollowed && out.length >= 5 && followShare > followCap) { tail.push(p); continue; }
    out.push(p);
    perAuthor.set(p.authorId, count + 1);
    if (isFollowed) followedUsed++;
  }

  // Exploration: weave in the freshest posts that didn't rank up, at fixed slots.
  if (exploreEvery > 0) {
    const placed = new Set(out.map((p) => p.id));
    const fresh = [...cands]
      .filter((p) => !placed.has(p.id))
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    let fi = 0;
    for (let slot = exploreEvery; slot < out.length && fi < fresh.length; slot += exploreEvery + 1) {
      out.splice(slot, 0, fresh[fi++]);
    }
  }

  return out.concat(tail);
}

/** Record (or refresh) a read. One row per (post, user). */
export async function recordRead(db: DB, postId: string, userId: string): Promise<void> {
  await db
    .insert(postReads)
    .values({ id: newId('read'), postId, userId, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: [postReads.postId, postReads.userId],
      set: { createdAt: Date.now() },
    });
}
