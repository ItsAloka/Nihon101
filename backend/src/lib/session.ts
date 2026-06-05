import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull } from 'drizzle-orm';
import { refreshTokens } from '../db/schema';
import { id } from './ids';
import { randomToken, hashToken } from './crypto';
import { REFRESH_TTL_MS } from './tokens';
import { setRefreshCookie } from './cookies';

const now = () => Date.now();

/** Mint a fresh refresh-token row in a (possibly new) family + set the cookie. */
export async function startSession(c: Context, userId: string, familyId?: string): Promise<string> {
  const db = drizzle(c.env.DB);
  const raw = randomToken();
  const rowId = id('rt');
  await db.insert(refreshTokens).values({
    id: rowId,
    userId,
    tokenHash: await hashToken(raw, c.env.REFRESH_PEPPER),
    familyId: familyId ?? id('fam'),
    userAgent: c.req.header('User-Agent') ?? null,
    expiresAt: now() + REFRESH_TTL_MS,
    createdAt: now(),
    revokedAt: null,
    replacedBy: null,
  });
  setRefreshCookie(c, raw, REFRESH_TTL_MS);
  return rowId;
}

/** Revoke every active token in a family (reuse detection / logout-all). */
export async function revokeFamily(c: Context, familyId: string): Promise<void> {
  const db = drizzle(c.env.DB);
  await db
    .update(refreshTokens)
    .set({ revokedAt: now() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}
