import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

export const REFRESH_COOKIE = 'n101_rt';
export const TRUSTED_DEVICE_COOKIE = 'n101_td';

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
}

export function clearRefreshCookie(c: Context) {
  deleteCookie(c, REFRESH_COOKIE, { path: '/auth' });
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
