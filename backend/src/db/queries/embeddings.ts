/* Semantic embeddings (Step 3). Each published post carries a 1536-dim vector
 * (OpenAI text-embedding-3-small). A reader's "taste vector" is the centroid of
 * the embeddings of posts they read/liked/commented (90-day window), cached in
 * user_embedding. The For You feed adds cosine similarity (post ↔ taste) to the
 * ranking, so the feed leans toward content like what you actually engage with —
 * not just the same category. All vector math runs in Postgres via pgvector.
 */
import { eq, sql } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, userEmbedding } from '../schema';
import { embed } from '../../lib/openai';

const HOUR = 3_600_000;
const TTL = 1 * HOUR;          // recompute a reader's taste vector at most hourly
const WINDOW = 90 * 24 * HOUR; // engagement window that shapes taste

/** The text we embed for a post: both-locale title + excerpt + plain body text. */
export function postEmbedText(p: {
  titleEn?: string | null; titleJa?: string | null;
  excerptEn?: string | null; excerptJa?: string | null; bodyEn?: string | null;
}): string {
  const body = String(p.bodyEn || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return [p.titleEn, p.titleJa, p.excerptEn, p.excerptJa, body].filter(Boolean).join('\n').slice(0, 8000);
}

/** Embed a post's text and store the vector. Safe to run in the background. */
export async function embedPost(db: DB, apiKey: string, postId: string, text: string): Promise<void> {
  if (!text.trim()) return;
  const vec = await embed(apiKey, text);
  await db.update(posts).set({ embedding: vec }).where(eq(posts.id, postId));
}

/** Published posts still missing an embedding (for the backfill script). */
export async function postsMissingEmbedding(db: DB, limit = 500) {
  return db
    .select({ id: posts.id, titleEn: posts.titleEn, titleJa: posts.titleJa, excerptEn: posts.excerptEn, excerptJa: posts.excerptJa, bodyEn: posts.bodyEn })
    .from(posts)
    .where(sql`${posts.status} = 'published' AND ${posts.embedding} IS NULL`)
    .limit(limit);
}

/** Recompute (if stale/missing) the reader's taste vector — the centroid of the
 *  embeddings of posts they engaged with — and cache it. Cheap: one upsert. */
export async function ensureUserEmbedding(db: DB, userId: string): Promise<void> {
  const [row] = await db
    .select({ updatedAt: userEmbedding.updatedAt })
    .from(userEmbedding)
    .where(eq(userEmbedding.userId, userId));
  if (row && Date.now() - row.updatedAt < TTL) return;

  const since = Date.now() - WINDOW;
  const now = Date.now();
  // AVG(vector) is a pgvector aggregate. With no engaged-yet-embedded posts the
  // aggregate still returns one row (NULL), so a marker row is stored either way
  // and we don't recompute on every request.
  await db.execute(sql`
    INSERT INTO user_embedding (user_id, embedding, updated_at)
    SELECT ${userId}, AVG(p.embedding), ${now}
    FROM (
      SELECT post_id FROM post_reads    WHERE user_id = ${userId} AND created_at > ${since}
      UNION
      SELECT post_id FROM post_likes    WHERE user_id = ${userId} AND created_at > ${since}
      UNION
      SELECT post_id FROM post_comments WHERE user_id = ${userId} AND created_at > ${since}
    ) e JOIN posts p ON p.id = e.post_id
    WHERE p.embedding IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = EXCLUDED.updated_at
  `);
}
