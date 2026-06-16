/* One-time backfill: run the HTML sanitizer over every existing post body so rows
 * written before server-side sanitization existed are made safe. Idempotent —
 * sanitizing already-clean HTML is a no-op, so it's safe to re-run. Only writes a
 * row when sanitizing actually changed the bytes.
 *
 * Usage:  DATABASE_URL=postgres://... bun scripts/backfill-sanitize.ts
 */
import { eq } from 'drizzle-orm';
import { standaloneDb } from '../src/db/client';
import { posts } from '../src/db/schema';
import { sanitizeHtml } from '../src/lib/sanitizeHtml';

const url = process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';
const { db, pool } = standaloneDb({ DATABASE_URL: url });

const rows = await db.select({ id: posts.id, bodyEn: posts.bodyEn, bodyJa: posts.bodyJa }).from(posts);
let changed = 0;
for (const r of rows) {
  const en = sanitizeHtml(r.bodyEn ?? '');
  const ja = sanitizeHtml(r.bodyJa ?? '');
  if (en !== (r.bodyEn ?? '') || ja !== (r.bodyJa ?? '')) {
    await db.update(posts).set({ bodyEn: en, bodyJa: ja }).where(eq(posts.id, r.id));
    changed++;
  }
}
console.log(`scanned ${rows.length} posts, sanitized ${changed}`);
await pool.end();
