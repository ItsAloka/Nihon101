import { eq, sql, desc } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../schema';
import { categories } from '../schema';
import { id as newId } from '../../lib/ids';

type DB = DrizzleD1Database<typeof schema>;
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

export function listCategories(db: DB): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(desc(categories.postCount)).all();
}

export function getCategoryById(db: DB, id: string): Promise<CategoryRow | undefined> {
  return db.select().from(categories).where(eq(categories.id, id)).get();
}

export interface NewCategoryInput {
  labelEn: string;
  labelJa: string;
  kanji?: string;
  tint?: string;
  createdBy: string;
}

const TINTS = ['rose', 'amber', 'blue', 'lilac', 'peach', 'sage', 'clay', 'mauve', 'sky'];

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

/** Bump a category's published-post counter by delta (never below 0). */
export function bumpCategoryCount(db: DB, id: string, delta: number): Promise<unknown> {
  return db
    .update(categories)
    .set({ postCount: sql`MAX(0, ${categories.postCount} + ${delta})` })
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
