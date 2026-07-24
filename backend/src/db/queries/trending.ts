/* ============================================================================
 * TRENDING — momentum-aware "hot right now", site-wide (same for every viewer).
 * ============================================================================
 * The old trending was lifetime-engagement ÷ age: a post with big all-time totals
 * trended forever and a post spiking *right now* could never break in. This scores
 * by MOMENTUM — recent engagement velocity — which we can compute because
 * post_reads/saves/likes/comments each carry a created_at. The per-minute pass
 * reads them via the post_event_hours HOURLY ROLLUP (each hour summed once by
 * refreshEventBuckets), not the raw tables — re-aggregating 72h of raw events
 * every 60s re-did the same arithmetic ~4,300 times per event, so cron cost
 * scaled with traffic instead of staying flat.
 *
 * Scoring, in one line:
 *   velocity(post) = Σ events in last WINDOW: read1 + save2 + like3 + comment4,
 *                    each decayed by a 24h half-life            ← "hot today"
 *   accel(post)    = 1 + recentVel/(velocity+1)  ∈ [1,2]       ← gaining NOW, not just popular
 *   reach(post)    = (reads_in_window + 2)^0.15                ← mild anti rich-get-richer damp
 *   floor(post)    = (likes + 2·comments + 0.5·saves) / (age_h + 2)^1.4
 *   trend(post)    = floor + W · velocity · accel / reach
 *
 * The floor is the old all-time score kept underneath so the list never empties on
 * a quiet day / seeded data; velocity·accel decides who's actually on top, and reach
 * lets a high-RATE post break past an already-popular one. An old post resurfaces on
 * a fresh burst; a quiet post drifts out. The shared hot top is then author-capped
 * (≤2 per writer) so one prolific/viral author can't own it.
 *
 * TWO PRECOMPUTED LAYERS, both written by the per-minute cron (src/index.ts):
 *   1. posts.trend_score  — momentum written to the indexed column, so the
 *      paginated SSR /trending page is one indexed scan over the WHOLE corpus.
 *   2. TRENDING_KV         — the top-20 cards baked to KV, so the hot path
 *      (home hero / sidebar / For You / page-0 of /trending) does ZERO Postgres.
 * Request path for the hot list: in-isolate memory (~30s) → KV → live DB compute
 * (cold-start only). 1 viewer or 50k cost the same.
 * ========================================================================== */
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users } from '../schema';
import { cardCols, notHidden, type PostCardRow } from './posts';

const HOUR = 3_600_000;
const HALF_LIFE = 24 * HOUR;   // a recent event loses half its weight every 24h
const WINDOW = 72 * HOUR;      // only engagement inside this window counts as "recent"
const RECENT = 24 * HOUR;      // the "is it accelerating?" sub-window (last 24h)
const WEIGHT = 1.0;            // how hard momentum lifts a post above its all-time floor
const VEL_PRIOR = 5;          // Bayesian small-sample damp: a post's velocity only counts at
                              // full weight once it has ~K events, so on a quiet day a handful
                              // of likes (n=3 → ×0.375) can't outrank a genuinely busy post
                              // (n=300 → ×0.98). Same shrinkage idiom as For You's SHRINK_K.
const FRESH = 14 * 24 * HOUR;  // age-decay only reorders posts younger than this; older
                               // ones are only rescored when they get fresh engagement

/** Recompute trend_score for EVERY published post:
 *    floor    = (likes + 2·comments + 0.5·saves) / (age_h + 2)^1.4        (all-time)
 *    vel      = Σ windowed events (read1/save2/like3/comment4), 24h-decayed (volume)
 *    accel    = 1 + recentVel/(vel + 1)   ∈ [1,2]   ← gaining NOW > recently popular
 *    reach    = (reads_in_window + 2)^0.15           ← mild anti rich-get-richer damp
 *    trend    = floor + WEIGHT · vel · accel / reach
 *  Every published post gets at least its all-time floor (so the Trending page
 *  always fills, ranked sensibly even on a quiet day); posts with momentum get the
 *  velocity·accel/reach term added on top and rise above the floor crowd. accel
 *  boosts posts whose engagement is concentrated in the last 24h; reach gently
 *  divides out raw exposure so a high-RATE post can break in past an already-popular
 *  one. The velocity CTE only sums posts with events in WINDOW (cheap); the floor is
 *  applied to the rest via a LEFT JOIN with a 0 momentum term. */
export async function recomputeTrendScores(db: DB): Promise<void> {
  const now = Date.now();
  const freshSince = now - FRESH;
  const nowHour = Math.floor(now / HOUR);
  const sinceHour = Math.floor((now - WINDOW) / HOUR);
  const recentHour = Math.floor((now - RECENT) / HOUR);
  // Bucket decay (per-hour, replaces per-event decay — same shape, <3% intra-hour
  // difference). The divisor is a numeric literal, not a bind parameter: `${x}.0`
  // inside sql`` would render as `$n.0`, which is a syntax error (the pre-existing
  // age term below uses sql.raw for the same reason).
  const halfLifeHours = sql.raw(`${HALF_LIFE / HOUR}.0`);
  await db.execute(sql`
    WITH ev AS (
      SELECT post_id, hour, reads, saves, likes, comments,
        (reads + 2.0 * saves + 3.0 * likes + 4.0 * comments)
          * power(0.5, (${nowHour} - hour)::float / ${halfLifeHours}) AS w
      FROM post_event_hours
      WHERE hour > ${sinceHour}
    ),
    vel AS (
      SELECT post_id,
        SUM(w) AS v,
        SUM(w) FILTER (WHERE hour > ${recentHour}) AS recent_v,
        SUM(reads) AS reads,
        SUM(reads + saves + likes + comments) AS n
      FROM ev GROUP BY post_id
    )
    UPDATE posts SET trend_score =
      (posts.likes + 2 * posts.comments + 0.5 * posts.saves)::float
        / power(((${now}::bigint - posts.published_at) / ${sql.raw(`${HOUR}.0`)}) + 2, 1.4)
      + COALESCE(
          ${WEIGHT} * vel.v
            * (vel.n::float / (vel.n + ${VEL_PRIOR}))
            * (1 + COALESCE(vel.recent_v, 0) / (vel.v + 1))
            / power(vel.reads + 2, 0.15),
          0)
    FROM (
      SELECT id FROM posts
      WHERE status = 'published' AND is_hidden = false AND published_at IS NOT NULL
        -- Only rescore posts whose ranking can actually move this run: those young
        -- enough that age-decay reorders them, OR any post with engagement in WINDOW
        -- (so an old post resurfacing on a fresh burst still gets picked up). Older,
        -- quiet posts keep their last (near-zero, rank-stable) floor instead of being
        -- rewritten every run — bounds the per-run UPDATE to the active set, not 50k rows.
        AND (published_at > ${freshSince} OR id IN (SELECT post_id FROM vel))
    ) pub
    LEFT JOIN vel ON vel.post_id = pub.id
    WHERE posts.id = pub.id
  `);
}

/** Roll raw engagement events into the hourly buckets recomputeTrendScores reads.
 *  Idempotent: each (post, hour) is fully recomputed from the raw tables, so
 *  re-running over the same span is a no-op and a missed run self-heals.
 *
 *  The per-minute pass only needs the last couple of hours (older buckets are
 *  already final). It runs wider once an hour because post_reads is deduped per
 *  (post,user) — a repeat read MOVES an existing row's created_at into a newer
 *  bucket, which would otherwise leave a stale count behind in the bucket it
 *  left. Rewriting the full window hourly bounds that drift to an hour. */
export async function refreshEventBuckets(db: DB, sinceMs: number): Promise<void> {
  // Snap to the START of the hour containing sinceMs. A bucket is rewritten with
  // whatever this query counts, so a mid-hour boundary would rebuild the oldest
  // bucket from only part of its hour and silently erase the rest of it.
  const from = Math.floor(sinceMs / HOUR) * HOUR;
  const hourExpr = sql.raw(`(created_at / ${HOUR})::int`); // literal, not a bind param
  await db.execute(sql`
    INSERT INTO post_event_hours (post_id, hour, reads, saves, likes, comments)
    SELECT post_id, ${hourExpr} AS hour,
      COUNT(*) FILTER (WHERE k = 'r')::int,
      COUNT(*) FILTER (WHERE k = 's')::int,
      COUNT(*) FILTER (WHERE k = 'l')::int,
      COUNT(*) FILTER (WHERE k = 'c')::int
    FROM (
      SELECT post_id, created_at, 'r' AS k FROM post_reads    WHERE created_at >= ${from}
      UNION ALL
      SELECT post_id, created_at, 's' AS k FROM post_saves    WHERE created_at >= ${from}
      UNION ALL
      SELECT post_id, created_at, 'l' AS k FROM post_likes    WHERE created_at >= ${from}
      UNION ALL
      SELECT post_id, created_at, 'c' AS k FROM post_comments WHERE created_at >= ${from}
    ) e
    GROUP BY post_id, ${hourExpr}
    ON CONFLICT (post_id, hour) DO UPDATE SET
      reads = EXCLUDED.reads, saves = EXCLUDED.saves,
      likes = EXCLUDED.likes, comments = EXCLUDED.comments
  `);
}

/** Drop buckets that have aged out of WINDOW — they can no longer affect any
 *  score. Keeps the rollup table proportional to active posts, not all history. */
export async function pruneEventBuckets(db: DB): Promise<number> {
  const cutoff = Math.floor((Date.now() - WINDOW) / HOUR);
  const res = await db.execute(sql`DELETE FROM post_event_hours WHERE hour <= ${cutoff} RETURNING post_id`);
  return res.rows.length;
}

/** Full window span, for the hourly wide refresh + first-run backfill. */
export const BUCKET_WINDOW = WINDOW;

/** Top trending published posts (card shape, no bodies), highest score first.
 *  Reads the precomputed momentum column — used for the paginated SSR page. An
 *  optional `categoryId` narrows it to "hot in this category" (the Trending page's
 *  category filter); omitted = global. */
export function listTrending(db: DB, limit: number, offset = 0, categoryId?: string): Promise<PostCardRow[]> {
  return db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.status, 'published'), notHidden, isNotNull(posts.trendScore),
      categoryId ? eq(posts.categoryId, categoryId) : undefined))
    .orderBy(desc(posts.trendScore), desc(posts.publishedAt))
    .limit(limit)
    .offset(offset) as Promise<PostCardRow[]>;
}

// Cap trending pagination depth — the list is "hot right now", not an archive; past
// this nobody pages. Bounds both the count and (since no deeper page is linked) the
// OFFSET scan on the trending page.
const TRENDING_COUNT_CAP = 1000;

/** Count of posts eligible for the Trending list (for pagination), bounded so the
 *  count is O(cap) not O(corpus). */
export async function countTrending(db: DB, categoryId?: string): Promise<number> {
  const capped = db
    .select({ one: sql`1` })
    .from(posts)
    .where(and(eq(posts.status, 'published'), notHidden, isNotNull(posts.trendScore),
      categoryId ? eq(posts.categoryId, categoryId) : undefined))
    .limit(TRENDING_COUNT_CAP + 1)
    .as('capped');
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(capped);
  return Math.min(row?.n ?? 0, TRENDING_COUNT_CAP);
}

/* ----------------------------------------------------------------------------
 * Hot top-N cache. The trending top is IDENTICAL for every viewer, so it's baked
 * once (by the cron) and shared by all — never per request, never per user.
 *
 *   Cron (per minute) → recompute trend_score → write top-20 cards to KV.
 *   Request path: in-isolate memory (~30s) → KV (shared) → live DB (cold start).
 *
 * Graceful without KV: in local dev with no TRENDING_KV binding, this falls
 * straight through to a live DB read (still cheap — one indexed scan).
 * -------------------------------------------------------------------------- */
const KEY = 'trending:home:v1';
const IN_MEM_TTL = 30_000;   // per-isolate memory layer: re-read KV at most every 30s
const CACHE_POOL = 20;       // cache the top-20; callers slice to their own limit
const POOL_OVERSCAN = 4;     // pull 4× before capping so the diversity pass still fills 20
const MAX_PER_AUTHOR = 2;    // one prolific/viral author can't own the hot list

/** Greedy author cap over a score-ordered list: keep at most MAX_PER_AUTHOR per
 *  author, preserving order, until `limit` cards are chosen. Overflow is dropped
 *  (we over-fetched), so a single writer can't swamp the trending top. */
function capByAuthor(cards: PostCardRow[], limit: number): PostCardRow[] {
  const out: PostCardRow[] = [];
  const per = new Map<string, number>();
  for (const c of cards) {
    const n = per.get(c.authorId) ?? 0;
    if (n >= MAX_PER_AUTHOR) continue;
    out.push(c);
    per.set(c.authorId, n + 1);
    if (out.length >= limit) break;
  }
  return out;
}

let mem: { at: number; cards: PostCardRow[] } | null = null;
let inflight: Promise<PostCardRow[]> | null = null;  // single-flight: concurrent misses share one refresh

/** Resolve the shared list: prefer KV (written by cron); fall back to a live DB
 *  read on cold start. Populates the in-memory layer either way. */
async function refresh(db: DB, kv: KVNamespace | undefined): Promise<PostCardRow[]> {
  if (kv) {
    try {
      const raw = await kv.get(KEY);
      if (raw) {
        const cards = JSON.parse(raw) as PostCardRow[];
        mem = { at: Date.now(), cards };
        return cards;
      }
    } catch { /* KV miss / parse error → fall through to a live read */ }
  }
  const cards = capByAuthor(await listTrending(db, CACHE_POOL * POOL_OVERSCAN), CACHE_POOL);
  mem = { at: Date.now(), cards };
  return cards;
}

/** The shared trending top — card shape, top N. Served from the two-layer cache;
 *  used by the hot path (home hero/sidebar, For You, page-0 of /trending). */
export async function trendingTop(db: DB, opts: { limit?: number; kv?: KVNamespace } = {}): Promise<PostCardRow[]> {
  const limit = Math.min(CACHE_POOL, Math.max(1, opts.limit ?? 5));

  // Layer 1: per-isolate memory.
  if (mem && Date.now() - mem.at < IN_MEM_TTL) return mem.cards.slice(0, limit);

  // Layers 2/3 (KV, then live): single-flight so concurrent misses do one refresh.
  if (!inflight) {
    inflight = refresh(db, opts.kv).finally(() => { inflight = null; });
  }
  const cards = await inflight;
  return cards.slice(0, limit);
}

/** Cron entry (src/index.ts `scheduled`): recompute momentum, then bake the
 *  top-20 cards to KV. The ONLY writer of the shared cache. */
export async function recomputeTrendingCache(db: DB, kv: KVNamespace | undefined): Promise<void> {
  await recomputeTrendScores(db);
  if (!kv) return;
  const cards = capByAuthor(await listTrending(db, CACHE_POOL * POOL_OVERSCAN), CACHE_POOL);
  await kv.put(KEY, JSON.stringify(cards));
}
