/* One-off: give every existing user a unique handle slugified from their
 * display name. Run once after migration 0002 (handle column added, nullable),
 * before the not-null migration. Usage:
 *   DATABASE_URL=postgres://... bun scripts/backfill-handles.ts
 */
import { isNull, eq } from 'drizzle-orm';
import { standaloneDb } from '../src/db/client';
import { users } from '../src/db/schema';
import { slugify } from '../src/db/queries/categories';

const url = process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';
const { db, pool } = standaloneDb({ DATABASE_URL: url });

const rows = await db.select().from(users).where(isNull(users.handle));
const taken = new Set(
  (await db.select({ handle: users.handle }).from(users)).map((r) => r.handle).filter(Boolean),
);

for (const u of rows) {
  const base = slugify(u.displayName).slice(0, 30) || `user-${u.id.slice(-6)}`;
  let candidate = base;
  let n = 1;
  while (taken.has(candidate)) candidate = `${base}-${++n}`;
  taken.add(candidate);
  await db.update(users).set({ handle: candidate }).where(eq(users.id, u.id));
  console.log(`${u.displayName} -> @${candidate}`);
}

console.log(`backfilled ${rows.length} handles`);
await pool.end();
