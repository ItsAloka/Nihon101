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

/** Verify an access JWT; throws on invalid/expired. */
export async function verifyAccess(secret: string, token: string): Promise<AccessClaims> {
  return (await verify(token, secret, 'HS256')) as AccessClaims;
}
