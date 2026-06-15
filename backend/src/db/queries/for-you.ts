/* ============================================================================
 * THE "FOR YOU" FEED — one file, the whole algorithm.
 * ============================================================================
 * A pure-math content-based recommender (no ML / embeddings). Read top-to-bottom
 * — the pipeline runs in the same order the sections appear:
 *
 *   1. TASTE PROFILE  — what this user likes, learned from their engagement.
 *   2. CANDIDATE FETCH — pull the recent + followed posts to choose from.
 *   3. RANKING         — score every candidate against the profile, diversify.
 *   4. ORCHESTRATOR    — forYouFeed(): runs 1→3 and returns the finished feed.
 *
 * Scoring, in one line:
 *   trend(post) = (likes + 2·comments + 0.5·saves) / (age_hours + 2)^1.4   (hotness)
 *   match(post) = catAff[cat] + tagWeight·Σ_tags idf(tag)·tagAff[tag]      (taste)
 *   final(post) = base(follow/trending/normal) · (1 + match) · (trend + 0.05)
 *                 · 0.35 if already seen      (pushed down, not hidden)
 *   …then a diversity pass caps per-author + followed share and weaves in fresh
 *   posts so the feed explores instead of ossifying.
 *
 * NOTE: *Trending* is a separate, non-personalized algorithm — it lives in its
 * own file (`trending.ts`, an hourly cron that writes posts.trend_score). For You
 * does NOT depend on it; it computes its own live hotness term (`trend`) so the
 * feed stays correct between cron runs. At 50K users this stays cheap: the taste
 * profile is cached (1h TTL), so a feed load is one candidate query + one cached
 * profile read + in-memory scoring.
 * ========================================================================== */

import { eq, and, desc, sql, inArray, type SQL } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users, follows, postLikes, postReads, tags, userAffinity } from '../schema';
import { id as newId } from '../../lib/ids';
import { cardCols, publicPostCard, type PostCardRow } from './posts';
import { trendingTop } from './trending';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ============================================================================
 * 1. TASTE PROFILE
 * ----------------------------------------------------------------------------
 * Per-user affinity across two dimensions: category and tag. Signal:
 * read×1 + save×2 + like×3 + comment×4, each event decayed by a 30-day half-life
 * (recent taste dominates), summed per key, normalized to max 1 within each
 * dimension. Cached in `user_affinity` and recomputed only when stale, so a feed
 * read is a single indexed lookup, not a per-request aggregation.
 * ========================================================================== */

const TTL = 1 * HOUR;        // recompute a user's snapshot at most once per hour
const WINDOW = 90 * DAY;     // engagement older than this is ignored entirely
const HALF_LIFE = 30 * DAY;  // a signal loses half its weight every 30 days

export type Dimension = 'cat' | 'tag';

export interface Affinity {
  cat: Map<string, number>;
  tag: Map<string, number>;
}

export const emptyAffinity = (): Affinity => ({ cat: new Map(), tag: new Map() });

/** Raw weights per dimension, recency-decayed, then each dimension normalized to
 *  max 1. One query: an event CTE feeds two aggregates (category + tags). */
async function computeAffinity(db: DB, userId: string): Promise<Affinity> {
  const now = Date.now();
  const since = now - WINDOW;
  // decay(created_at) = 0.5 ^ (age / HALF_LIFE) — folded into each event's weight.
  const decay = sql.raw(`power(0.5, GREATEST(0, ${now}::bigint - created_at)::float / ${HALF_LIFE}.0)`);
  const rows = await db.execute(sql`
    WITH ev AS (
      SELECT post_id, base * (${decay}) AS weight FROM (
        SELECT post_id, created_at, 1.0 AS base FROM post_reads    WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, 2.0 AS base FROM post_saves    WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, 3.0 AS base FROM post_likes    WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, 4.0 AS base FROM post_comments WHERE user_id = ${userId} AND created_at > ${since}
      ) s
    )
    SELECT 'cat' AS dim, p.category_id AS key, SUM(ev.weight) AS weight
      FROM ev JOIN posts p ON p.id = ev.post_id GROUP BY p.category_id
    UNION ALL
    SELECT 'tag' AS dim, t.tag AS key, SUM(ev.weight) AS weight
      FROM ev JOIN posts p ON p.id = ev.post_id
      CROSS JOIN LATERAL jsonb_array_elements_text(p.tags) AS t(tag)
      GROUP BY t.tag
  `);

  const aff = emptyAffinity();
  for (const r of rows.rows as Array<{ dim: Dimension; key: string; weight: string }>) {
    if (!r.key) continue;
    aff[r.dim].set(r.key, Number(r.weight));
  }
  normalize(aff.cat);
  normalize(aff.tag);
  return aff;
}

function normalize(m: Map<string, number>): void {
  let max = 0;
  for (const v of m.values()) if (v > max) max = v;
  if (max > 0) for (const [k, v] of m) m.set(k, v / max);
}

/** Persist a freshly computed snapshot (replace the user's rows). */
async function persistAffinity(db: DB, userId: string, aff: Affinity): Promise<void> {
  const now = Date.now();
  const values = (['cat', 'tag'] as const).flatMap((dim) =>
    [...aff[dim]].map(([key, weight]) => ({ id: newId('aff'), userId, dimension: dim, key, weight, updatedAt: now })),
  );
  await db.delete(userAffinity).where(eq(userAffinity.userId, userId));
  if (values.length) {
    await db.insert(userAffinity).values(values);
  } else {
    // No engagement: stamp a sentinel so we don't recompute on every request.
    await db.insert(userAffinity).values({
      id: newId('aff'), userId, dimension: 'cat', key: '', weight: 0, updatedAt: now,
    });
  }
}

/** The user's taste profile — cached snapshot if fresh, else recompute + persist. */
export async function userAffinityFor(db: DB, userId: string): Promise<Affinity> {
  const cached = await db
    .select({ dimension: userAffinity.dimension, key: userAffinity.key, weight: userAffinity.weight, updatedAt: userAffinity.updatedAt })
    .from(userAffinity)
    .where(eq(userAffinity.userId, userId));

  const fresh = cached.length > 0 && cached.every((r) => Date.now() - r.updatedAt < TTL);
  if (fresh) {
    const aff = emptyAffinity();
    for (const r of cached) {
      if (r.key === '') continue; // sentinel
      aff[r.dimension as Dimension].set(r.key, r.weight);
    }
    return aff;
  }

  const aff = await computeAffinity(db, userId);
  await persistAffinity(db, userId, aff);
  return aff;
}

/* ============================================================================
 * 2. CANDIDATE FETCH
 * ----------------------------------------------------------------------------
 * Dumb SQL — just "go get recent posts to choose from". Two pools: everyone's
 * recent posts, and (separately, so they're guaranteed present) posts from the
 * authors this user follows. These get merged + deduped before ranking.
 * ========================================================================== */

/** SQL trending (hotness) score for a published post, decayed by age. Computed
 *  live so the feed is correct between trend-cron runs. */
const trendExpr = () => sql<number>`
  (${posts.likes} + 2 * ${posts.comments} + 0.5 * ${posts.saves})::float
  / power(((${Date.now()}::bigint - ${posts.publishedAt}) / ${sql.raw(`${HOUR}.0`)}) + 2, 1.4)
`;

export type FeedCard = PostCardRow & { trend: number };

/** Same hotness formula as `trendExpr`, in JS — used to give a `trend` to cards
 *  that arrive without one (the cached trending list, which is plain card shape). */
function computeTrend(p: PostCardRow): number {
  const ageH = (Date.now() - (p.publishedAt ?? p.createdAt)) / HOUR;
  return ((p.likes + 2 * p.comments + 0.5 * p.saves) / Math.pow(ageH + 2, 1.4));
}

/** Run a candidate query with the live trend score, card shape (no bodies). */
async function runCandidates(db: DB, where: SQL | undefined, poolSize: number): Promise<FeedCard[]> {
  return (await db
    .select({ ...cardCols, trend: trendExpr() })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(poolSize)) as FeedCard[];
}

/** Most recent published posts (candidate pool). */
export function feedCandidates(db: DB, opts: { poolSize?: number } = {}): Promise<FeedCard[]> {
  return runCandidates(db, eq(posts.status, 'published'), opts.poolSize ?? 120);
}

/** Recent published posts by the authors a user follows. Guarantees followed
 *  posts are present even when they fall outside the global recent slice.
 *  Empty author set → empty result. */
export function followedCandidates(db: DB, authorIds: string[], opts: { poolSize?: number } = {}): Promise<FeedCard[]> {
  if (!authorIds.length) return Promise.resolve([]);
  return runCandidates(db, and(eq(posts.status, 'published'), inArray(posts.authorId, authorIds)), opts.poolSize ?? 120);
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

/* ============================================================================
 * 3. RANKING
 * ----------------------------------------------------------------------------
 * The brain. Score each candidate against the taste profile (weighting rare
 * tags harder via IDF), then a diversity pass so the feed stays varied + fresh.
 * Pure + deterministic functions — easy to unit test.
 * ========================================================================== */

/** Inverse document frequency per tag: rare tags are more informative, so they
 *  weight a match harder (TF-IDF). idf = ln(1 + N / (1 + postsWithTag)), where N
 *  is the published-post count. A Map missing a tag → idf 0 (ignored). Cheap to
 *  build (one scan of the small `tags` counter table) and safe to cache. */
export async function tagIdf(db: DB): Promise<Map<string, number>> {
  const [[total], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(posts).where(eq(posts.status, 'published')),
    db.select({ id: tags.id, postCount: tags.postCount }).from(tags),
  ]);
  const N = total?.n ?? 0;
  const idf = new Map<string, number>();
  for (const r of rows) idf.set(r.id, Math.log(1 + N / (1 + r.postCount)));
  return idf;
}

export interface RankOpts {
  affinity: Affinity;        // category + tag taste, learned from engagement
  following: Set<string>;
  seen: Set<string>;
  /** Per-tag IDF weights (from tagIdf). Missing/empty → tags don't contribute. */
  idf?: Map<string, number>;
  /** Authoritative site-wide trending ids (from trending.ts). When given, these
   *  drive the `trending` base multiplier instead of the candidate-quartile guess. */
  trendingIds?: Set<string>;
  /** Multiplier for followed authors (the For You feed leans hard on follows). */
  followBoost?: number;
  /** Diversity knobs. Defaults are sensible for a real feed. */
  maxPerAuthor?: number;     // cap how many posts one author can take up top
  followCap?: number;        // max share of the feed that may be followed-author posts
  exploreEvery?: number;     // every Nth slot, surface the freshest under-ranked post (0 = off)
  /** How hard the tag-IDF match term lifts a post. */
  tagWeight?: number;
}

/** Score one candidate against the taste profile. The match term is a weighted
 *  dot product of the user's taste (category + tags) and the post's — pure
 *  content matching, no ML. trend already folds engagement + recency; the +0.05
 *  floor keeps zero-engagement fresh posts from vanishing. */
function scoreCard(p: FeedCard, opts: RankOpts, trendingIds: Set<string>, followBoost: number): number {
  const base = opts.following.has(p.authorId) ? followBoost : trendingIds.has(p.id) ? 2.0 : 1.0;
  const catAff = opts.affinity.cat.get(p.categoryId) ?? 0;
  const tagWeight = opts.tagWeight ?? 1.5;
  let tagMatch = 0;
  for (const t of p.tags ?? []) {
    const aff = opts.affinity.tag.get(t);
    if (!aff) continue;
    tagMatch += (opts.idf?.get(t) ?? 0) * aff; // rare tag the user likes ⇒ strong, specific lift
  }
  const match = catAff + tagWeight * tagMatch;
  const seenPenalty = opts.seen.has(p.id) ? 0.35 : 1.0;
  return base * (1 + match) * (p.trend + 0.05) * seenPenalty;
}

/** Blend the pools into one ranked list, then diversify it:
 *  - no single author floods the top (`maxPerAuthor`)
 *  - followed authors can't swamp the whole feed (`followCap`)
 *  - light exploration: every Nth slot surfaces the freshest under-ranked post,
 *    so brand-new writers get a chance and the feed doesn't ossify. */
export function rankFeed(cands: FeedCard[], opts: RankOpts): FeedCard[] {
  // Trending pool: the authoritative site-wide list if supplied; otherwise the
  // top quartile by live trend score among candidates (logged-out / cold-cache).
  const byTrend = [...cands].sort((a, b) => b.trend - a.trend);
  const trendingIds = opts.trendingIds?.size
    ? opts.trendingIds
    : new Set(byTrend.slice(0, Math.max(5, Math.ceil(cands.length / 4))).map((p) => p.id));
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

  // Dedupe (an exploration pick is also still in `tail`); keep first occurrence,
  // so nothing is rendered — or keyed in the UI — twice.
  const seen = new Set<string>();
  return out.concat(tail).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/** Record (or refresh) a read — the lightest engagement signal. One row per
 *  (post, user); re-reading just refreshes the timestamp. */
export async function recordRead(db: DB, postId: string, userId: string): Promise<void> {
  await db
    .insert(postReads)
    .values({ id: newId('read'), postId, userId, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: [postReads.postId, postReads.userId],
      set: { createdAt: Date.now() },
    });
}

/* ============================================================================
 * 4. ORCHESTRATOR
 * ----------------------------------------------------------------------------
 * The one entry point the route calls. Runs the whole pipeline and returns the
 * finished, client-shaped feed slice. `userId` null = logged out: pure
 * trending + fresh (also what SSR / crawlers get).
 * ========================================================================== */

export interface ForYouOpts {
  userId: string | null;
  limit?: number;   // feed page size (default 24, max 50)
  offset?: number;  // feed page offset
  kv?: KVNamespace; // shared trending hot-cache, passed through to trendingTop
}

export interface ForYouResult {
  feed: ReturnType<typeof publicPostCard>[];
  nextOffset: number | null;
  personalized: boolean;
}

export async function forYouFeed(db: DB, opts: ForYouOpts): Promise<ForYouResult> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
  const offset = Math.max(0, opts.offset ?? 0);
  const uid = opts.userId;

  // Followed authors first, so we can pull their recent posts into the pool.
  // The trending top is fetched in parallel: it's both a candidate source (so a
  // momentum-spiking older post that fell out of the recent slice still appears)
  // and the authoritative `trending` signal the ranker boosts.
  const following = uid ? await followedAuthorIds(db, uid) : new Set<string>();
  const [global, followed, trending] = await Promise.all([
    feedCandidates(db),
    following.size ? followedCandidates(db, [...following]) : Promise.resolve<FeedCard[]>([]),
    trendingTop(db, { limit: 20, kv: opts.kv }),
  ]);

  // Candidate pool = global recent ∪ followed authors' recent posts ∪ trending
  // (deduped). Trending cards arrive without a live trend score, so compute one.
  const byId = new Map<string, FeedCard>();
  for (const p of global) byId.set(p.id, p);
  for (const p of followed) byId.set(p.id, p);
  for (const p of trending) if (!byId.has(p.id)) byId.set(p.id, { ...p, trend: computeTrend(p) });
  const trendingIds = new Set(trending.map((p) => p.id));
  const cands = [...byId.values()];

  // Per-user signals (taste + seen) plus viewer-independent tag-IDF.
  const [affinity, seen, idf] = uid
    ? await Promise.all([
        userAffinityFor(db, uid),
        seenPostIds(db, uid, cands.map((p) => p.id)),
        tagIdf(db),
      ])
    : [emptyAffinity(), new Set<string>(), new Map<string, number>()];

  const ranked = rankFeed(cands, { affinity, following, seen, idf, trendingIds });
  const page = ranked.slice(offset, offset + limit);

  const strip = (p: FeedCard) => { const { trend: _trend, ...rest } = p; return publicPostCard(rest); };
  return {
    feed: page.map(strip),
    nextOffset: offset + limit < ranked.length ? offset + limit : null,
    personalized: !!uid,
  };
}
