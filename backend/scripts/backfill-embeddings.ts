/* One-time backfill of post embeddings (Step 3). Embeds every published post
 * that has no vector yet, via OpenAI text-embedding-3-small. Idempotent: only
 * touches posts where embedding IS NULL, so re-running is safe + cheap.
 *
 * Usage:
 *   DATABASE_URL=postgres://... OPENAI_API_KEY=sk-... bun scripts/backfill-embeddings.ts
 */
import { standaloneDb } from '../src/db/client';
import { postsMissingEmbedding, embedPost, postEmbedText } from '../src/db/queries/embeddings';

const url = process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';
const apiKey = process.env.OPENAI_API_KEY ?? '';
const { db, pool } = standaloneDb({ DATABASE_URL: url });

async function main() {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const rows = await postsMissingEmbedding(db, 1000);
  console.log(`embedding ${rows.length} post(s)…`);
  let done = 0;
  for (const p of rows) {
    try {
      await embedPost(db, apiKey, p.id, postEmbedText(p));
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${rows.length}`);
    } catch (e) {
      console.warn(`  skip ${p.id}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 60)); // gentle on the rate limit
  }
  console.log(`done — embedded ${done}/${rows.length}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
