import { Hono, type Context } from 'hono';
import { getDb, standaloneDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { verifyAccess } from '../lib/tokens';
import { getCategoryById, bumpCategoryCount } from '../db/queries/categories';
import { bumpTagCounts, diffTags } from '../db/queries/tags';
import {
  createPost,
  getPostById,
  getPostWithAuthor,
  getPostWithAuthorBySlug,
  listPosts,
  updatePost,
  setPublishedAt,
  deletePost,
  publicPost,
  type PostRow,
  type PostStatus,
  type PostDensity,
} from '../db/queries/posts';
import { translateFields, type Locale } from '../lib/openai';
import {
  togglePostLike,
  hasLikedPost,
  listComments,
  createComment,
  getComment,
  deleteComment,
  toggleCommentLike,
  publicComment,
} from '../db/queries/engagement';

const app = new Hono<AppEnv>();
const db = (c: Context<AppEnv>) => getDb(c);

const MAX_COMMENT = 4_000;

// Length caps (chars). Generous enough for long-form essays; block abuse / huge
// pastes that would bloat D1 rows. Body is sanitized HTML, so it runs larger.
const MAX_TITLE = 300;
const MAX_EXCERPT = 600;
const MAX_BODY = 200_000;
const clampBody = (v: unknown) => String(v ?? '').slice(0, MAX_BODY);

const STATUSES: PostStatus[] = ['draft', 'published'];
const DENSITIES: PostDensity[] = ['compact', 'normal', 'relaxed'];
const parseDensity = (v: unknown, fallback: PostDensity): PostDensity =>
  DENSITIES.includes(v as PostDensity) ? (v as PostDensity) : fallback;
const parseLang = (v: unknown, fallback: Locale): Locale =>
  v === 'en' || v === 'ja' ? v : fallback;

/** Fire-and-forget: translate a freshly-published post's source language into
 * the other, then store it. Runs in the background (waitUntil) so Publish stays
 * instant. Only triggered by the explicit Publish action — never autosave — so
 * editing a live post doesn't re-burn the API on every keystroke. */
function scheduleTranslation(c: Context<AppEnv>, post: PostRow) {
  if (!c.env.OPENAI_API_KEY) return;
  const from: Locale = post.lang === 'ja' ? 'ja' : 'en';
  const to: Locale = from === 'en' ? 'ja' : 'en';
  const src = {
    title: from === 'en' ? post.titleEn : post.titleJa,
    excerpt: from === 'en' ? post.excerptEn : post.excerptJa,
    body: from === 'en' ? post.bodyEn : post.bodyJa,
  };
  if (!src.title && !src.excerpt && !src.body) return;

  const job = (async () => {
    // Own pool — this outlives the request, so it can't share the request pool
    // (which the cleanup middleware closes when the response is sent).
    const { db: bgDb, pool } = standaloneDb(c.env);
    try {
      const out = await translateFields(c.env.OPENAI_API_KEY, to, src);
      const patch: Record<string, unknown> = {};
      if (out.title != null) patch[to === 'en' ? 'titleEn' : 'titleJa'] = out.title;
      if (out.excerpt != null) patch[to === 'en' ? 'excerptEn' : 'excerptJa'] = out.excerpt;
      if (out.body != null) patch[to === 'en' ? 'bodyEn' : 'bodyJa'] = out.body;
      if (Object.keys(patch).length) await updatePost(bgDb, post.id, patch);
    } catch { /* leave the other locale empty; next publish retries */ }
    finally { try { await pool.end(); } catch { /* noop */ } }
  })();
  c.executionCtx.waitUntil(job);
}

/** Resolve the requester's id from the access token, or null if absent/invalid. */
async function currentUserId(c: Context<AppEnv>): Promise<string | null> {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await verifyAccess(c.env.JWT_SECRET, token);
    return claims.sub;
  } catch {
    return null;
  }
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
app.get('/', async (c) => {
  const categoryId = c.req.query('cat') || undefined;
  const authorId = c.req.query('author') || undefined;
  const statusParam = c.req.query('status');

  if (statusParam === 'draft') {
    const uid = await currentUserId(c);
    if (!uid || (authorId && authorId !== uid)) return c.json({ error: 'unauthorized' }, 401);
    const rows = await listPosts(db(c), { categoryId, authorId: uid, status: 'draft' });
    return c.json({ posts: rows.map(publicPost) });
  }

  // 'mine' → all of the requester's posts (drafts + published), owner-only.
  if (statusParam === 'mine') {
    const uid = await currentUserId(c);
    if (!uid) return c.json({ error: 'unauthorized' }, 401);
    const rows = await listPosts(db(c), { categoryId, authorId: uid });
    return c.json({ posts: rows.map(publicPost) });
  }

  // Default and 'published' → public.
  const rows = await listPosts(db(c), { categoryId, authorId, status: 'published' });
  return c.json({ posts: rows.map(publicPost) });
});

// Single post by slug (reading view). Drafts visible only to their author.
app.get('/slug/:slug', async (c) => {
  const post = await getPostWithAuthorBySlug(db(c), c.req.param('slug'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  const uid = await currentUserId(c);
  if (post.status === 'draft' && uid !== post.authorId)
    return c.json({ error: 'not_found' }, 404);
  const liked = await hasLikedPost(db(c), post.id, uid);
  return c.json({ post: { ...publicPost(post), liked } });
});

// Single post. Drafts visible only to their author.
app.get('/:id', async (c) => {
  const post = await getPostWithAuthor(db(c), c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  const uid = await currentUserId(c);
  if (post.status === 'draft' && uid !== post.authorId)
    return c.json({ error: 'not_found' }, 404);
  const liked = await hasLikedPost(db(c), post.id, uid);
  return c.json({ post: { ...publicPost(post), liked } });
});

// Create a draft or published post.
app.post('/', requireAuth, async (c) => {
  const d = db(c);
  const body = await c.req.json().catch(() => null);

  const titleEn = String(body?.titleEn ?? '').trim().slice(0, MAX_TITLE);
  const titleJa = String(body?.titleJa ?? '').trim().slice(0, MAX_TITLE);
  const categoryId = String(body?.categoryId ?? '').trim();
  const status: PostStatus = STATUSES.includes(body?.status) ? body.status : 'draft';
  if (!titleEn && !titleJa) return c.json({ error: 'missing_title' }, 400);

  const category = await getCategoryById(d, categoryId);
  if (!category) return c.json({ error: 'invalid_category' }, 400);

  const post = await createPost(d, {
    authorId: c.var.user!.id,
    categoryId,
    lang: parseLang(body?.lang, 'en'),
    titleEn,
    titleJa,
    excerptEn: String(body?.excerptEn ?? '').trim().slice(0, MAX_EXCERPT),
    excerptJa: String(body?.excerptJa ?? '').trim().slice(0, MAX_EXCERPT),
    bodyEn: clampBody(body?.bodyEn),
    bodyJa: clampBody(body?.bodyJa),
    cover: body?.cover ? String(body.cover) : null,
    coverLabel: String(body?.coverLabel ?? '').trim().slice(0, 120),
    coverCredit: String(body?.coverCredit ?? '').trim().slice(0, 120),
    status,
    density: parseDensity(body?.density, 'compact'),
    score: parseScore(body?.score),
    tags: parseTags(body?.tags),
  });

  if (status === 'published') {
    await bumpCategoryCount(d, categoryId, 1);
    await bumpTagCounts(d, post.tags, 1);
  }
  // Explicit manual save (draft or publish) → fill the other language in the
  // background. Never set by autosave, so editing doesn't re-burn the API.
  if (body?.translate === true) scheduleTranslation(c, post);
  return c.json({ post: publicPost(post) }, 201);
});

// Update (owner only). Handles draft<->published count + category moves.
app.put('/:id', requireAuth, async (c) => {
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
  if (body?.cover !== undefined) patch.cover = body.cover ? String(body.cover) : null;
  if (body?.coverLabel !== undefined) patch.coverLabel = String(body.coverLabel).trim().slice(0, 120);
  if (body?.coverCredit !== undefined) patch.coverCredit = String(body.coverCredit).trim().slice(0, 120);
  if (body?.density !== undefined) patch.density = parseDensity(body.density, existing.density as PostDensity);
  if (body?.score !== undefined) patch.score = parseScore(body.score);
  if (body?.tags !== undefined) patch.tags = parseTags(body.tags);

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

  // Explicit manual save (draft or publish), not autosave → refill the other
  // language in the background.
  if (body?.translate === true && post) scheduleTranslation(c, post);

  return c.json({ post: publicPost(post!) });
});

// Delete (owner only). Drop the published count if it was live.
app.delete('/:id', requireAuth, async (c) => {
  const d = db(c);
  const existing = await getPostById(d, c.req.param('id'));
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.authorId !== c.var.user!.id) return c.json({ error: 'forbidden' }, 403);

  await deletePost(d, existing.id);
  if (existing.status === 'published') {
    await bumpCategoryCount(d, existing.categoryId, -1);
    await bumpTagCounts(d, (existing.tags ?? []) as string[], -1);
  }
  return c.json({ ok: true });
});

// ---- Engagement: likes + comments (published posts only) ----------------

// Toggle the requester's like on a post.
app.post('/:id/like', requireAuth, async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post || post.status !== 'published') return c.json({ error: 'not_found' }, 404);
  const res = await togglePostLike(d, post.id, c.var.user!.id);
  return c.json(res);
});

// List a post's comments (public). Includes the viewer's per-comment liked
// state when a valid token is present.
app.get('/:id/comments', async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  if (post.status === 'draft' && (await currentUserId(c)) !== post.authorId)
    return c.json({ error: 'not_found' }, 404);
  const rows = await listComments(d, post.id, await currentUserId(c));
  return c.json({ comments: rows.map(publicComment) });
});

// Add a comment.
app.post('/:id/comments', requireAuth, async (c) => {
  const d = db(c);
  const post = await getPostById(d, c.req.param('id'));
  if (!post || post.status !== 'published') return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json().catch(() => null);
  const text = String(body?.body ?? '').trim().slice(0, MAX_COMMENT);
  if (!text) return c.json({ error: 'empty_comment' }, 400);

  // Resolve an optional reply target. Only one level is allowed, so a reply to a
  // reply is flattened onto the original top-level comment.
  let parentId: string | null = null;
  if (body?.parentId) {
    const parent = await getComment(d, String(body.parentId));
    if (!parent || parent.postId !== post.id) return c.json({ error: 'invalid_parent' }, 400);
    parentId = parent.parentId ?? parent.id;
  }
  const row = await createComment(d, post.id, c.var.user!.id, text, parentId);
  return c.json({ comment: publicComment({ ...row, authorName: c.var.user!.username, liked: false }) }, 201);
});

// Delete a comment (its author or the post's owner).
app.delete('/:id/comments/:cid', requireAuth, async (c) => {
  const d = db(c);
  const comment = await getComment(d, c.req.param('cid'));
  if (!comment || comment.postId !== c.req.param('id')) return c.json({ error: 'not_found' }, 404);
  const post = await getPostById(d, comment.postId);
  const uid = c.var.user!.id;
  if (comment.userId !== uid && post?.authorId !== uid) return c.json({ error: 'forbidden' }, 403);
  await deleteComment(d, comment);
  return c.json({ ok: true });
});

// Toggle the requester's like on a comment.
app.post('/:id/comments/:cid/like', requireAuth, async (c) => {
  const d = db(c);
  const comment = await getComment(d, c.req.param('cid'));
  if (!comment || comment.postId !== c.req.param('id')) return c.json({ error: 'not_found' }, 404);
  const res = await toggleCommentLike(d, comment.id, c.var.user!.id);
  return c.json(res);
});

export default app;
