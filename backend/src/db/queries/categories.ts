import { eq, sql, desc } from 'drizzle-orm';
import type { DB } from '../client';
import { categories } from '../schema';
import { likeContains } from '../../lib/sql';

export type CategoryRow = typeof categories.$inferSelect;

/** Lowercase, ASCII-slug a label (used for category ids and post slugs). */
export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Bound the public category listing. Any signed-in user can create categories
// (rate-limited, but with no total cap), and this list ships in FULL on the home
// payload and the composer picker — so it must not scale with a spammer's output.
// Busiest-first means real categories always make the cut; empty junk sorts last
// and falls off. 200 is far past any curated magazine's real category count.
const CATEGORY_LIST_CAP = 200;

export function listCategories(db: DB): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(desc(categories.postCount)).limit(CATEGORY_LIST_CAP);
}

/** Categories whose EN or JA label contains the query — drives the autocomplete's
 * "Categories" group. Busiest first. */
export function searchCategories(db: DB, q: string, limit = 4): Promise<CategoryRow[]> {
  const needle = q.trim().slice(0, 50);
  if (!needle) return Promise.resolve([]);
  const like = likeContains(needle);
  return db
    .select()
    .from(categories)
    .where(sql`("categories"."label_en" ILIKE ${like} OR "categories"."label_ja" ILIKE ${like})`)
    .orderBy(desc(categories.postCount))
    .limit(limit);
}

export async function getCategoryById(db: DB, id: string): Promise<CategoryRow | undefined> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  return row;
}

export interface NewCategoryInput {
  labelEn: string;
  labelJa: string;
  kanji?: string;
  tint?: string;
  createdBy: string;
}

const TINTS = ['rose', 'amber', 'blue', 'lilac', 'peach', 'sage', 'clay', 'mauve', 'sky', 'cream'];

/** The valid category tints (admin colour picker + create). */
export const CATEGORY_TINTS = TINTS;

/** Create a user category. Derives a unique slug id from the English label. */
export async function createCategory(db: DB, input: NewCategoryInput): Promise<CategoryRow> {
  const base = slugify(input.labelEn) || slugify(input.labelJa) || 'tag';
  let id = base;
  let n = 0;
  while (await getCategoryById(db, id)) {
    n += 1;
    id = `${base}-${n}`;
  }
  const row: CategoryRow = {
    id,
    labelEn: input.labelEn,
    labelJa: input.labelJa,
    kanji: input.kanji ?? '',
    tint: input.tint ?? TINTS[Math.floor(Math.random() * TINTS.length)],
    postCount: 0,
    createdBy: input.createdBy,
    createdAt: Date.now(),
  };
  await db.insert(categories).values(row);
  return row;
}

/** Admin: edit a category's bilingual labels, kanji glyph, and/or tint. Returns
 * the new row, or undefined if the id doesn't exist. Only passed fields change. */
export async function updateCategory(
  db: DB,
  id: string,
  patch: { labelEn?: string; labelJa?: string; kanji?: string; tint?: string },
): Promise<CategoryRow | undefined> {
  const set: Partial<CategoryRow> = {};
  if (patch.labelEn !== undefined) set.labelEn = patch.labelEn.trim();
  if (patch.labelJa !== undefined) set.labelJa = patch.labelJa.trim();
  if (patch.kanji !== undefined) set.kanji = patch.kanji.trim();
  if (patch.tint !== undefined) set.tint = patch.tint;
  if (!Object.keys(set).length) return getCategoryById(db, id);
  const [row] = await db.update(categories).set(set).where(eq(categories.id, id)).returning();
  return row;
}

/** Admin: delete a category. The posts FK is ON DELETE RESTRICT, so a category
 * with posts can't be removed — guarded by the caller via postCount. */
export async function deleteCategory(db: DB, id: string): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

/** Bump a category's published-post counter by delta (never below 0). */
export function bumpCategoryCount(db: DB, id: string, delta: number): Promise<unknown> {
  return db
    .update(categories)
    .set({ postCount: sql`GREATEST(0, ${categories.postCount} + ${delta})` })
    .where(eq(categories.id, id));
}

/** Client-facing shape (mirrors frontend Category view). */
export function publicCategory(c: CategoryRow) {
  return {
    id: c.id,
    labelEn: c.labelEn,
    labelJa: c.labelJa,
    kanji: c.kanji,
    tint: c.tint,
    postCount: c.postCount,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
  };
}
