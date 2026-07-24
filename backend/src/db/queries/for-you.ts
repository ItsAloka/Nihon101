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
 * Scoring, in one line (X-like — preference FIRST, recency amplifies it):
 *   relevance(post) = 3·followed + 2·taste + 1.5·authorAff + 1·trendNorm   (do I want this?)
 *   recency(post)   = 0.5 ^ (age / 3 days)                                (freshness multiplier)
 *   final(post)     = (0.05 + relevance) · recency · 0.35^seen
 *   taste(post)     = catAff[cat] + tagWeight·Σ_tags idf(tag)·tagAff[tag]
 *   …then a diversity pass caps per-author + followed share and weaves in fresh
 *   posts so the feed explores instead of ossifying.
 * The taste profile is learned per-user from engagement (read1/save2/like3/comment4,
 * MINUS unlike3/unsave2), with three refinements that keep it honest: a per-post
 * re-engagement multiplier (one post you read+saved+commented beats three one-touch
 * posts), Bayesian shrinkage (a thin profile stays muted, confidence grows with
 * evidence), and entropy-driven exploration (the narrower your taste, the harder the
 * feed explores to avoid a bubble). Affinity spans category, tag, AND author.
 * Because recency only MULTIPLIES relevance, a fresh-but-irrelevant post can't
 * float up — only the recent posts you'd actually prefer do.
 *
 * NOTE: *Trending* is a separate, non-personalized algorithm (`trending.ts`, a
 * cron that writes posts.trend_score). For You's `trendNorm` term READS that shared
 * trend_score (see `trendSignal`), falling back to a live floor only when it hasn't
 * been computed yet — so For You and the Trending page agree by construction. At
 * 50K users this stays cheap: the taste profile is cached (1h TTL), so a feed load
 * is one candidate query + one cached profile read + in-memory scoring.
 * ========================================================================== */

import { eq, and, or, gt, lt, desc, sql, inArray, type SQL } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users, follows, postLikes, postReads, postSaves, postComments, tags, userAffinity, userSignals } from '../schema';
import { id as newId } from '../../lib/ids';
import { cardCols, publicPostCard, notHidden, descNullsLast, type PostCardRow } from './posts';

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

const TTL = 1 * HOUR;        // recompute a user's SLOW snapshot at most once per hour
// Two timescales. The SLOW scorecard = "what I generally like" (stable over weeks).
// The FAST scorecard = "what I'm into right now" (reacts in hours). The effective
// taste blends them, fast weighted heavier, so a sudden binge (e.g. travel) takes over
// the feed within the session and then fades back to the slow baseline when it stops.
const SLOW = { window: 30 * DAY, halfLife: 14 * DAY };
const FAST = { window: 12 * HOUR, halfLife: 6 * HOUR };
const SLOW_WEIGHT = 0.5;
const FAST_WEIGHT = 1.5;

export type Dimension = 'cat' | 'tag' | 'author';

export interface Affinity {
  cat: Map<string, number>;
  tag: Map<string, number>;
  author: Map<string, number>;   // taste for a specific writer (beyond a follow)
}

export const emptyAffinity = (): Affinity => ({ cat: new Map(), tag: new Map(), author: new Map() });

/** Bayesian-shrinkage divisor. normalize-to-max made a single like = full 1.0
 *  affinity (wildly overconfident for a 1-event user). Dividing by (max + K)
 *  instead keeps a thin profile MUTED and only lets a rich one approach 1, so the
 *  feed trusts taste in proportion to how much it actually knows. K≈3 events. */
const SHRINK_K = 3;

/** Raw weights per dimension, recency-decayed, then each dimension shrunk toward 0.
 *  One query, three stages:
 *    ev      — every engagement (read1/save2/like3/comment4 + negative unlike/unsave),
 *              each weighted base · 0.5^(age/HALF_LIFE).
 *    post_w  — collapse to one weight PER POST, lifted by a re-engagement multiplier:
 *              a post you read AND saved AND commented is worth far more than three
 *              one-touch posts. 1 + 0.3·(distinct event types − 1).
 *    aggregate post_w into the three taste dimensions (category, tag, author). */
async function computeAffinity(db: DB, userId: string, opts = SLOW): Promise<Affinity> {
  const now = Date.now();
  const since = now - opts.window;
  // decay(created_at) = 0.5 ^ (age / halfLife) — folded into each event's weight.
  const decay = sql`power(0.5, GREATEST(0, ${now}::bigint - created_at)::float / (${opts.halfLife})::float)`;
  const rows = await db.execute(sql`
    WITH ev AS (
      SELECT post_id, base, base * (${decay}) AS weight FROM (
        SELECT post_id, created_at, 1.0 AS base FROM post_reads    WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, 2.0 AS base FROM post_saves    WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, 3.0 AS base FROM post_likes    WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, 4.0 AS base FROM post_comments WHERE user_id = ${userId} AND created_at > ${since}
        UNION ALL
        SELECT post_id, created_at, base       FROM user_signals   WHERE user_id = ${userId} AND created_at > ${since}
      ) s
    ),
    post_w AS (
      SELECT post_id,
             SUM(weight) * (1 + 0.3 * (COUNT(DISTINCT base) - 1)) AS weight
      FROM ev GROUP BY post_id
    )
    SELECT 'cat' AS dim, p.category_id AS key, SUM(post_w.weight) AS weight
      FROM post_w JOIN posts p ON p.id = post_w.post_id GROUP BY p.category_id
    UNION ALL
    SELECT 'author' AS dim, p.author_id AS key, SUM(post_w.weight) AS weight
      FROM post_w JOIN posts p ON p.id = post_w.post_id GROUP BY p.author_id
    UNION ALL
    SELECT 'tag' AS dim, t.tag AS key, SUM(post_w.weight) AS weight
      FROM post_w JOIN posts p ON p.id = post_w.post_id
      CROSS JOIN LATERAL jsonb_array_elements_text(p.tags) AS t(tag)
      GROUP BY t.tag
  `);

  const aff = emptyAffinity();
  for (const r of rows.rows as Array<{ dim: Dimension; key: string; weight: string }>) {
    if (!r.key) continue;
    aff[r.dim].set(r.key, Number(r.weight));
  }
  shrink(aff.cat);
  shrink(aff.tag);
  shrink(aff.author);
  return aff;
}

/** Scale each weight by 1/(max + K), not 1/max. Strongest taste tops out below 1
 *  for a thin profile and approaches 1 only once it's well-fed; negatives stay
 *  negative. Confidence grows with evidence instead of snapping to full on event 1. */
function shrink(m: Map<string, number>): void {
  let max = 0;
  for (const v of m.values()) if (v > max) max = v;
  const denom = max + SHRINK_K;
  for (const [k, v] of m) m.set(k, v / denom);
}

/** Persist a freshly computed snapshot (replace the user's rows). */
async function persistAffinity(db: DB, userId: string, aff: Affinity): Promise<void> {
  const now = Date.now();
  const values = (['cat', 'tag', 'author'] as const).flatMap((dim) =>
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

  const aff = await computeAffinity(db, userId, SLOW);
  await persistAffinity(db, userId, aff);
  return aff;
}

/** The FAST scorecard — last few hours, 6h half-life, NOT cached (it must react within
 *  the session). Cheap: only a handful of recent events to aggregate. */
export function fastAffinityFor(db: DB, userId: string): Promise<Affinity> {
  return computeAffinity(db, userId, FAST);
}

/** Effective taste = 0.5·slow + 1.5·fast, per key, per dimension. A binge of travel
 *  reads spikes `fast` and takes over the ranking; when it stops, `fast` decays in
 *  hours and the slow baseline reasserts. This is what makes the feed follow your mood. */
export function blendAffinity(slow: Affinity, fast: Affinity): Affinity {
  const out = emptyAffinity();
  for (const dim of ['cat', 'tag', 'author'] as Dimension[]) {
    for (const k of new Set([...slow[dim].keys(), ...fast[dim].keys()])) {
      out[dim].set(k, SLOW_WEIGHT * (slow[dim].get(k) ?? 0) + FAST_WEIGHT * (fast[dim].get(k) ?? 0));
    }
  }
  return out;
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
  / power(((${Date.now()}::bigint - ${posts.publishedAt}) / (${HOUR})::float) + 2, 1.4)
`;

export type FeedCard = PostCardRow & { trend: number };

/** The ONE "trending" signal For You uses — shared with the Trending page. Prefer
 *  the momentum-aware `trend_score` (floor + recent velocity, written per-minute by
 *  the trending cron); fall back to the live floor (engagement÷age) only when it
 *  hasn't been computed yet (local dev with no cron, or a post before its first
 *  pass). So For You and Trending agree by construction. */
const trendSignal = (p: FeedCard): number => p.trendScore ?? p.trend;

/** Stable feed ordering key: newest-first, with id as a unique tiebreak so keyset
 *  pagination has a deterministic seam (publishedAt alone can tie to the ms). */
// descNullsLast to match posts_feed_idx — plain desc (= NULLS FIRST) doesn't
// pathkey-match the index and forces a full sort of the published set per load.
const FEED_ORDER = [descNullsLast(posts.publishedAt), descNullsLast(posts.id)] as const;

/** Run a candidate query with the live trend score, card shape (no bodies). `order`
 *  defaults to newest-first; taste retrieval passes a popularity order instead. */
async function runCandidates(db: DB, where: SQL | undefined, limit: number, offset = 0, order: readonly SQL[] = FEED_ORDER): Promise<FeedCard[]> {
  return (await db
    .select({ ...cardCols, trend: trendExpr() })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset)) as FeedCard[];
}

/** Newest published posts — the ranked-head pool, or (with offset) the
 *  chronological tail past the head for deep numbered pages. */
export function feedCandidates(db: DB, opts: { poolSize?: number; offset?: number } = {}): Promise<FeedCard[]> {
  return runCandidates(db, and(eq(posts.status, 'published'), notHidden)!, opts.poolSize ?? 120, opts.offset ?? 0);
}

/** The user's strongest keys in a dimension (positive weight only), top N. */
function topKeys(m: Map<string, number>, n: number): string[] {
  return [...m].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

/** Age-agnostic popularity order: retrieval should surface the most-loved on-taste
 *  post regardless of age — the ranker re-applies recency afterward. Sorting by the
 *  recency-decayed trend_score here would re-bury the very gems we're trying to find. */
// Kept TOKEN-IDENTICAL to posts_engagement_idx (schema.ts) — expression AND null
// ordering — so the planner serves this ORDER BY straight from the index instead
// of sorting the whole matched set (verified with EXPLAIN at 200k rows).
const TASTE_ORDER = [
  sql`(${posts.likes} + 2 * ${posts.comments} + 0.5 * ${posts.saves}) DESC`,
  descNullsLast(posts.publishedAt),
] as const;

/** TASTE-TARGETED retrieval (the real lever): the most-loved posts of ANY age that
 *  match the user's strongest tastes — top categories OR authors OR tags. This is
 *  what lets an older on-taste gem reach the ranker; feedCandidates only ever sees
 *  the newest HEAD_SIZE, so without this an old perfect-match is unreachable except
 *  in the chronological tail. Pure SQL — no embeddings, no API, no added cost. Empty
 *  taste (new / logged-out) → empty, so the feed degrades to recency exactly as before. */
export async function tasteCandidates(db: DB, aff: Affinity, opts: { poolSize?: number } = {}): Promise<FeedCard[]> {
  const cats = topKeys(aff.cat, 3);
  const authors = topKeys(aff.author, 3);
  const tagKeys = topKeys(aff.tag, 5);
  const match: SQL[] = [];
  if (cats.length) match.push(inArray(posts.categoryId, cats));
  if (authors.length) match.push(inArray(posts.authorId, authors));
  // One containment term per tag (`tags @> '["x"]'`) — equivalent to `?|` but served
  // by the existing jsonb_path_ops GIN index on posts.tags (migration 0006).
  for (const t of tagKeys) match.push(sql`${posts.tags} @> ${JSON.stringify([t])}::jsonb`);
  if (!match.length) return [];
  const where = and(eq(posts.status, 'published'), notHidden, or(...match));
  return runCandidates(db, where, opts.poolSize ?? 80, 0, TASTE_ORDER);
}

/** Total published posts — drives the page count for numbered pagination. */
export async function publishedCount(db: DB): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.status, 'published'), notHidden));
  return row?.n ?? 0;
}

/** Ids of authors the user follows. */
export async function followedAuthorIds(db: DB, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId));
  return new Set(rows.map((r) => r.id));
}

/** Post ids the user has already engaged with (among the given candidates) — read,
 *  liked, saved, or commented. Drives the "seen" demotion so nothing you've already
 *  acted on keeps resurfacing at the top. */
export async function seenPostIds(db: DB, userId: string, postIds: string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  const [reads, likes, saves, comments] = await Promise.all([
    db.select({ id: postReads.postId }).from(postReads)
      .where(and(eq(postReads.userId, userId), inArray(postReads.postId, postIds))),
    db.select({ id: postLikes.postId }).from(postLikes)
      .where(and(eq(postLikes.userId, userId), inArray(postLikes.postId, postIds))),
    db.select({ id: postSaves.postId }).from(postSaves)
      .where(and(eq(postSaves.userId, userId), inArray(postSaves.postId, postIds))),
    db.selectDistinct({ id: postComments.postId }).from(postComments)
      .where(and(eq(postComments.userId, userId), inArray(postComments.postId, postIds))),
  ]);
  return new Set([...reads, ...likes, ...saves, ...comments].map((r) => r.id));
}

/** SEMANTIC scores (optional): cosine similarity of each candidate to the centroid
 *  of the user's RECENT reads (the fast window), computed entirely in Postgres via
 *  pgvector. Returns postId → similarity (0–1); empty when the user has no recent
 *  embedded reads or no candidate has an embedding. The caller wraps this in a guard
 *  so any pgvector hiccup just means "no semantic term" — the feed runs on pure math.
 *  recentTasteVec = AVG of recent reads' embeddings → both follows your mood AND avoids
 *  the multi-interest "blurry centroid" problem (it's only what you read lately). */
export async function semanticScores(db: DB, userId: string, postIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!postIds.length) return out;
  const since = Date.now() - FAST.window;
  const rows = await db.execute(sql`
    WITH centroid AS (
      SELECT AVG(p.embedding) AS v
      FROM post_reads r JOIN posts p ON p.id = r.post_id
      WHERE r.user_id = ${userId} AND r.created_at > ${since} AND p.embedding IS NOT NULL
    )
    SELECT p.id AS id, 1 - (p.embedding <=> (SELECT v FROM centroid)) AS semantic
    FROM posts p
    WHERE p.id IN (${sql.join(postIds.map((id) => sql`${id}`), sql`, `)})
      AND p.embedding IS NOT NULL
      AND (SELECT v FROM centroid) IS NOT NULL
  `);
  for (const r of rows.rows as Array<{ id: string; semantic: string | number }>) {
    out.set(r.id, Number(r.semantic));
  }
  return out;
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
  /** postId → cosine similarity (0–1) to the user's recent-reads centroid. The
   *  optional embedding flavor term; missing/empty → semantic contributes 0. */
  semantic?: Map<string, number>;
  /** Diversity knobs. Defaults are sensible for a real feed. */
  maxPerAuthor?: number;     // cap how many posts one author can take up top
  followCap?: number;        // max share of the feed that may be followed-author posts
  exploreEvery?: number;     // every Nth slot, surface the freshest under-ranked post (0 = off)
  /** How hard the tag-IDF match term lifts a post. */
  tagWeight?: number;
}

/** Recency half-life: a post loses half its freshness weight every 3 days. Recency
 *  is the AMPLIFIER (a multiplier), not a source of relevance — so a fresh post
 *  only rises if it's also relevant. Old posts decay toward (never to) zero, so
 *  they stay reachable deep in the feed. */
const RECENCY_HALF_LIFE = 3 * DAY;
/** Relevance weights — the heart of "For You". A post earns relevance by being
 *  from someone you follow, matching your taste, or being site-wide hot. These are
 *  ADDITIVE: a post can qualify on any one of them. Tuned so follows lead, taste is
 *  close behind, and only a little pure-trending leaks in. */
const W_FOLLOW = 3.0;   // in-network: a followed author
const W_TASTE = 2.0;    // content match to your category + tag taste
const W_AUTHOR = 1.5;   // you keep engaging this writer (even if you don't follow them)
const W_SEMANTIC = 1.5; // meaning-match to your RECENT reads (0 without embeddings → pure math)
const W_TREND = 1.0;    // site-wide hotness (kept small → "a few trending")
/** Tiny floor so a brand-new post from an unknown author isn't exactly zero
 *  (a sliver of exploration), but nowhere near enough to outrank a relevant post. */
const REL_FLOOR = 0.05;

/** Score one candidate, X-style and preference-FIRST:
 *    relevance = 3·followed + 2·taste + 1·trendNorm     (what you like / follow / hot)
 *    score     = (0.05 + relevance) · recency · seenPenalty
 *  Recency only multiplies relevance, so it can't float an irrelevant recent post —
 *  exactly "recent, but only the ones you'd prefer". `maxTrend` normalizes the
 *  trending term to 0–1 across the candidate window. */
function scoreCard(p: FeedCard, opts: RankOpts, maxTrend: number): number {
  const followed = opts.following.has(p.authorId) ? 1 : 0;
  const catAff = opts.affinity.cat.get(p.categoryId) ?? 0;
  const tagWeight = opts.tagWeight ?? 1.5;
  let tagMatch = 0;
  for (const t of p.tags ?? []) {
    const aff = opts.affinity.tag.get(t);
    if (!aff) continue;
    tagMatch += (opts.idf?.get(t) ?? 0) * aff; // rare tag the user likes ⇒ strong, specific lift
  }
  const taste = catAff + tagWeight * tagMatch;
  const authorAff = opts.affinity.author.get(p.authorId) ?? 0; // can be negative (reversed engagement)
  const trendNorm = maxTrend > 0 ? Math.max(0, trendSignal(p)) / maxTrend : 0;
  const semantic = opts.semantic ? Math.max(0, opts.semantic.get(p.id) ?? 0) : 0; // 0 without embeddings
  const relevance = W_FOLLOW * followed + W_TASTE * taste + W_AUTHOR * authorAff
    + W_SEMANTIC * semantic + W_TREND * trendNorm;
  const age = Date.now() - (p.publishedAt ?? p.createdAt);
  const recency = Math.pow(0.5, Math.max(0, age) / RECENCY_HALF_LIFE); // fresh ⇒ ~1, 3d ⇒ 0.5
  const seenPenalty = opts.seen.has(p.id) ? 0.35 : 1.0;
  return (REL_FLOOR + relevance) * recency * seenPenalty;
}

/** Blend the pools into one ranked list, then diversify it:
 *  - no single author floods the top (`maxPerAuthor`)
 *  - followed authors can't swamp the whole feed (`followCap`)
 *  - light exploration: every Nth slot surfaces the freshest under-ranked post,
 *    so brand-new writers get a chance and the feed doesn't ossify. */
export function rankFeed(cands: FeedCard[], opts: RankOpts): FeedCard[] {
  // Normalize the trending term to 0–1 across this candidate window (the hottest
  // post = 1.0), so W_TREND is a stable weight regardless of absolute counts. Uses
  // the shared momentum signal (trend_score, live floor fallback).
  const maxTrend = cands.reduce((m, p) => { const t = trendSignal(p); return t > m ? t : m; }, 0);
  const maxPerAuthor = opts.maxPerAuthor ?? 2;
  const followCap = opts.followCap ?? 0.6;
  const exploreEvery = opts.exploreEvery ?? 6;

  // Score each candidate ONCE, then sort by the cached value. Scoring inside the
  // comparator recomputes scoreCard (Date.now + Math.pow + a tag loop) O(n log n)
  // times instead of O(n); caching also gives the sort a stable key.
  const scored = cands.map((p) => ({ p, s: scoreCard(p, opts, maxTrend) }));
  scored.sort((a, b) => b.s - a.s);
  const ranked = scored.map((x) => x.p);

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

/** How often to force a fresh post into the feed, derived from how NARROW the
 *  user's taste is (Shannon entropy of their category affinity). A user who only
 *  ever touches one category has low entropy → explore hard (small cadence) to pop
 *  the bubble; a user who reads broadly has high entropy → the ranking is already
 *  varied, so explore less. Empty taste (new / logged-out) → the neutral default 6. */
export function exploreCadence(aff: Affinity): number {
  const w = [...aff.cat.values()].filter((v) => v > 0);
  if (w.length < 2) return 6;
  const total = w.reduce((s, v) => s + v, 0);
  let h = 0;
  for (const v of w) { const p = v / total; h -= p * Math.log(p); }
  const hNorm = h / Math.log(w.length); // 0 = one-track taste, 1 = perfectly spread
  return Math.min(10, Math.max(3, Math.round(3 + 7 * hNorm)));
}

/** Record (or refresh) a read — the lightest engagement signal. One row per
 *  (post, user); re-reading just refreshes the timestamp. Skips the author reading
 *  their own post (no self-inflation of their taste profile or the post's trending
 *  velocity): the INSERT…SELECT only fires when the post's author isn't the reader. */
export async function recordRead(db: DB, postId: string, userId: string): Promise<void> {
  const now = Date.now();
  await db.execute(sql`
    INSERT INTO post_reads (id, post_id, user_id, created_at)
    SELECT ${newId('read')}, ${postId}, ${userId}, ${now}
    FROM posts WHERE id = ${postId} AND author_id <> ${userId}
    ON CONFLICT (post_id, user_id) DO UPDATE SET created_at = ${now}
  `);
}

/** The strongest taste signal: the user SEARCHED, then clicked a result. Drops a
 *  positive weight-5 row (above comment=4) into user_signals — computeAffinity folds
 *  it into the cat/tag/author dimensions like any other event. It hits the FAST
 *  scorecard hardest, so "going exploring" pivots the feed within the session, with a
 *  mild long-term nudge via the slow one. Skips an author clicking into their own post. */
const SEARCH_SIGNAL = 5;
export async function recordSearchClick(db: DB, postId: string, userId: string): Promise<void> {
  const now = Date.now();
  // Dedup: at most ONE search-click signal per (user, post) inside the fast window, so
  // re-clicking the same result doesn't append unbounded rows (recordRead dedups via
  // ON CONFLICT; user_signals has no unique key, so we guard with NOT EXISTS instead).
  await db.execute(sql`
    INSERT INTO user_signals (id, post_id, user_id, base, created_at)
    SELECT ${newId('sig')}, ${postId}, ${userId}, ${SEARCH_SIGNAL}, ${now}
    FROM posts p
    WHERE p.id = ${postId} AND p.author_id <> ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM user_signals s
        WHERE s.user_id = ${userId} AND s.post_id = ${postId}
          AND s.base = ${SEARCH_SIGNAL} AND s.created_at > ${now - FAST.window}
      )
  `);
}

/** "Not interested": a deliberate negative. Drops a strong negative weight into
 *  user_signals (computeAffinity folds it into the same decayed stream, so that
 *  category/tag/author fades below baseline) AND, via its distinct base value, marks
 *  the post dismissed so dismissedPostIds drops it from the feed on sight. Deduped
 *  within the taste window so re-tapping doesn't pile up negatives; after the window
 *  the signal has decayed out and the post can resurface. */
const NOT_INTERESTED_SIGNAL = -4; // stronger than unlike(−3); distinct base ⇒ identifies a dismissal
export async function recordNotInterested(db: DB, postId: string, userId: string): Promise<void> {
  const now = Date.now();
  await db.execute(sql`
    INSERT INTO user_signals (id, post_id, user_id, base, created_at)
    SELECT ${newId('sig')}, ${postId}, ${userId}, ${NOT_INTERESTED_SIGNAL}, ${now}
    FROM posts WHERE id = ${postId}
      AND NOT EXISTS (
        SELECT 1 FROM user_signals s
        WHERE s.post_id = ${postId} AND s.user_id = ${userId}
          AND s.base = ${NOT_INTERESTED_SIGNAL} AND s.created_at > ${now - SLOW.window}
      )
  `);
}

/** Post ids the user dismissed via "not interested" within the taste window —
 *  excluded from the feed entirely (the negative also fades their taste via the
 *  affinity stream). Past the window the negative has decayed, so the post resurfaces. */
export async function dismissedPostIds(db: DB, userId: string): Promise<Set<string>> {
  const since = Date.now() - SLOW.window;
  const rows = await db.selectDistinct({ id: userSignals.postId })
    .from(userSignals)
    .where(and(eq(userSignals.userId, userId), eq(userSignals.base, NOT_INTERESTED_SIGNAL), gt(userSignals.createdAt, since)));
  return new Set(rows.map((r) => r.id));
}

/** Retention sweep (cron): drop user_signals rows past the taste window. EVERY
 *  reader — computeAffinity, dismissedPostIds, and the search / not-interested
 *  dedup guards — filters to `created_at > now − SLOW.window`, so a row older than
 *  that can never influence a feed again; it's pure dead weight that otherwise
 *  grows without bound (one row per unlike / unsave / dismiss / search-click). The
 *  extra DAY margin keeps us clear of the exact window edge (and any future window
 *  bump). Horizon is derived from SLOW.window so it can't drift out of sync. Bounded
 *  by the (user_id, created_at) index. Returns rows removed. */
export async function pruneOldSignals(db: DB): Promise<number> {
  const cutoff = Date.now() - (SLOW.window + 7 * DAY);
  const removed = await db.delete(userSignals)
    .where(lt(userSignals.createdAt, cutoff))
    .returning({ id: userSignals.id });
  return removed.length;
}

/** Retention sweep (cron): drop post_reads past the taste window. Reads are the
 *  highest-volume engagement row (one per post×user, refreshed on re-read) and every
 *  windowed reader — computeAffinity (SLOW), semanticScores (FAST), the trending
 *  recompute — already ignores rows this old. The ONE reader without a time filter is
 *  seenPostIds: after the prune, a post read >37 days ago loses its 0.35× "seen"
 *  demotion if it re-enters the candidates. That's deliberate — an on-taste post you
 *  read a month+ ago may resurface, exactly like a dismissal decaying out. No
 *  `.returning()` here: the first sweep on a mature table could delete a very large
 *  batch, and materializing every deleted id in Worker memory buys nothing. Bounded
 *  by post_reads_created_idx. Returns rows removed. */
export async function prunePostReads(db: DB): Promise<number> {
  const cutoff = Date.now() - (SLOW.window + 7 * DAY);
  const res = await db.execute(sql`DELETE FROM post_reads WHERE created_at < ${cutoff}`);
  return res.rowCount ?? 0;
}

/* ============================================================================
 * 4. ORCHESTRATOR
 * ----------------------------------------------------------------------------
 * The one entry point the route calls. The feed is a RANKED HEAD + CHRONOLOGICAL
 * TAIL: the newest `HEAD_SIZE` posts are scored by the For You algorithm (taste +
 * follow + trending + recency); everything older is served plain newest-first so
 * Load more keeps walking back to the very first post ever. `userId` null = logged
 * out: no taste, so the head is effectively recency + trending (what SSR gets).
 * ========================================================================== */

/** Size of the smartly-ranked head. Past this, the feed continues chronologically.
 *  Bounded so a feed read stays cheap at 50K users (rank ≤ HEAD_SIZE in memory). */
const HEAD_SIZE = 300;
/** Extra taste-targeted candidates of ANY age, merged into the head pool so older
 *  on-taste posts can be ranked (not just the newest HEAD_SIZE). */
const TASTE_POOL = 80;

export interface ForYouOpts {
  userId: string | null;
  limit?: number;   // feed page size (default 12, max 50)
  page?: number;    // 0-based page index for numbered pagination
  kv?: KVNamespace; // reserved (trending hot-cache); unused since trending is now a live term
}

export interface ForYouResult {
  feed: ReturnType<typeof publicPostCard>[];
  total: number;          // total published posts → totalPages = ceil(total / limit)
  personalized: boolean;
}

const strip = (p: FeedCard) => { const { trend: _trend, ...rest } = p; return publicPostCard(rest); };

export async function forYouFeed(db: DB, opts: ForYouOpts): Promise<ForYouResult> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 12));
  const page = Math.max(0, opts.page ?? 0);
  const offset = page * limit;
  const uid = opts.userId;

  const total = await publishedCount(db);
  const headLen = Math.min(HEAD_SIZE, total);

  let items: FeedCard[];
  if (offset < headLen) {
    // ---- RANKED HEAD: score the newest HEAD_SIZE posts, slice this page. ----
    const following = uid ? await followedAuthorIds(db, uid) : new Set<string>();

    // Taste FIRST (slow cached + fast live, blended) so we can ALSO retrieve older
    // on-taste posts — not just the newest HEAD_SIZE — then rank the union.
    let affinity: Affinity = emptyAffinity();
    if (uid) {
      const [slow, fast] = await Promise.all([userAffinityFor(db, uid), fastAffinityFor(db, uid)]);
      affinity = blendAffinity(slow, fast);
    }
    const [global, taste] = await Promise.all([
      feedCandidates(db, { poolSize: HEAD_SIZE }),
      uid ? tasteCandidates(db, affinity, { poolSize: TASTE_POOL }) : Promise.resolve<FeedCard[]>([]),
    ]);
    const byId = new Map<string, FeedCard>();
    for (const p of global) byId.set(p.id, p);
    for (const p of taste) byId.set(p.id, p);

    let seen = new Set<string>();
    let idf = new Map<string, number>();
    let semantic = new Map<string, number>();
    if (uid) {
      const [seenIds, idfMap, dismissed] = await Promise.all([
        seenPostIds(db, uid, [...byId.keys()]),
        tagIdf(db),
        dismissedPostIds(db, uid),
      ]);
      seen = seenIds;
      idf = idfMap;
      // "Not interested" posts vanish (removed, not just demoted).
      for (const id of dismissed) byId.delete(id);
      // Optional semantic flavor — guarded so any pgvector/embedding issue degrades to
      // pure math (empty map → W_SEMANTIC term is 0).
      try { semantic = await semanticScores(db, uid, [...byId.keys()]); } catch { /* pure math */ }
    }
    const cands = [...byId.values()];

    const ranked = rankFeed(cands, { affinity, following, seen, idf, semantic, exploreEvery: exploreCadence(affinity) });
    items = ranked.slice(offset, offset + limit);
  } else {
    // ---- CHRONOLOGICAL TAIL: deep numbered pages past the head, newest-first.
    // The head occupies the newest HEAD_SIZE posts, so a global newest-first offset
    // lands exactly on the next-oldest post (no overlap, no re-ranking cost). ----
    items = await feedCandidates(db, { poolSize: limit, offset });
  }

  return { feed: items.map(strip), total, personalized: !!uid };
}
