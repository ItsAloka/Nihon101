/* Post-`drizzle-kit generate` guard. Drizzle's node-postgres migrator decides what
 * to apply purely by timestamp: it runs every journal entry whose `when` exceeds the
 * max `created_at` already in __drizzle_migrations. A migration generated with a
 * `when` BELOW an earlier (hand-edited, future-dated) entry is therefore treated as
 * already-applied and SILENTLY SKIPPED — its tables never get created. That gremlin
 * bit us repeatedly (0015/0016 were hand-bumped into the future; 0017 then skipped).
 *
 * Fix: force the newest entry's `when` to strictly exceed every prior entry. We only
 * touch the last (just-generated) entry, never an already-applied one, so there is no
 * re-application risk. Wired into `db:generate` so every future migration is safe. */
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../drizzle/meta/_journal.json', import.meta.url);
const journal = JSON.parse(readFileSync(path, 'utf8')) as { entries: { idx: number; when: number; tag: string }[] };
const e = journal.entries;

if (e.length > 1) {
  const last = e[e.length - 1]!;
  const maxPrev = Math.max(...e.slice(0, -1).map((x) => x.when));
  if (last.when <= maxPrev) {
    last.when = maxPrev + 1;
    writeFileSync(path, JSON.stringify(journal, null, 2) + '\n');
    console.log(`[journal] bumped ${last.tag} when -> ${last.when} (was <= a prior entry)`);
  } else {
    console.log(`[journal] ok — ${last.tag} is the strict latest`);
  }
}
