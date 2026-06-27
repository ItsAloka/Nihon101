/* Smoke test: exercise the NEW SQL paths (tasteCandidates `?|`, dismissedPostIds,
 * recordNotInterested, trending small-sample damp, full forYouFeed) against the live
 * Docker Postgres. Mutates nothing permanent — the one test signal is deleted after.
 * Run:  DATABASE_URL=... bun run scripts/smoke-feed.ts  */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import {
  userAffinityFor, fastAffinityFor, blendAffinity,
  tasteCandidates, dismissedPostIds, recordNotInterested, forYouFeed,
} from '../src/db/queries/for-you';
import { recomputeTrendScores } from '../src/db/queries/trending';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, max: 2 });
const db = drizzle(pool, { schema });

async function main() {
  const u = await db.execute(sql`SELECT user_id, count(*)::int AS n FROM post_reads GROUP BY user_id ORDER BY n DESC LIMIT 1`);
  const userId = (u.rows[0] as { user_id?: string })?.user_id;
  if (!userId) throw new Error('no user with reads — cannot test personalized paths');
  console.log('test user:', userId);

  console.log('1) recomputeTrendScores (Phase 3 small-sample damp)...');
  await recomputeTrendScores(db);
  console.log('   ok');

  const aff = blendAffinity(await userAffinityFor(db, userId), await fastAffinityFor(db, userId));
  console.log('2) affinity top cats:', [...aff.cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3));

  console.log('3) tasteCandidates (Phase 1 — jsonb ?| match, any-age popularity)...');
  const taste = await tasteCandidates(db, aff, { poolSize: 80 });
  console.log('   returned', taste.length, 'candidates');

  console.log('4) recordNotInterested + dismissedPostIds (Phase 2)...');
  const before = (await dismissedPostIds(db, userId)).size;
  const victim = taste[0]?.id;
  if (victim) await recordNotInterested(db, victim, userId);
  const after = (await dismissedPostIds(db, userId)).size;
  console.log('   dismissed before/after:', before, '->', after, victim ? `(dismissed ${victim})` : '(no candidate)');

  console.log('5) forYouFeed end-to-end...');
  const feed = await forYouFeed(db, { userId, limit: 12, page: 0 });
  console.log('   feed:', feed.feed.length, 'cards · personalized:', feed.personalized);

  // cleanup the one test signal so the DB is untouched
  if (victim) await db.execute(sql`DELETE FROM user_signals WHERE user_id = ${userId} AND post_id = ${victim} AND base = -4`);
  console.log('\nALL OK ✓');
}

main().then(() => pool.end()).catch(async (e) => { console.error('\nSMOKE FAIL:', e); await pool.end(); process.exit(1); });
