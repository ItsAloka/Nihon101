import { sql, desc, gt, eq } from 'drizzle-orm';
import type { DB } from '../client';
import { tags } from '../schema';
import { slugify } from './categories';

export type TagRow = typeof tags.$inferSelect;

/** Adjust the published-post counter for each tag label, creating missing tag rows
 * on first use (tags are free-form, so creation happens lazily here — same role as
 * bumpCategoryCount). Counts clamp at 0. */
export async function bumpTagCounts(db: DB, labels: string[], delta: number): Promise<void> {
  const now = Date.now();
  const rows = dedupe(labels);
  if (!rows.length) return;
  await db
    .insert(tags)
    .values(rows.map(({ id, label }) => ({ id, label, postCount: Math.max(0, delta), createdAt: now })))
    .onConflictDoUpdate({
      target: tags.id,
      set: { postCount: sql`GREATEST(0, ${tags.postCount} + ${delta})` },
    });
}

/** Slug-keyed dedupe preserving the first-seen display label. */
function dedupe(labels: string[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const raw of labels) {
    const label = (raw || '').trim();
    const id = slugify(label);
    if (id && !seen.has(id)) seen.set(id, label);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

/** Tag-label diff for edits: returns [added, removed] between two tag lists. */
export function diffTags(before: string[], after: string[]): [string[], string[]] {
  const b = new Set(before.map((t) => slugify(t)));
  const a = new Set(after.map((t) => slugify(t)));
  return [after.filter((t) => !b.has(slugify(t))), before.filter((t) => !a.has(slugify(t)))];
}

/** Most-used tags (by published-post count) — feeds the search suggestion chips. */
export function topTags(db: DB, limit = 6): Promise<TagRow[]> {
  return db.select().from(tags).where(gt(tags.postCount, 0)).orderBy(desc(tags.postCount)).limit(limit);
}

/** Admin: every tag, busiest first (includes unused tags, postCount 0). */
export function listAllTags(db: DB): Promise<TagRow[]> {
  return db.select().from(tags).orderBy(desc(tags.postCount));
}

export async function getTagById(db: DB, id: string): Promise<TagRow | undefined> {
  const [row] = await db.select().from(tags).where(eq(tags.id, id));
  return row;
}

/** Admin: rename a tag's display label (slug/id is immutable). */
export async function renameTag(db: DB, id: string, label: string): Promise<TagRow | undefined> {
  const [row] = await db.update(tags).set({ label: label.trim() }).where(eq(tags.id, id)).returning();
  return row;
}

/** Admin: delete a tag row. Caller blocks this when postCount > 0 (posts keep
 * their jsonb tags, so an in-use tag would just reappear). */
export async function deleteTag(db: DB, id: string): Promise<void> {
  await db.delete(tags).where(eq(tags.id, id));
}

/** Tags whose label contains the query — drives the autocomplete's "Tags" group. */
export function searchTags(db: DB, q: string, limit = 6): Promise<TagRow[]> {
  const needle = q.trim().slice(0, 50);
  if (!needle) return Promise.resolve([]);
  return db
    .select()
    .from(tags)
    .where(sql`"tags"."label" ILIKE ${'%' + needle + '%'} AND "tags"."post_count" > 0`)
    .orderBy(desc(tags.postCount))
    .limit(limit);
}
