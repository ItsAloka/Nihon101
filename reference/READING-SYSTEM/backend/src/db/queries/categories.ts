import { eq, sql, desc } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../schema';
import { categories } from '../schema';

type DB = DrizzleD1Database<typeof schema>;
export type CategoryRow = typeof categories.$inferSelect;

/** Rotating hue pool for user-created categories (built-ins use --c-* vars). */
const HUE_POOL = ['--pink', '--teal', '--purple', '--amber', '--green', '--coral'];

/** 'Slice of Life' -> 'slice-of-life'. Empty result means invalid input. */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function listCategories(db: DB): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(desc(categories.postCount)).all();
}

export function getCategoryById(db: DB, id: string): Promise<CategoryRow | undefined> {
  return db.select().from(categories).where(eq(categories.id, id)).get();
}

/** Create a custom category, or return the existing one if the slug is taken. */
export async function getOrCreateCategory(
  db: DB,
  label: string,
  createdBy: string,
): Promise<CategoryRow> {
  const id = slugify(label);
  const existing = await getCategoryById(db, id);
  if (existing) return existing;

  const row: CategoryRow = {
    id,
    label: label.trim(),
    colorVar: HUE_POOL[Math.floor(Math.random() * HUE_POOL.length)],
    postCount: 0,
    createdBy,
    createdAt: new Date(),
  };
  await db.insert(categories).values(row);
  return row;
}

export function bumpCategoryCount(db: DB, id: string, delta: number): Promise<unknown> {
  // Clamp at 0 so decrements can never drive the count negative.
  return db
    .update(categories)
    .set({ postCount: sql`MAX(0, ${categories.postCount} + ${delta})` })
    .where(eq(categories.id, id));
}
