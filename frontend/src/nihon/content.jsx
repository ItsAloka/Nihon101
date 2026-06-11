// content.jsx — blog content API client (categories + posts + media + translate).
// Talks to the Worker, reusing the in-memory access token from api.jsx. One
// silent /auth/refresh + replay on a 401 (mirrors api.jsx). Loaded after api.jsx.

const BASE = () => window.N101_API.API_BASE;
const token = () => window.N101_API.getAccessToken();

async function req(path, { method = 'GET', body, auth = false, _retry = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t = token();
  if (t) headers['Authorization'] = 'Bearer ' + t;

  const res = await fetch(BASE() + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: auth ? 'include' : 'same-origin',
  });

  // Retry once via refresh on a 401. Also fires when we had no token yet (an
  // auth call racing the app's boot refresh — the session restores, then replays).
  if (res.status === 401 && (t || auth) && !_retry && path !== '/auth/refresh') {
    try { await window.N101_API.refresh(); return req(path, { method, body, auth, _retry: true }); }
    catch (e) { /* fall through to error */ }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status, code: data.error });
  return data;
}

// Upload one image (multipart) → R2. Returns its public URL. Retries once on 401.
async function uploadImage(file, _retry = false) {
  const fd = new FormData();
  fd.append('file', file);
  const t = token();
  const res = await fetch(BASE() + '/media', {
    method: 'POST',
    headers: t ? { Authorization: 'Bearer ' + t } : {},
    body: fd,
  });
  if (res.status === 401 && t && !_retry) {
    try { await window.N101_API.refresh(); return uploadImage(file, true); } catch (e) {}
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'upload_failed'), { status: res.status, code: data.error });
  return data.url;
}

const categoryApi = {
  list: () => req('/categories').then((r) => r.categories),
  create: (input) => req('/categories', { method: 'POST', auth: true, body: input }).then((r) => r.category),
};

// Category store — single source of truth for the live category table. The
// backend returns them ordered by post_count desc; we cache once and let any
// screen subscribe (composer, profile now; explore / hot-topics later).
let _cats = null;            // CategoryRow[] once loaded
let _catsPromise = null;
const _catSubs = new Set();
const catStore = {
  get: () => _cats,
  load: () => {
    if (_catsPromise) return _catsPromise;
    _catsPromise = categoryApi.list()
      .then((list) => { _cats = list; _catSubs.forEach((fn) => fn(_cats)); return list; })
      .catch((e) => { _catsPromise = null; throw e; });
    return _catsPromise;
  },
  refresh: () => { _catsPromise = null; return catStore.load(); },
  byId: (id) => (_cats || []).find((c) => c.id === id) || null,
  subscribe: (fn) => { _catSubs.add(fn); return () => _catSubs.delete(fn); },
};

const postApi = {
  // params: { cat, author, status: 'published'|'draft'|'mine' }
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.cat) q.set('cat', params.cat);
    if (params.author) q.set('author', params.author);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    const owner = params.status === 'draft' || params.status === 'mine';
    return req(`/posts${qs ? `?${qs}` : ''}`, { auth: owner }).then((r) => r.posts);
  },
  get: (id) => req(`/posts/${id}`).then((r) => r.post),
  getBySlug: (slug) => req(`/posts/slug/${slug}`).then((r) => r.post),
  create: (body) => req('/posts', { method: 'POST', auth: true, body }).then((r) => r.post),
  update: (id, body) => req(`/posts/${id}`, { method: 'PUT', auth: true, body }).then((r) => r.post),
  remove: (id) => req(`/posts/${id}`, { method: 'DELETE', auth: true }),

  // Engagement (real posts only — seed posts have no backend row).
  toggleLike: (id) => req(`/posts/${id}/like`, { method: 'POST', auth: true }), // → {liked, likes}
  listComments: (id) => req(`/posts/${id}/comments`).then((r) => r.comments),
  addComment: (id, body, parentId) => req(`/posts/${id}/comments`, { method: 'POST', auth: true, body: { body, parentId: parentId || null } }).then((r) => r.comment),
  removeComment: (id, cid) => req(`/posts/${id}/comments/${cid}`, { method: 'DELETE', auth: true }),
  toggleCommentLike: (id, cid) => req(`/posts/${id}/comments/${cid}/like`, { method: 'POST', auth: true }), // → {liked, likes}
};

// Translate { title?, excerpt?, body? } into `to` ('en'|'ja') via ChatGPT.
const translate = (to, fields) =>
  req('/translate', { method: 'POST', auth: true, body: { to, fields } }).then((r) => r.fields);

// Map a backend post → the view shape ArticlePage reads. `_real` flags it so the
// reading view renders the stored HTML body (per locale) instead of seed arrays.
function hydrateReal(po) {
  const ms = po.publishedAt || po.createdAt;
  const date = new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const words = String(po.bodyEn || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return {
    _real: true, _id: po.id, _authorId: po.authorId, _bodyEn: po.bodyEn, _bodyJa: po.bodyJa, _cover: po.cover,
    _coverLabel: po.coverLabel || '', _coverCredit: po.coverCredit || '',
    _density: po.density || 'compact',
    slug: po.slug, category: po.categoryId, status: po.status,
    title_en: po.titleEn, title_jp: po.titleJa,
    excerpt_en: po.excerptEn, excerpt_jp: po.excerptJa,
    kicker_en: '', kicker_jp: '',
    author: po.authorName || 'Unknown',
    author_jp: po.authorNameJa || po.authorName || 'Unknown',
    authorHandle: po.authorHandle || '',
    date,
    readMins: Math.max(1, Math.round(words / 200)),
    likes: po.likes || 0,
    liked: !!po.liked,
    commentCount: po.comments || 0,
  };
}

if (typeof window !== 'undefined') {
  window.N101_CONTENT = { categoryApi, postApi, uploadImage, translate, hydrateReal };
  window.N101_CATS = catStore;
}
