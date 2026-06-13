/* One-time backfill of the `tags` counter table from existing published posts.
 * Idempotent: resets all counters to 0, then re-derives from posts.tags jsonb via
 * the same slugify + bumpTagCounts path the live publish flow uses.
 *
 * Usage:  DATABASE_URL=postgres://... bun scripts/backfill-tags.ts
 */
import { eq, sql } from 'drizzle-orm';
import { standaloneDb } from '../src/db/client';
import { posts, tags } from '../src/db/schema';
import { bumpTagCounts } from '../src/db/queries/tags';

const url = process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';
const { db, pool } = standaloneDb({ DATABASE_URL: url });

async function main() {
  await db.update(tags).set({ postCount: 0 });
  const rows = await db
    .select({ tags: posts.tags })
    .from(posts)
    .where(eq(posts.status, 'published'));

  let n = 0;
  for (const r of rows) {
    const t = (r.tags ?? []) as string[];
    if (t.length) { await bumpTagCounts(db, t, 1); n += t.length; }
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tags).where(sql`post_count > 0`);
  console.log(`backfilled ${n} tag uses across ${rows.length} published posts → ${count} live tags`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
