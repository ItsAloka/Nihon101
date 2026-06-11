import { eq } from 'drizzle-orm';
import type { DB } from '../client';
import { users } from '../schema';
import { slugify } from './categories';

export const HANDLE_RE = /^[a-z0-9-]{3,30}$/;

/** Unique handle from a display name (id tail fallback, numeric suffix on collision). */
export async function uniqueHandle(db: DB, displayName: string, idTail: string): Promise<string> {
  const base = slugify(displayName).slice(0, 30) || `user-${idTail}`;
  let candidate = base.length >= 3 ? base : `${base}-${idTail}`.slice(0, 30);
  let n = 1;
  while ((await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate)))[0]) {
    candidate = `${base.slice(0, 26)}-${++n}`;
  }
  return candidate;
}

export async function getUserByHandle(db: DB, handle: string) {
  const [u] = await db.select().from(users).where(eq(users.handle, handle));
  return u;
}

export async function handleTaken(db: DB, handle: string, exceptUserId?: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle));
  return !!row && row.id !== exceptUserId;
}
