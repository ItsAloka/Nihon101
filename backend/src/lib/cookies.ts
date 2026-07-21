import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

export const REFRESH_COOKIE = 'n101_rt';
export const TRUSTED_DEVICE_COOKIE = 'n101_td';
export const SESSION_HINT_COOKIE = 'n101_sess';

/* The real refresh cookie is HttpOnly and scoped to /auth on the API host, so the
 * frontend has no way to tell whether a session exists — it just POSTed
 * /auth/refresh on every page load and ate a 401 when nobody was logged in. That
 * cost a round trip on the critical path of every anonymous visit AND logged a
 * console error (Lighthouse best-practices, measured 96 not 100, 2026-07-21).
 *
 * This flag carries no session data — the literal string "1" — and exists only so
 * the frontend can skip the call. It is deliberately NOT HttpOnly (JS must read
 * it) and is scoped to the registrable domain so nihon101.com can see a cookie
 * set by api.nihon101.com. Possessing it grants nothing: every protected call
 * still needs the real token. Set/cleared in lockstep with the refresh cookie
 * below, so it can never outlive the session it describes. */
const hintDomain = (c: Context): string | undefined => {
  // Local dev is same-origin through the Vite proxy — no domain attribute there.
  const host = new URL(c.req.url).hostname;
  return host === 'nihon101.com' || host.endsWith('.nihon101.com') ? 'nihon101.com' : undefined;
};

// Host-only refresh cookie, scoped to /auth on the backend host. Strict so it
// never rides along on cross-site navigations; frontend reaches it via
// credentialed fetch (same-site: nihon101.com <-> api.nihon101.com).
export function setRefreshCookie(c: Context, token: string, maxAgeMs: number) {
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true, // browsers allow Secure cookies on http://localhost
    sameSite: 'Strict',
    path: '/auth',
    maxAge: Math.floor(maxAgeMs / 1000),
  });
  setCookie(c, SESSION_HINT_COOKIE, '1', {
    httpOnly: false, // the point of it: the frontend reads this one
    secure: true,
    sameSite: 'Lax',
    path: '/',
    domain: hintDomain(c),
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export function clearRefreshCookie(c: Context) {
  deleteCookie(c, REFRESH_COOKIE, { path: '/auth' });
  deleteCookie(c, SESSION_HINT_COOKIE, { path: '/', domain: hintDomain(c) });
}

export function readRefreshCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

// "Remember this device" cookie — same hardening as the refresh cookie (HttpOnly,
// Secure, Strict, scoped to /auth so it only rides on auth calls). A live match
// lets a device skip the login OTP.
export function setTrustedDeviceCookie(c: Context, token: string, maxAgeMs: number) {
  setCookie(c, TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/auth',
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export function readTrustedDeviceCookie(c: Context): string | undefined {
  return getCookie(c, TRUSTED_DEVICE_COOKIE);
}
