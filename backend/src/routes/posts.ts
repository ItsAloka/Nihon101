import { Hono, type Context } from 'hono';
import { getDb, getDbCached, standaloneDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { markTrendingDirty, markTranslateDirty } from '../lib/dirty';
import { findBlockedLink, findBlockedLinkHtml } from '../lib/linkGuard';
import { postMediaKeys, deleteMediaKeys } from '../lib/media';
import { embedText, postEmbedText, toVectorLiteral } from '../lib/embeddings';
import { posts } from '../db/schema';
import { sql, eq } from 'drizzle-orm';
import { verifyAccess } from '../lib/tokens';
import { getCategoryById, bumpCategoryCount } from '../db/queries/categories';
import { bumpTagCounts, diffTags } from '../db/queries/tags';
import {
  createPost,
  getPostById,
  getPostBySlug,
  getPostCounts,
  getPostWithAuthor,
  getPostWithAuthorBySlug,
  listPosts,
  listPostCards,
  listCardsByIds,
  updatePost,
  setPublishedAt,
  deletePost,
  publicPost,
  publicPostCard,
  PUBLIC_LIST_LIMIT,
  PUBLIC_LIST_MAX,
  type PostRow,
  type PostStatus,
  type PostDensity,
} from '../db/queries/posts';
import type { Locale } from '../lib/openai';
import { overAiQuota } from '../lib/aiQuota';
import { createNotification, notifyFollowersOfPost } from '../db/queries/notifications';
import { getUserById } from '../db/queries/users';
import { recordNotInterested } from '../db/queries/for-you';
import {
  togglePostLike,
  hasLikedPost,
  likedPostIds,
  togglePostSave,
  savedPostIds,
  listComments,
  createComment,
  getComment,
  deleteComment,
  toggleCommentLike,
  publicComment,
} from '../db/queries/engagement';

const app = new Hono<AppEnv>();
const db = (c: Context<AppEnv>) => getDb(c);
// Content-cache handle (60s Hyperdrive query cache in prod) — shared-content
// reads only; per-user state always reads through db(c). See db/client.ts.
const dbc = (c: Context<AppEnv>) => getDbCached(c);

const MAX_COMMENT = 4_000;

// Length caps (chars). Generous enough for long-form essays; block abuse / huge
// pastes that would bloat rows. Body is sanitized HTML, so it runs larger.
const MAX_TITLE = 300;
const MAX_EXCERPT = 600;
// 100K chars ≈ 5× the longest real post on either site (18.5K, measured on Not
// Bagel 07-25) — plenty for a monster essay, blocks row-bloat abuse (NB parity).
const MAX_BODY = 100_000;
// Length-cap THEN allowlist-sanitize, so the stored body is always safe HTML
// regardless of what was POSTed (the editor's output is trusted; the API is not).
const clampBody = (v: unknown) => sanitizeHtml(String(v ?? '').slice(0, MAX_BODY));

// In-body images per post. The cover is a separate field and is NOT counted.
// 50 matches Not Bagel's data-driven cap (07-25: longest real post used 18 —
// 50 keeps a big listicle workable while blocking page-weight abuse; reverses
// the 07-11 raise to 100, owner's call for NB parity).
const MAX_BODY_IMAGES = 50;
const imageCount = (html: string) => (html.match(/<img\b/gi) || []).length;
const tooManyImages = (...bodies: string[]) => bodies.some((b) => imageCount(b) > MAX_BODY_IMAGES);

const STATUSES: PostStatus[] = ['draft', 'published'];
const DENSITIES: PostDensity[] = ['compact', 'normal', 'relaxed'];
const parseDensity = (v: unknown, fallback: PostDensity): PostDensity =>
  DENSITIES.includes(v as PostDensity) ? (v as PostDensity) : fallback;
const parseLang = (v: unknown, fallback: Locale): Locale =>
  v === 'en' || v === 'ja' ? v : fallback;

/** True when a manual save can actually run a background translation: the flag
 * was sent, a key is configured, and the post's source language has text. The
 * caller stores translation_status='pending' in the SAME write as the post, so
 * the owner UI sees the state immediately. */
function canTranslate(c: Context<AppEnv>, post: Pick<PostRow, 'lang' | 'titleEn' | 'titleJa' | 'excerptEn' | 'excerptJa' | 'bodyEn' | 'bodyJa'>): boolean {
  if (!c.env.OPENAI_API_KEY) return false;
  const ja = post.lang === 'ja';
  return !!((ja ? post.titleJa : post.titleEn) || (ja ? post.excerptJa : post.excerptEn) || (ja ? post.bodyJa : post.bodyEn));
}

/* Translation itself does NOT run here anymore. A save/publish/retry only marks
 * the row translation_status='pending' (with fresh attempts/claim — see
 * enqueueTranslation); the per-minute scheduled() cron drains the queue
 * (lib/translation-sweep.ts). waitUntil gave the job ~30s before the isolate
 * was killed mid-flight, which stranded every long post at 'pending' forever;
 * the cron gets a 15-min wall budget and retries with a lease, so post size and
 * publish bursts can never kill a translation again. */

/** Queue-reset fields to ride the SAME write that sets 'pending': a fresh save
 * gets fresh attempts, and clearing the claim guards against a rare stale lease
 * from a prior run of this same post. */
const enqueueTranslation = { translationStatus: 'pending' as const, translationAttempts: 0, translationClaimedAt: null };

/** Fire-and-forget: embed a post's text into posts.embedding for the semantic layer
 * (For You flavor term + semantic search). Background, so publish stays instant; runs
 * AFTER translation would have a chance, but reads the post fresh so it embeds whatever
 * text exists. No key configured → no-op (the whole semantic layer is optional). */
function scheduleEmbedding(c: Context<AppEnv>, postId: string) {
  if (!c.env.OPENAI_EMBED_API_KEY) return;
  const job = (async () => {
    const { db: bgDb, pool } = standaloneDb(c.env);
    try {
      const [p] = await bgDb.select({
        titleEn: posts.titleEn, titleJa: posts.titleJa,
        excerptEn: posts.excerptEn, excerptJa: posts.excerptJa, bodyEn: posts.bodyEn,
      }).from(posts).where(eq(posts.id, postId));
      const text = p ? postEmbedText(p) : '';
      if (!text) return;
      const vec = await embedText(c.env.OPENAI_EMBED_API_KEY, text);
      await bgDb.execute(sql`UPDATE posts SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${postId}`);
    } catch { /* leave embedding null; next edit retries, backfill catches it */ }
    finally { try { await pool.end(); } catch { /* noop */ } }
  })();
  c.executionCtx.waitUntil(job);
}

/** Fan out "new post" notifications OFF the request path. The follower INSERT…SELECT
 *  shouldn't make a high-follower author's publish wait, so it runs in `waitUntil` on
 *  its own pool (the per-request pool is closed once the response is sent). */
function fanOutNewPost(c: Context<AppEnv>, authorId: string, postId: string): void {
  c.executionCtx.waitUntil((async () => {
    const { db: bgDb, pool } = standaloneDb(c.env);
    try { await notifyFollowersOfPost(bgDb, authorId, postId); }
    finally { try { await pool.end(); } catch { /* noop */ } }
  })());
}

/** Resolve the requester's id + role from the access token, or null if absent. */
async function currentUser(c: Context<AppEnv>): Promise<{ id: string; role: string } | null> {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await verifyAccess(c.env.JWT_SECRET, token);
    return { id: claims.sub, role: claims.role };
  } catch {
    return null;
  }
}

/** Just the requester's id (most callers don't need the role). */
async function currentUserId(c: Context<AppEnv>): Promise<string | null> {
  return (await currentUser(c))?.id ?? null;
}

/** A draft/hidden post is viewable only by its author or an admin; the public
 *  gets a 404 (drafts) or a hidden marker (hidden). Returns the gate decision. */
function viewerCanSeePrivate(
  post: { authorId: string; status: string; isHidden: boolean },
  viewer: { id: string; role: string } | null,
): boolean {
  return viewer != null && (viewer.id === post.authorId || viewer.role === 'admin');
}

function parseTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
}

function parseScore(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  const n = Number(input);
  if (Number.isNaN(n)) return null;
  return Math.min(10, Math.max(0, n));
}

// List posts. Published is public; drafts are owner-only.
app.get('/', limits.publicRead, async (c) => {
  const categoryId = c.req.query('cat') || undefined;
  const authorId = c.req.query('author') || undefined;
  const statusParam = c.req.query('status');

  if (statusParam === 'draft') {
    const uid = await currentUserId(c);
    if (!uid || (authorId && authorId !== uid)) return c.json({ error: 'unauthorized' }, 401);
    // Card shape: the drafts list never ships bodies — the editor fetches the
    // single post by id when opening one (GET /posts/:id).
    const rows = await listPosts(db(c), { categoryId, authorId: uid, status: 'draft', includeHidden: true });
    return c.json({ posts: rows.map((r) => publicPostCard(r)) });
  }

  // 'mine' → all of the requester's posts (drafts + published + hidden), owner-only.
  if (statusParam === 'mine') {
    const uid = await currentUserId(c);
    if (!uid) return c.json({ error: 'unauthorized' }, 401);
    const rows = await listPosts(db(c), { categoryId, authorId: uid, includeHidden: true });
    return c.json({ posts: rows.map((r) => publicPostCard(r, true)) }); // owner list — raw (unmasked)
  }

  // Default and 'published' → public. CARD shape (no bodies) + paginated, so a
  // public category/author listing can't be turned into an unbounded full-body
  // scrape. `page` is 0-based; `hasMore` lets a caller page without a COUNT.
  // Published listings are shared content — identical for every viewer — so they
  // read through the caching handle.
  const limit = Math.min(PUBLIC_LIST_MAX, Math.max(1, Number(c.req.query('limit')) || PUBLIC_LIST_LIMIT));
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const { cards, hasMore } = await listPostCards(
    dbc(c),
    { categoryId, authorId, status: 'published' },
    limit,
    page * limit,
  );
  return c.json({ posts: cards.map((r) => publicPostCard(r)), page, hasMore });
});

// Single post by slug (reading view). Drafts visible only to their author.
// Cached shell + live overlay: the heavy body/author row may be up to 60s stale
// (fine for prose). For a SIGNED-IN viewer the counters are re-read live and merged
// over it (read-your-own-writes — the like they just tapped is exact). An ANONYMOUS
// viewer (the bulk of traffic) can't change anything, so their counters come from the
// cached handle too: a ≤60s-stale like count is invisible, and it means a plain
// article read never wakes the Neon compute (it idle-scales to zero while logged-out
// browsing).
app.get('/slug/:slug', limits.publicRead, async (c) => {
  let post = await getPostWithAuthorBySlug(dbc(c), c.req.param('slug'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  const viewer = await currentUser(c);
  // Read-your-own-writes: the author just edited/published, so the cached shell
  // may be their pre-edit post. One live refetch, authors/admins only.
  if (viewerCanSeePrivate(post, viewer)) post = (await getPostWithAuthorBySlug(db(c), c.req.param('slug'))) ?? post;
  const privileged = viewerCanSeePrivate(post, viewer);
  if (post.status === 'draft' && !privileged) return c.json({ error: 'not_found' }, 404);
  // Moderator-hidden: tell the public it was removed (don't leak the body) but let
  // the author/admin still load it.
  if (post.isHidden && !privileged) return c.json({ error: 'hidden', hiddenReason: post.hiddenReason || null }, 451);
  const [liked, counts] = await Promise.all([
    hasLikedPost(db(c), post.id, viewer?.id ?? null),
    getPostCounts(viewer ? db(c) : dbc(c), post.id),
  ]);
  if (!counts) return c.json({ error: 'not_found' }, 404); // deleted; only the cache survived
  return c.json({ post: { ...publicPost({ ...post, ...counts }, privileged), liked } });
});

// The requester's saved posts, card shape, newest-saved-first. Registered before
// the `/:id` catch-all so "saved" isn't read as a post id.
app.get('/saved', requireAuth, async (c) => {
  const d = db(c);
  const ids = await savedPostIds(d, c.var.user!.id);
  const cards = await listCardsByIds(d, ids);
  return c.json({ posts: cards.map((r) => publicPostCard(r)) });
});

// Batched viewer like-state for a list of cards (SSR pages hydrate their hearts
// with this after the session resolves). Optional auth: logged-out → empty.
// Registered before `/:id` so "liked-state" isn't read as a post id.
app.get('/liked-state', limits.publicRead, async (c) => {
  const raw = (c.req.query('ids') || '').trim();
  if (!raw) return c.json({ liked: [] });
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const viewer = await currentUser(c);
  const set = await likedPostIds(db(c), viewer?.id ?? null, ids);
  return c.json({ liked: [...set] });
});

// Single post. Drafts visible only to their author. Same cached-shell +
// live-overlay pattern as /slug/:slug above.
app.get('/:id', limits.publicRead, async (c) => {
  let post = await getPostWithAuthor(dbc(c), c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  const viewer = await currentUser(c);
  if (viewerCanSeePrivate(post, viewer)) post = (await getPostWithAuthor(db(c), c.req.param('id'))) ?? post;
  const privileged = viewerCanSeePrivate(post, viewer);
  if (post.status === 'draft' && !privileged) return c.json({ error: 'not_found' }, 404);
  if (post.isHidden && !privileged) return c.json({ error: 'hidden', hiddenReason: post.hiddenReason || null }, 451);
  const [liked, counts] = await Promise.all([
    hasLikedPost(db(c), post.id, viewer?.id ?? null),
    getPostCounts(viewer ? db(c) : dbc(c), post.id),
  ]);
  if (!counts) return c.json({ error: 'not_found' }, 404);
  return c.json({ post: { ...publicPost({ ...post, ...counts }, privileged), liked } });
});

// Create a draft or published post.
app.post('/', requireAuth, limits.postCreate, async (c) => {
  const d = db(c);
  const body = await c.req.json().catch(() => null);

  const titleEn = String(body?.titleEn ?? '').trim().slice(0, MAX_TITLE);
  const titleJa = String(body?.titleJa ?? '').trim().slice(0, MAX_TITLE);
  const categoryId = String(body?.categoryId ?? '').trim();
  const status: PostStatus = STATUSES.includes(body?.status) ? body.status : 'draft';
  if (!titleEn && !titleJa) return c.json({ error: 'missing_title' }, 400);

  const category = await getCategoryById(d, categoryId);
  if (!category) return c.json({ error: 'invalid_category' }, 400);

  const bodyEn = clampBody(body?.bodyEn);
  const bodyJa = clampBody(body?.bodyJa);
  if (tooManyImages(bodyEn, bodyJa)) return c.json({ error: 'too_many_images' }, 400);

  const lang = parseLang(body?.lang, 'en');
  const excerptEn = String(body?.excerptEn ?? '').trim().slice(0, MAX_EXCERPT);
  const excerptJa = String(body?.excerptJa ?? '').trim().slice(0, MAX_EXCERPT);

  // PUBLISH-ONLY gates — never applied to drafts, so autosave can't be wedged
  // into a silent retry loop (autosave law).
  if (status === 'published') {
    // No links to pirate sites in public content (AdSense account-level ban risk,
    // and against /terms).
    const blockedLink = findBlockedLinkHtml(bodyEn) ?? findBlockedLinkHtml(bodyJa)
      ?? findBlockedLink(excerptEn) ?? findBlockedLink(excerptJa);
    if (blockedLink) {
      console.warn(JSON.stringify({ evt: 'piracy_link_blocked', kind: 'post', userId: c.var.user!.id, link: blockedLink }));
      return c.json({ error: 'piracy_link', link: blockedLink }, 400);
    }
    // Publishing needs a verified email (cuts throwaway-account spam) and a
    // one-time acceptance of the content guidelines (/terms).
    const author = await getUserById(d, c.var.user!.id);
    if (!author?.emailVerified) return c.json({ error: 'email_unverified' }, 403);
    if (!author.acceptedTermsAt) return c.json({ error: 'terms_not_accepted' }, 403);
  }
  // Explicit manual save (draft or publish) → fill the other language in the
  // background. Never set by autosave, so editing doesn't re-burn the API.
  // 'pending' rides the insert itself, so the owner UI knows from moment one.
  const translating = body?.translate === true
    && canTranslate(c, { lang, titleEn, titleJa, excerptEn, excerptJa, bodyEn, bodyJa });

  const post = await createPost(d, {
    authorId: c.var.user!.id,
    categoryId,
    lang,
    titleEn,
    titleJa,
    excerptEn,
    excerptJa,
    bodyEn,
    bodyJa,
    cover: body?.cover ? String(body.cover) : null,
    coverLabel: String(body?.coverLabel ?? '').trim().slice(0, 120),
    coverCredit: String(body?.coverCredit ?? '').trim().slice(0, 120),
    status,
    translationStatus: translating ? 'pending' : 'none',
    density: parseDensity(body?.density, 'compact'),
    score: parseScore(body?.score),
    tags: parseTags(body?.tags),
  });

  if (status === 'published') {
    await bumpCategoryCount(d, categoryId, 1);
    await bumpTagCounts(d, post.tags, 1);
    fanOutNewPost(c, post.authorId, post.id);
  }
  // Embed published posts for the semantic layer (no-op without an embed key).
  if (status === 'published') scheduleEmbedding(c, post.id);
  // Wake the next cron tick to drain the auto-translate queue (it sleeps otherwise).
  if (translating) markTranslateDirty(c);
  return c.json({ post: publicPost(post, true) }, 201);
});

// Update (owner only). Handles draft<->published count + category moves.
app.put('/:id', requireAuth, limits.postEdit, async (c) => {
  const d = db(c);
  const existing = await getPostById(d, c.req.param('id'));
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.authorId !== c.var.user!.id) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const nextStatus: PostStatus = STATUSES.includes(body?.status) ? body.status : existing.status;

  let nextCategoryId = existing.categoryId;
  if (body?.categoryId && body.categoryId !== existing.categoryId) {
    const category = await getCategoryById(d, String(body.categoryId));
    if (!category) return c.json({ error: 'invalid_category' }, 400);
    nextCategoryId = category.id;
  }

  const patch: Record<string, unknown> = { status: nextStatus, categoryId: nextCategoryId };
  if (body?.lang !== undefined) patch.lang = parseLang(body.lang, existing.lang as Locale);
  if (body?.titleEn !== undefined) patch.titleEn = String(body.titleEn).trim().slice(0, MAX_TITLE);
  if (body?.titleJa !== undefined) patch.titleJa = String(body.titleJa).trim().slice(0, MAX_TITLE);
  if (body?.excerptEn !== undefined) patch.excerptEn = String(body.excerptEn).trim().slice(0, MAX_EXCERPT);
  if (body?.excerptJa !== undefined) patch.excerptJa = String(body.excerptJa).trim().slice(0, MAX_EXCERPT);
  if (body?.bodyEn !== undefined) patch.bodyEn = clampBody(body.bodyEn);
  if (body?.bodyJa !== undefined) patch.bodyJa = clampBody(body.bodyJa);
  if (tooManyImages(String(patch.bodyEn ?? ''), String(patch.bodyJa ?? '')))
    return c.json({ error: 'too_many_images' }, 400);
  if (body?.cover !== undefined) patch.cover = body.cover ? String(body.cover) : null;
  if (body?.coverLabel !== undefined) patch.coverLabel = String(body.coverLabel).trim().slice(0, 120);
  if (body?.coverCredit !== undefined) patch.coverCredit = String(body.coverCredit).trim().slice(0, 120);
  if (body?.density !== undefined) patch.density = parseDensity(body.density, existing.density as PostDensity);
  if (body?.score !== undefined) patch.score = parseScore(body.score);
  if (body?.tags !== undefined) patch.tags = parseTags(body.tags);

  // PUBLISH-ONLY gates, checked against the post as it will exist AFTER this
  // edit (patched field, or the stored one when untouched) so publishing an old
  // draft is guarded even when the edit only flips status. Draft saves are
  // never blocked (autosave law).
  if (nextStatus === 'published') {
    const blockedLink = findBlockedLinkHtml(String(patch.bodyEn ?? existing.bodyEn ?? ''))
      ?? findBlockedLinkHtml(String(patch.bodyJa ?? existing.bodyJa ?? ''))
      ?? findBlockedLink(String(patch.excerptEn ?? existing.excerptEn ?? ''))
      ?? findBlockedLink(String(patch.excerptJa ?? existing.excerptJa ?? ''));
    if (blockedLink) {
      console.warn(JSON.stringify({ evt: 'piracy_link_blocked', kind: 'post', userId: c.var.user!.id, postId: existing.id, link: blockedLink }));
      return c.json({ error: 'piracy_link', link: blockedLink }, 400);
    }
    // Same gate as create: a draft only goes public once the email is verified
    // and the content guidelines are accepted.
    if (existing.status !== 'published') {
      const author = await getUserById(d, c.var.user!.id);
      if (!author?.emailVerified) return c.json({ error: 'email_unverified' }, 403);
      if (!author.acceptedTermsAt) return c.json({ error: 'terms_not_accepted' }, 403);
    }
  }

  // Explicit manual save (draft or publish), not autosave → queue the other
  // language for the cron sweep. Decide against the post as it will exist AFTER
  // this patch, and store 'pending' in the same write.
  const merged = { ...existing, ...patch } as PostRow;
  const translating = body?.translate === true && canTranslate(c, merged);
  if (translating) Object.assign(patch, enqueueTranslation);

  const post = await updatePost(d, existing.id, patch);

  // Reconcile published counts across status and category transitions.
  const wasPub = existing.status === 'published';
  const isPub = nextStatus === 'published';
  const oldTags = (existing.tags ?? []) as string[];
  const newTags = (patch.tags ?? oldTags) as string[];
  if (!wasPub && isPub) {
    await bumpCategoryCount(d, nextCategoryId, 1);
    await bumpTagCounts(d, newTags, 1);
    if (!existing.publishedAt) await setPublishedAt(d, existing.id, Date.now());
    // First time this post goes public → notify the author's followers (off the
    // request path so a high-follower publish returns instantly).
    fanOutNewPost(c, existing.authorId, existing.id);
  } else if (wasPub && !isPub) {
    await bumpCategoryCount(d, existing.categoryId, -1);
    await bumpTagCounts(d, oldTags, -1);
  } else if (wasPub && isPub) {
    if (nextCategoryId !== existing.categoryId) {
      await bumpCategoryCount(d, existing.categoryId, -1);
      await bumpCategoryCount(d, nextCategoryId, 1);
    }
    // Tag set may have changed while staying published — diff the counters.
    const [added, removed] = diffTags(oldTags, newTags);
    if (added.length) await bumpTagCounts(d, added, 1);
    if (removed.length) await bumpTagCounts(d, removed, -1);
  }

  // Re-embed when text changed on a published post (no-op without an embed key).
  if (post && post.status === 'published' && (body?.bodyEn !== undefined || body?.bodyJa !== undefined || body?.titleEn !== undefined || body?.titleJa !== undefined)) {
    scheduleEmbedding(c, post.id);
  }
  // Wake the next cron tick to drain the auto-translate queue (it sleeps otherwise).
  if (translating) markTranslateDirty(c);

  return c.json({ post: publicPost(post!, true) });
});

// Re-queue the background translation (owner only) — the recovery path for a
// 'failed' post (attempts exhausted) or a legacy 'none' one, surfaced as a chip
// on the owner's post cards. Resets attempts, so the cron gives it a fresh set.
// Unlike the publish-time queue this is an explicit spend, so it also checks
// the daily AI quota.
app.post('/:id/translate', requireAuth, limits.translate, async (c) => {
  const d = db(c);
  const existing = await getPostById(d, c.req.param('id'));
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.authorId !== c.var.user!.id) return c.json({ error: 'forbidden' }, 403);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'translate_unconfigured' }, 503);
  if (!canTranslate(c, existing)) return c.json({ error: 'nothing_to_translate' }, 400);
  if (await overAiQuota(c, c.var.user!.id)) return c.json({ error: 'ai_quota_exceeded' }, 429);

  await updatePost(d, existing.id, enqueueTranslation);
  markTranslateDirty(c); // wake the next cron tick to drain the queue
  return c.json({ translationStatus: 'pending' });
});

// Delete (owner only). Drop the published count if it was live.
app.delete('/:id', requireAuth, limits.postDelete, async (c) => {
  const d = db(c);
  const existing = await getPostById(d, c.req.param('id'));
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.authorId !== c.var.user!.id) return c.json({ error: 'forbidden' }, 403);

  await deletePost(d, existing.id);
  if (existing.status === 'published') {
    await bumpCategoryCount(d, existing.categoryId, -1);
    await bumpTagCounts(d, (existing.tags ?? []) as string[], -1);
  }
  // Free the post's blobs (cover + every in-body image) so a delete can't orphan
  // R2 objects. Background — the row is already gone, so this never delays the
  // response, and a slow/failed R2 delete is recoverable via the admin scanner.
  const keys = postMediaKeys(existing);
  if (keys.length) c.executionCtx.waitUntil(deleteMediaKeys(c.env, keys));
  return c.json({ ok: true });
});

// ---- Engagement: likes + comments (published posts only) ----------------

// Toggle the requester's like on a post.
app.post('/:id/like', requireAuth, limits.likePost, async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post || post.status !== 'published') return c.json({ error: 'not_found' }, 404);
  const res = await togglePostLike(d, post.id, c.var.user!.id);
  // Notify the author on a fresh like (not on unlike, not on self-like).
  if (res.liked) {
    await createNotification(d, {
      userId: post.authorId, type: 'like', actorId: c.var.user!.id, postId: post.id,
    });
  }
  markTrendingDirty(c);
  return c.json(res);
});

// Toggle the requester's save (bookmark) on a post, keyed by slug (the client
// works in slugs; the slug is unique). Returns the new state + the post's count.
app.post('/slug/:slug/save', requireAuth, limits.save, async (c) => {
  const d = db(c);
  const post = await getPostBySlug(d, c.req.param('slug'));
  if (!post || post.status !== 'published') return c.json({ error: 'not_found' }, 404);
  const res = await togglePostSave(d, post.id, c.var.user!.id);
  markTrendingDirty(c);
  return c.json(res);
});

// "Not interested": a deliberate negative signal — fades this post's category/tag/
// author from the user's taste profile AND drops it from their For You feed.
// Returns { ok }.
app.post('/:id/not-interested', requireAuth, limits.save, async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post || post.status !== 'published') return c.json({ error: 'not_found' }, 404);
  await recordNotInterested(d, post.id, c.var.user!.id);
  return c.json({ ok: true });
});

// List a post's comments (public). Includes the viewer's per-comment liked
// state when a valid token is present. Gated exactly like the post itself:
// drafts 404, moderator-hidden 451 — a hidden post's discussion must not stay
// readable through this side door when the body is already withheld.
app.get('/:id/comments', limits.publicRead, async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  const viewer = await currentUser(c);
  const privileged = viewerCanSeePrivate(post, viewer);
  if (post.status === 'draft' && !privileged) return c.json({ error: 'not_found' }, 404);
  if (post.isHidden && !privileged) return c.json({ error: 'hidden' }, 451);
  // Paginated: top-level comments via a keyset ?cursor (?sort=top|new); each
  // parent's replies ride along. Stays on the live handle — the page carries the
  // viewer's per-comment liked state. nextCursor is opaque; null = last page.
  const sort = c.req.query('sort') === 'top' ? 'top' as const : 'new' as const;
  const cursor = c.req.query('cursor') || undefined;
  const limit = Number(c.req.query('limit')) || undefined;
  const page = await listComments(d, post.id, viewer?.id ?? null, { sort, cursor, limit });
  return c.json({ comments: page.items.map(publicComment), total: page.total, nextCursor: page.nextCursor });
});

// Add a comment.
app.post('/:id/comments', requireAuth, limits.comment, async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post || post.status !== 'published') return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json().catch(() => null);
  const text = String(body?.body ?? '').trim().slice(0, MAX_COMMENT);
  if (!text) return c.json({ error: 'empty_comment' }, 400);
  // Comments are public content too — same piracy-link bar as post bodies.
  const blockedLink = findBlockedLink(text);
  if (blockedLink) {
    console.warn(JSON.stringify({ evt: 'piracy_link_blocked', kind: 'comment', userId: c.var.user!.id, link: blockedLink }));
    return c.json({ error: 'piracy_link', link: blockedLink }, 400);
  }

  // Resolve an optional reply target. Only one level is allowed, so a reply to a
  // reply is flattened onto the original top-level comment.
  let parentId: string | null = null;
  if (body?.parentId) {
    const parent = await getComment(d, String(body.parentId));
    if (!parent || parent.postId !== post.id) return c.json({ error: 'invalid_parent' }, 400);
    parentId = parent.parentId ?? parent.id;
  }
  const row = await createComment(d, post.id, c.var.user!.id, text, parentId);
  markTrendingDirty(c);
  const me = c.var.user!.id;
  const author = await getUserById(d, me); // token has no handle/avatar — fetch for the response
  // Notify the post author of a new comment; if this is a reply, also notify the
  // parent comment's author (skip dupes + self-notifications).
  await createNotification(d, { userId: post.authorId, type: 'comment', actorId: me, postId: post.id, commentId: row.id });
  if (parentId) {
    const parent = await getComment(d, parentId);
    if (parent && parent.userId !== post.authorId) {
      await createNotification(d, { userId: parent.userId, type: 'reply', actorId: me, postId: post.id, commentId: row.id });
    }
  }
  return c.json({ comment: publicComment({
    ...row,
    authorName: author?.displayName ?? c.var.user!.username,
    authorNameJa: author?.displayNameJa ?? null,
    authorHandle: author?.handle ?? null,
    authorAvatarUrl: author?.avatarUrl ?? null,
    liked: false,
  }) }, 201);
});

// Delete a comment (its author only — post owners moderate via the admin route).
app.delete('/:id/comments/:cid', requireAuth, limits.comment, async (c) => {
  const d = db(c);
  const comment = await getComment(d, c.req.param('cid'));
  if (!comment || comment.postId !== c.req.param('id')) return c.json({ error: 'not_found' }, 404);
  const uid = c.var.user!.id;
  // Only the comment's own author may delete it here. Moderating anyone else's
  // comment goes through the admin route (/admin/comments/:id), not the post author.
  if (comment.userId !== uid) return c.json({ error: 'forbidden' }, 403);
  await deleteComment(d, comment);
  return c.json({ ok: true });
});

// Toggle the requester's like on a comment.
app.post('/:id/comments/:cid/like', requireAuth, limits.likeComment, async (c) => {
  const d = db(c);
  const comment = await getComment(d, c.req.param('cid'));
  if (!comment || comment.postId !== c.req.param('id')) return c.json({ error: 'not_found' }, 404);
  const res = await toggleCommentLike(d, comment.id, c.var.user!.id);
  return c.json(res);
});

export default app;
