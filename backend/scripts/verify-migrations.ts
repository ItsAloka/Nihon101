/* Deploy-time safety net: assert every migration in the journal is actually applied
 * on the target DATABASE_URL. Catches the silent-skip gremlin (see normalize-journal)
 * BEFORE traffic hits a missing table. Run against Neon right after `db:migrate` at
 * deploy, and in CI after migrating the service container.
 *
 *   DATABASE_URL=... bun run db:verify
 *
 * The migrator records one row per applied migration in drizzle.__drizzle_migrations
 * with created_at = the journal entry's `when`. We assert every journal `when` is
 * present; any missing entry = a migration that never ran. Exits non-zero on failure. */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('[verify] DATABASE_URL is required'); process.exit(1); }

const journal = JSON.parse(
  readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
) as { entries: { when: number; tag: string }[] };

const pool = new Pool({ connectionString: url });
try {
  const { rows } = await pool.query<{ created_at: string }>(
    'select created_at from drizzle.__drizzle_migrations',
  );
  const applied = new Set(rows.map((r) => Number(r.created_at)));
  const missing = journal.entries.filter((e) => !applied.has(e.when));
  if (missing.length) {
    console.error(`[verify] ${missing.length} UNAPPLIED migration(s): ${missing.map((m) => m.tag).join(', ')}`);
    console.error('[verify] run `bun run db:migrate`; if it reports success but rows are still missing, a future-dated journal `when` is hiding them.');
    process.exit(1);
  }
  console.log(`[verify] all ${journal.entries.length} migrations applied ✓`);
} finally {
  await pool.end();
}
