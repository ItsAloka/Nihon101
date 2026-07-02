/* Retention sweeps for the auth tables (run hourly by the cron in index.ts). Each
 * of these tables gets one INSERT per auth action and had no delete path except the
 * narrow "used it" / "reset my account" cases, so revoked/expired/consumed rows
 * accumulated forever — a rotating-refresh scheme writes a row every ~15 min of
 * active use. Everything deleted here is already dead: a revoked or past-expiry
 * token/code is rejected by its verify path, and an expired trusted-device row can
 * no longer skip OTP. Each delete is bounded by an indexed timestamp predicate. */
import { lt, or, isNotNull } from 'drizzle-orm';
import type { DB } from '../client';
import { refreshTokens, passwordResets, emailVerifications, loginOtps, trustedDevices } from '../schema';

/** Drop refresh rows that can no longer authenticate: already revoked (revokedAt
 *  set), or expired. getRefreshByHash / rotation rejects both, so deleting them is
 *  safe. Kept a day past expiry as a small margin. Returns rows removed. */
export async function pruneDeadRefreshTokens(db: DB, graceMs = 24 * 60 * 60 * 1000): Promise<number> {
  const removed = await db.delete(refreshTokens)
    .where(or(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.expiresAt, Date.now() - graceMs)))
    .returning({ id: refreshTokens.id });
  return removed.length;
}

/** Drop consumed/expired single-use auth artifacts across the four token tables.
 *  Returns total rows removed. */
export async function pruneExpiredAuthArtifacts(db: DB, graceMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - graceMs;
  const [pr, ev, otp, td] = await Promise.all([
    db.delete(passwordResets)
      .where(or(isNotNull(passwordResets.usedAt), lt(passwordResets.expiresAt, cutoff)))
      .returning({ id: passwordResets.id }),
    db.delete(emailVerifications)
      .where(or(isNotNull(emailVerifications.usedAt), lt(emailVerifications.expiresAt, cutoff)))
      .returning({ id: emailVerifications.id }),
    db.delete(loginOtps)
      .where(or(isNotNull(loginOtps.usedAt), lt(loginOtps.expiresAt, cutoff)))
      .returning({ id: loginOtps.id }),
    db.delete(trustedDevices)
      .where(lt(trustedDevices.expiresAt, cutoff))
      .returning({ id: trustedDevices.id }),
  ]);
  return pr.length + ev.length + otp.length + td.length;
}
