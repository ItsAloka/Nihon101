/* Trending (Phase 6 / Step 2). The hourly scheduled() cron writes each published
 * post's engagement-decayed score into posts.trend_score; the Trending page reads
 * it back ordered desc. Precomputing means the hot Trending list is one indexed
 * scan instead of recomputing the decay for every post on every request. */
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users } from '../schema';
import { cardCols, type PostCardRow } from './posts';

const HOUR = 3_600_000;

/** Recompute trend_score for every published post in one UPDATE. Same decay as
 *  the live feed: (likes + 2·comments + 0.5·saves) / (age_hours + 2)^1.4. */
export async function recomputeTrendScores(db: DB): Promise<void> {
  await db.execute(sql`
    UPDATE posts SET trend_score =
      (likes + 2 * comments + 0.5 * saves)::float
      / power(((${Date.now()}::bigint - published_at) / ${sql.raw(`${HOUR}.0`)}) + 2, 1.4)
    WHERE status = 'published' AND published_at IS NOT NULL
  `);
}

/** Top trending published posts (card shape, no bodies), highest score first. */
export function listTrending(db: DB, limit: number, offset = 0): Promise<PostCardRow[]> {
  return db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.status, 'published'), isNotNull(posts.trendScore)))
    .orderBy(desc(posts.trendScore), desc(posts.publishedAt))
    .limit(limit)
    .offset(offset) as Promise<PostCardRow[]>;
}

/** Count of posts eligible for the Trending list (for pagination). */
export async function countTrending(db: DB): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(eq(posts.status, 'published'), isNotNull(posts.trendScore)));
  return row?.n ?? 0;
}
