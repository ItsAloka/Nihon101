// api.jsx — backend auth client. Access token lives in memory ONLY (never
// localStorage); the session is restored from the HttpOnly refresh cookie via
// /auth/refresh on load. Loaded before app.jsx.
import "./report.js"; // installs global error / unhandledrejection hooks (SSR-safe)

// Dev (localhost) is same-origin: Vite proxies /auth,/posts,/categories,/media,
// /translate to :8787, so cookies (Path=/auth) work natively. Prod uses the API host.
const API_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
  ? ''
  : 'https://api.nihon101.com';

let accessToken = null;
const loc = (lang) => (lang === 'jp' ? 'ja' : 'en');

const TINTS = ['rose', 'amber', 'blue', 'lilac', 'peach', 'sage', 'clay', 'mauve', 'sky'];
const initialsOf = (name) =>
  (name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3) || 'YOU').toUpperCase();
const tintFor = (id) => {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
};

// Map a backend user -> the rich shape the rest of the SPA expects.
function toAppUser(u, prev) {
  const name = u.displayName || (u.email || '').split('@')[0];
  const fallbackSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'writer';
  return {
    ...(prev || {}),
    id: u.id, email: u.email, role: u.role,
    en: name, jp: u.displayNameJa || name,
    name_ja: u.displayNameJa || '',
    slug: u.handle || fallbackSlug,
    initials: initialsOf(name),
    tint: (prev && prev.tint) || tintFor(u.id),
    city: u.location || '—',
    bio_en: u.bio || 'New to nihon101.',
    bio_jp: u.bioJa || u.bio || 'nihon101をはじめました。',
    bio_en_raw: u.bio || '',
    bio_ja_raw: u.bioJa || '',
    avatarUrl: u.avatarUrl || null,
    bannerUrl: u.bannerUrl || null,
    posts: (prev && prev.posts) || 0,
  };
}

async function req(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status, code: data.error });
  return data;
}

// Current page locale, so the backend mails verification in the right language.
const pageLocale = () => (typeof location !== 'undefined' && location.pathname.startsWith('/en')) ? 'en' : 'ja';

async function register(email, password, displayName, turnstileToken) {
  const d = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, locale: pageLocale(), turnstileToken: turnstileToken || '' }) });
  accessToken = d.access; setSessionHint();
  return d.user;
}
// Confirm an email-verification token (from the emailed link). Public — no session.
function verifyEmail(token) {
  return req('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
}
// Re-send the verification email to the signed-in user (needs a live session).
function resendVerification() {
  return req('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ locale: pageLocale() }) });
}
// Returns either { user } (logged in) or { otpRequired:true, pending } when a
// second-factor code was mailed. The caller drives the OTP step from `pending`.
async function login(email, password) {
  const d = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, locale: pageLocale() }) });
  if (d.otpRequired) return { otpRequired: true, pending: d.pending };
  accessToken = d.access; setSessionHint();
  return { user: d.user };
}
// Finish the OTP step. `remember` trusts this device for 30 days (skips OTP next time).
async function verifyOtp(pending, code, remember) {
  const d = await req('/auth/login/verify-otp', { method: 'POST', body: JSON.stringify({ pending, code, remember: !!remember }) });
  accessToken = d.access; setSessionHint();
  return d.user;
}
// Mail a fresh code for the same pending login.
function resendOtp(pending) {
  return req('/auth/login/resend-otp', { method: 'POST', body: JSON.stringify({ pending, locale: pageLocale() }) });
}
// "Is anyone logged in?" — a non-secret flag the backend sets alongside the
// HttpOnly refresh cookie (see backend/src/lib/cookies.ts). The refresh cookie
// itself is invisible to JS, so without this every anonymous page view fired a
// POST /auth/refresh that came back 401: a wasted round trip during first paint
// and a console error on every visit. Absence means "definitely no session";
// presence means "probably", and a stale flag just costs the one 401 that clears
// it. Never trusted for anything beyond skipping that call.
const SESSION_HINT = 'n101_sess';
const HINT_MAX_AGE = 30 * 24 * 60 * 60; // matches REFRESH_TTL_MS on the server
const hintCookie = () =>
  typeof document !== 'undefined' && document.cookie.split('; ').some((p) => p.startsWith(SESSION_HINT + '='));
// `?signedin=1` is the Google callback's redirect marker: the session exists but
// its hint cookie rode in on a cross-site redirect, so don't bet the whole sign-in
// on that cookie having landed.
const justSignedIn = () =>
  typeof location !== 'undefined' && /[?&]signedin=1(&|$)/.test(location.search);
const hasSessionHint = () => hintCookie() || justSignedIn();

// Written by the server next to the refresh cookie; re-written here after every
// successful refresh so the flag can't quietly expire out from under a live
// session (and so a sign-in still survives a reload if the server's Set-Cookie
// was dropped for any reason).
const setSessionHint = () => {
  if (typeof document === 'undefined') return;
  const base = `${SESSION_HINT}=1; Max-Age=${HINT_MAX_AGE}; Path=/; SameSite=Lax`;
  document.cookie = location.protocol === 'https:' ? `${base}; Secure` : base;
};
const clearSessionHint = () => {
  if (typeof document === 'undefined') return;
  const base = `${SESSION_HINT}=; Max-Age=0; Path=/; SameSite=Lax`;
  document.cookie = base;
  if (location.hostname.endsWith('nihon101.com')) document.cookie = `${base}; Domain=nihon101.com; Secure`;
};

// Single-flight: concurrent callers (app boot + a data fetch's 401 retry) must
// share ONE /auth/refresh, or the second one replays a rotated token and the
// reuse-detection revokes the whole family. Coalesce into one in-flight promise.
let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  // No hint → no session. Reject in the same shape a 401 would, without the call.
  if (!hasSessionHint()) {
    accessToken = null;
    return Promise.reject(Object.assign(new Error('no_session'), { status: 401, code: 'no_session' }));
  }
  refreshing = req('/auth/refresh', { method: 'POST' })
    .then((d) => {
      accessToken = d.access;
      setSessionHint();
      // Drop ?signedin=1 from the address bar once it has done its job, so a
      // bookmark or a share never carries it.
      if (justSignedIn() && typeof history !== 'undefined' && history.replaceState) {
        const u = new URL(location.href);
        u.searchParams.delete('signedin');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
      return d.user;
    })
    .catch((e) => {
      // The flag outlived the session (expired/revoked). Drop it so the next page
      // load doesn't repeat the 401.
      if (e && e.status === 401) clearSessionHint();
      throw e;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}
async function logout() {
  try { await req('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  accessToken = null;
  clearSessionHint(); // belt: the logout response clears it too, but not if the call failed
}
const googleStartUrl = (lang) => `${API_BASE}/auth/google/start?locale=${loc(lang)}`;

// Partial profile update: { displayName?, handle?, bio?, location?, avatarUrl?, bannerUrl? }.
// avatarUrl/bannerUrl accept null to clear; the server only takes its own /media URLs.
async function updateProfile(patch) {
  const d = await req('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
  return d.user;
}
// Request a password-reset email. Always resolves (server never reveals if the
// address exists). The emailed link lands on /{loc}/reset?token=.
function forgot(email) {
  return req('/auth/forgot', { method: 'POST', body: JSON.stringify({ email, locale: pageLocale() }) });
}
// Consume a reset token from the emailed link; sets the new password.
function resetPassword(token, password) {
  return req('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
}

// Account detail for the settings screen: { user, hasPassword, google:{linked,email} }.
function getAccount() {
  return req('/auth/me', { method: 'GET' });
}
// Change password (verifies current). Other sessions are revoked server-side.
function changePassword(current, password) {
  return req('/auth/change-password', { method: 'POST', body: JSON.stringify({ current, password }) });
}
// GDPR erasure: delete the account; the FK cascade removes its whole footprint.
async function deleteAccount() {
  await req('/auth/me', { method: 'DELETE' });
  accessToken = null;
}

// Which of these post ids the signed-in viewer has liked (for hydrating SSR card
// hearts). Logged out / no session → []. Ensures the session first via the
// single-flight refresh, so it can't trip reuse-detection.
async function likedState(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  if (!accessToken) { try { await refresh(); } catch (e) { return []; } }
  try {
    const d = await req('/posts/liked-state?ids=' + ids.map(encodeURIComponent).join(','));
    return d.liked || [];
  } catch (e) { return []; }
}

// Upload a cropped image blob to R2 via /media; returns its public URL.
async function uploadImage(blob, name = 'image.webp') {
  const form = new FormData();
  form.append('file', blob, name);
  const res = await fetch(API_BASE + '/media', {
    method: 'POST',
    credentials: 'include',
    headers: accessToken ? { Authorization: 'Bearer ' + accessToken } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'upload_failed'), {
    status: res.status, code: data.error,
    retryAfterSec: Number(res.headers.get('Retry-After')) || undefined, // 429 = rate limit, not size
  });
  return data.url;
}
const uploadAvatar = (blob) => uploadImage(blob, 'avatar.webp');
const uploadBanner = (blob) => uploadImage(blob, 'banner.webp');

if (typeof window !== 'undefined') {
  window.N101_API = { API_BASE, getAccessToken: () => accessToken, toAppUser, register, login, verifyOtp, resendOtp, refresh, logout, googleStartUrl, updateProfile, uploadAvatar, uploadBanner, uploadImage, verifyEmail, resendVerification, getAccount, changePassword, deleteAccount, forgot, resetPassword, likedState };
}
