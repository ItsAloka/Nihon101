// api.jsx — backend auth client. Access token lives in memory ONLY (never
// localStorage); the session is restored from the HttpOnly refresh cookie via
// /auth/refresh on load. Loaded before app.jsx.

const API_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
  ? 'http://localhost:8787'
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

// Map a backend user -> the rich shape the rest of the SPA expects. Merges over
// `prev` so local-only profile decoration (city/bio) survives until those move
// to the backend too.
function toAppUser(u, prev) {
  const name = u.displayName || (u.email || '').split('@')[0];
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'writer';
  return {
    ...(prev || {}),
    id: u.id, email: u.email, role: u.role,
    en: name, jp: name, slug,
    initials: initialsOf(name),
    tint: (prev && prev.tint) || tintFor(u.id),
    city: (prev && prev.city) || '—',
    bio_en: (prev && prev.bio_en) || 'New to nihon101.',
    bio_jp: (prev && prev.bio_jp) || 'nihon101をはじめました。',
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

async function register(email, password, displayName) {
  const d = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
  accessToken = d.access;
  return d.user;
}
async function login(email, password) {
  const d = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  accessToken = d.access;
  return d.user;
}
async function refresh() {
  const d = await req('/auth/refresh', { method: 'POST' });
  accessToken = d.access;
  return d.user;
}
async function logout() {
  try { await req('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  accessToken = null;
}
const googleStartUrl = (lang) => `${API_BASE}/auth/google/start?locale=${loc(lang)}`;

if (typeof window !== 'undefined') {
  window.N101_API = { API_BASE, getAccessToken: () => accessToken, toAppUser, register, login, refresh, logout, googleStartUrl };
}
