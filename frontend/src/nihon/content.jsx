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

// Downscale + re-encode to WebP in the browser BEFORE upload, so we store ~300KB
// instead of an 8MB phone photo (every reader then fetches the small file). We cap
// the longest edge — covers get 2400px (retina hero), body images 2000px — at
// quality 0.82, where WebP is visually indistinguishable from the original. GIFs
// are passed through untouched (re-encoding would kill the animation), and we keep
// the original if shrinking somehow made it bigger.
async function shrinkImage(file, maxEdge = 2000, quality = 0.82) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'image.webp', { type: 'image/webp' });
  } catch (e) { return file; }
}

// Upload one image (multipart) → R2. Returns its public URL. Retries once on 401.
// opts.maxEdge/quality tune the client-side shrink (defaults suit body images).
async function uploadImage(file, opts = {}) {
  const prepared = await shrinkImage(file, opts.maxEdge ?? 2000, opts.quality ?? 0.82);
  return rawUpload(prepared);
}

async function rawUpload(file, _retry = false) {
  const fd = new FormData();
  fd.append('file', file);
  const t = token();
  const res = await fetch(BASE() + '/media', {
    method: 'POST',
    headers: t ? { Authorization: 'Bearer ' + t } : {},
    body: fd,
  });
  if (res.status === 401 && t && !_retry) {
    try { await window.N101_API.refresh(); return rawUpload(file, true); } catch (e) {}
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
  toggleSave: (slug) => req(`/posts/slug/${slug}/save`, { method: 'POST', auth: true }), // → {saved, saves}
  // "Not interested": negative signal — fades this category/tag/author from the
  // viewer's taste and drops the post from their For You feed. → {ok}
  notInterested: (id) => req(`/posts/${id}/not-interested`, { method: 'POST', auth: true }),
  listSaved: () => req('/posts/saved', { auth: true }).then((r) => r.posts), // viewer's saved cards, newest first
  listComments: (id) => req(`/posts/${id}/comments`).then((r) => r.comments),
  addComment: (id, body, parentId) => req(`/posts/${id}/comments`, { method: 'POST', auth: true, body: { body, parentId: parentId || null } }).then((r) => r.comment),
  removeComment: (id, cid) => req(`/posts/${id}/comments/${cid}`, { method: 'DELETE', auth: true }),
  toggleCommentLike: (id, cid) => req(`/posts/${id}/comments/${cid}/like`, { method: 'POST', auth: true }), // → {liked, likes}
};

// ---- For You feed + follow graph + notifications (Phase 4) ----------------

const feedApi = {
  // The ranked For You feed. Personalized when a token is present (followed
  // authors boosted + category affinity), else trending+fresh. Returns the raw
  // backend cards + paging cursor; callers map via hydrateReal.
  forYou: ({ limit = 12, page = 0 } = {}) => {
    const q = new URLSearchParams({ limit: String(limit), page: String(page) });
    return req(`/feed?${q}`).then((r) => r); // { feed, total, personalized }
  },
  // Record that the viewer read a post — the affinity signal. Fire-and-forget.
  recordRead: (postId) => req(`/feed/read/${postId}`, { method: 'POST', auth: true }).catch(() => {}),
  // Record that the viewer clicked a SEARCH result — strongest signal (weight 5),
  // pivots the feed toward what they're exploring. Fire-and-forget.
  recordSearchClick: (postId) => req(`/feed/search-click/${postId}`, { method: 'POST', auth: true }).catch(() => {}),
};

const followApi = {
  // Handles the viewer follows: { id, handle }[].
  following: () => req('/users/me/following', { auth: true }).then((r) => r.following),
  follow: (idOrHandle) => req(`/users/${idOrHandle}/follow`, { method: 'POST', auth: true }), // → {following, followers}
  unfollow: (idOrHandle) => req(`/users/${idOrHandle}/follow`, { method: 'DELETE', auth: true }),
  // Readers (followers) / Writers (following) lists for the profile modal —
  // newest-follow-first, each row with the viewer's follow-state.
  // Optional `q` filters the list by name/handle (server-side ILIKE).
  followers: (handle, { page = 0, q = '' } = {}) => req(`/users/${handle}/followers?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.users),
  followingOf: (handle, { page = 0, q = '' } = {}) => req(`/users/${handle}/following?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.users),
};

// Relative "2h"/"3d" style stamp from an epoch-ms value.
function relTime(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// Backend notification → the prototype NotifPanel shape ({kind, who, text_*,
// when, read, route}). Both locales' text computed up front so the panel can
// switch language without a refetch.
function mapNotif(n) {
  const title = (n.postTitleEn || '').slice(0, 32);
  const titleJa = (n.postTitleJa || n.postTitleEn || '').slice(0, 24);
  const artRoute = n.postSlug ? { name: 'article', slug: n.postSlug } : { name: 'home' };
  // Comment/reply notifications deep-link to the exact comment (#comment-<id>),
  // not just the top of the post — mirrors Not Bagel's navToComment.
  const cmtRoute = n.postSlug && n.commentId
    ? { name: 'article', slug: n.postSlug, commentId: n.commentId } : artRoute;
  const byType = {
    like:    { kind: 'like',    en: `liked your story “${title}…”`, jp: 'があなたの記事にいいねしました', route: artRoute },
    comment: { kind: 'comment', en: `commented on “${title}…”`,     jp: 'があなたの記事にコメントしました', route: cmtRoute },
    reply:   { kind: 'comment', en: `replied to your comment`,       jp: 'があなたに返信しました',         route: cmtRoute },
    follow:  { kind: 'follow',  en: `started following you`,         jp: 'があなたをフォローしました',     route: n.actorHandle ? { name: 'author', slug: n.actorHandle } : { name: 'home' } },
    post:    { kind: 'system',  en: `published “${title}…”`,         jp: '新しい記事を公開しました',       route: artRoute },
  };
  const m = byType[n.type] || byType.post;
  return {
    id: n.id, kind: m.kind,
    who: n.actorName || 'Someone', who_jp: n.actorNameJa || n.actorName || 'だれか',
    text_en: m.en, text_jp: (n.type === 'post' ? '' : '') + m.jp,
    when: relTime(n.createdAt), read: !!n.readAt, route: m.route,
  };
}

const notifApi = {
  list: () => req('/notifications', { auth: true }).then((r) => ({ notifications: r.notifications.map(mapNotif), unread: r.unread })),
  markRead: () => req('/notifications/read', { method: 'POST', auth: true }).catch(() => {}),
  clearAll: () => req('/notifications', { method: 'DELETE', auth: true }).catch(() => {}),
};

// Newsletter signup (double opt-in: subscribe emails a 6-digit code, confirm types
// it back). Open to logged-out visitors; the token, if any, rides along so the
// backend can link the row to the signed-in user.
const newsletterApi = {
  subscribe: (email, locale) => req('/newsletter', { method: 'POST', body: { email, locale } }),
  confirm: (email, code) => req('/newsletter/confirm', { method: 'POST', body: { email, code } }),
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
    _real: true, _id: po.id, _authorId: po.authorId, _bodyEn: po.bodyEn, _bodyJa: po.bodyJa,
    _cover: (po.cover && /^https?:\/\//.test(po.cover)) ? po.cover : null,
    _coverLabel: po.coverLabel || '', _coverCredit: po.coverCredit || '',
    _density: po.density || 'compact',
    slug: po.slug, category: po.categoryId, status: po.status,
    title_en: po.titleEn, title_jp: po.titleJa,
    excerpt_en: po.excerptEn, excerpt_jp: po.excerptJa,
    kicker_en: '', kicker_jp: '',
    author: po.authorName || 'Unknown',
    author_jp: po.authorNameJa || po.authorName || 'Unknown',
    authorHandle: po.authorHandle || '',
    authorAvatarUrl: po.authorAvatarUrl || null,
    tags: po.tags || [],
    date,
    readMins: Math.max(1, Math.round(words / 200)),
    likes: po.likes || 0,
    liked: !!po.liked,
    commentCount: po.comments || 0,
  };
}

if (typeof window !== 'undefined') {
  window.N101_CONTENT = { categoryApi, postApi, feedApi, followApi, notifApi, newsletterApi, uploadImage, translate, hydrateReal };
  window.N101_CATS = catStore;
}
