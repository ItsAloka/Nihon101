import { sign, verify } from 'hono/jwt';

export const ACCESS_TTL_SEC = 15 * 60; // 15 minutes — access token lives in frontend memory
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — opaque cookie token

export type AccessClaims = {
  sub: string; // user id
  role: 'user' | 'admin';
  name: string; // display name
  exp: number;
};

/** Sign a short-lived HS256 access JWT. */
export async function signAccess(
  secret: string,
  user: { id: string; role: string; displayName: string },
): Promise<string> {
  const payload: AccessClaims = {
    sub: user.id,
    role: user.role === 'admin' ? 'admin' : 'user',
    name: user.displayName,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC,
  };
  return sign(payload, secret, 'HS256');
}

/** Verify an access JWT; throws on invalid/expired/wrong-purpose. */
export async function verifyAccess(secret: string, token: string): Promise<AccessClaims> {
  const claims = (await verify(token, secret, 'HS256')) as AccessClaims & { purpose?: string };
  // Special-purpose tickets (the OTP `pending` ticket) are signed with the SAME
  // secret. Accepting one here would let a password-only attacker skip the OTP
  // step entirely: /login hands out that ticket before the second factor, and
  // requireAuth runs every protected route through this function. Any `purpose`
  // claim ⇒ not an access token, so reject it (throws → 401, matching all callers).
  if (claims.purpose !== undefined) throw new Error('wrong_token_purpose');
  return claims;
}

export const OTP_TICKET_TTL_SEC = 10 * 60; // 10 min — the OTP step must complete inside this

/** Sign a short-lived ticket that ties the OTP-verify step to a user without
 *  starting a session yet. purpose='otp' so it can't be replayed as an access token. */
export async function signOtpTicket(secret: string, userId: string): Promise<string> {
  return sign({ sub: userId, purpose: 'otp', exp: Math.floor(Date.now() / 1000) + OTP_TICKET_TTL_SEC }, secret, 'HS256');
}

/** Verify an OTP ticket; returns the user id or null on invalid/expired/wrong-purpose. */
export async function verifyOtpTicket(secret: string, token: string): Promise<string | null> {
  try {
    const claims = (await verify(token, secret, 'HS256')) as { sub: string; purpose?: string };
    return claims.purpose === 'otp' ? claims.sub : null;
  } catch {
    return null;
  }
}
