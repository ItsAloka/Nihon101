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

async function register(email, password, displayName) {
  const d = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, locale: pageLocale() }) });
  accessToken = d.access;
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
  accessToken = d.access;
  return { user: d.user };
}
// Finish the OTP step. `remember` trusts this device for 30 days (skips OTP next time).
async function verifyOtp(pending, code, remember) {
  const d = await req('/auth/login/verify-otp', { method: 'POST', body: JSON.stringify({ pending, code, remember: !!remember }) });
  accessToken = d.access;
  return d.user;
}
// Mail a fresh code for the same pending login.
function resendOtp(pending) {
  return req('/auth/login/resend-otp', { method: 'POST', body: JSON.stringify({ pending, locale: pageLocale() }) });
}
// Single-flight: concurrent callers (app boot + a data fetch's 401 retry) must
// share ONE /auth/refresh, or the second one replays a rotated token and the
// reuse-detection revokes the whole family. Coalesce into one in-flight promise.
let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  refreshing = req('/auth/refresh', { method: 'POST' })
    .then((d) => { accessToken = d.access; return d.user; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
async function logout() {
  try { await req('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  accessToken = null;
}
const googleStartUrl = (lang) => `${API_BASE}/auth/google/start?locale=${loc(lang)}`;

// Partial profile update: { displayName?, handle?, bio?, location?, avatarUrl? }.
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

// Upload an avatar blob to R2 via /media; returns its public URL.
async function uploadAvatar(blob) {
  const form = new FormData();
  form.append('file', blob, 'avatar.webp');
  const res = await fetch(API_BASE + '/media', {
    method: 'POST',
    credentials: 'include',
    headers: accessToken ? { Authorization: 'Bearer ' + accessToken } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'upload_failed'), { status: res.status, code: data.error });
  return data.url;
}

if (typeof window !== 'undefined') {
  window.N101_API = { API_BASE, getAccessToken: () => accessToken, toAppUser, register, login, verifyOtp, resendOtp, refresh, logout, googleStartUrl, updateProfile, uploadAvatar, verifyEmail, resendVerification, getAccount, changePassword, deleteAccount, forgot, resetPassword, likedState };
}
