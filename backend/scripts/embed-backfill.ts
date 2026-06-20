/* One-time backfill: embed every published post that has no embedding yet, so the
 * semantic layer (For You flavor term + semantic search) has vectors to work with from
 * day one. Idempotent — only touches rows where embedding IS NULL, so it's safe to
 * re-run (e.g. after a batch of new posts, or if the API rate-limited mid-run).
 *
 * Cost: text-embedding-3-small is $0.02/1M tokens — embedding ~50 dev posts is a
 * fraction of a cent; a full 50k corpus is ~$0.50 one-time.
 *
 * Usage:  DATABASE_URL=postgres://...  OPENAI_EMBED_API_KEY=sk-...  bun scripts/embed-backfill.ts
 */
import { sql } from 'drizzle-orm';
import { standaloneDb } from '../src/db/client';
import { embedText, postEmbedText, toVectorLiteral } from '../src/lib/embeddings';

const url = process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';
const apiKey = process.env.OPENAI_EMBED_API_KEY ?? '';
if (!apiKey) { console.error('Set OPENAI_EMBED_API_KEY'); process.exit(1); }

const { db, pool } = standaloneDb({ DATABASE_URL: url });

const rows = await db.execute(sql`
  SELECT id, title_en AS "titleEn", title_ja AS "titleJa",
         excerpt_en AS "excerptEn", excerpt_ja AS "excerptJa", body_en AS "bodyEn"
  FROM posts
  WHERE status = 'published' AND embedding IS NULL
`);

let done = 0, skipped = 0, failed = 0;
for (const p of rows.rows as Array<Record<string, string>>) {
  const text = postEmbedText(p);
  if (!text) { skipped++; continue; }
  try {
    const vec = await embedText(apiKey, text);
    await db.execute(sql`UPDATE posts SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${p.id}`);
    done++;
  } catch (e) {
    failed++;
    console.error(`  failed ${p.id}: ${(e as Error).message}`);
  }
}
console.log(`embedded ${done}, skipped ${skipped} (empty), failed ${failed}, of ${rows.rows.length} unembedded`);
await pool.end();
