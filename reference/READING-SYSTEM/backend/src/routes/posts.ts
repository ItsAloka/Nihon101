import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { verifyJwt } from '../lib/crypto';
import { getCategoryById, bumpCategoryCount } from '../db/queries/categories';
import {
  createPost,
  getPostById,
  getPostWithAuthor,
  listPosts,
  updatePost,
  setPublishedAt,
  deletePost,
  publicPost,
  type PostStatus,
  type PostDensity,
} from '../db/queries/posts';

const app = new Hono<AppEnv>();

const STATUSES: PostStatus[] = ['draft', 'published'];
const DENSITIES: PostDensity[] = ['compact', 'normal', 'relaxed'];
const parseDensity = (v: unknown, fallback: PostDensity): PostDensity =>
  DENSITIES.includes(v as PostDensity) ? (v as PostDensity) : fallback;

/** Resolve the requester's id from the access token, or null if absent/invalid. */
async function currentUserId(c: Context<AppEnv>): Promise<string | null> {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const claims = await verifyJwt(token, c.env.JWT_SECRET);
  return claims?.sub ?? null;
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
  const db = c.var.db;
  const categoryId = c.req.query('cat') || undefined;
  const authorId = c.req.query('author') || undefined;
  const statusParam = c.req.query('status');

  if (statusParam === 'draft') {
    const uid = await currentUserId(c);
    if (!uid || (authorId && authorId !== uid)) return c.json({ error: 'unauthorized' }, 401);
    const rows = await listPosts(db, { categoryId, authorId: uid, status: 'draft' });
    return c.json({ posts: rows.map(publicPost) });
  }

  // Default and 'published' → public.
  const rows = await listPosts(db, { categoryId, authorId, status: 'published' });
  return c.json({ posts: rows.map(publicPost) });
});

// Single post. Drafts visible only to their author.
app.get('/:id', async (c) => {
  const post = await getPostWithAuthor(c.var.db, c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  if (post.status === 'draft' && (await currentUserId(c)) !== post.authorId)
    return c.json({ error: 'not_found' }, 404);
  return c.json({ post: publicPost(post) });
});

// Create a draft or published post.
app.post('/', requireAuth, async (c) => {
  const db = c.var.db;
  const body = await c.req.json().catch(() => null);

  const title = String(body?.title ?? '').trim();
  const categoryId = String(body?.categoryId ?? '').trim();
  const status: PostStatus = STATUSES.includes(body?.status) ? body.status : 'draft';
  if (!title) return c.json({ error: 'missing_title' }, 400);

  const category = await getCategoryById(db, categoryId);
  if (!category) return c.json({ error: 'invalid_category' }, 400);

  const post = await createPost(db, {
    authorId: c.var.user.id,
    categoryId,
    title,
    excerpt: String(body?.excerpt ?? '').trim(),
    cover: body?.cover ? String(body.cover) : null,
    body: String(body?.body ?? ''),
    status,
    density: parseDensity(body?.density, 'compact'),
    score: parseScore(body?.score),
    tags: parseTags(body?.tags),
  });

  if (status === 'published') await bumpCategoryCount(db, categoryId, 1);
  return c.json({ post: publicPost(post) }, 201);
});

// Update (owner only). Handles draft<->published count + category moves.
app.put('/:id', requireAuth, async (c) => {
  const db = c.var.db;
  const existing = await getPostById(db, c.req.param('id'));
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.authorId !== c.var.user.id) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const nextStatus: PostStatus = STATUSES.includes(body?.status) ? body.status : existing.status;

  let nextCategoryId = existing.categoryId;
  if (body?.categoryId && body.categoryId !== existing.categoryId) {
    const category = await getCategoryById(db, String(body.categoryId));
    if (!category) return c.json({ error: 'invalid_category' }, 400);
    nextCategoryId = category.id;
  }

  const patch: Record<string, unknown> = { status: nextStatus, categoryId: nextCategoryId };
  if (body?.title !== undefined) patch.title = String(body.title).trim();
  if (body?.excerpt !== undefined) patch.excerpt = String(body.excerpt).trim();
  if (body?.cover !== undefined) patch.cover = body.cover ? String(body.cover) : null;
  if (body?.body !== undefined) patch.body = String(body.body);
  if (body?.density !== undefined) patch.density = parseDensity(body.density, existing.density);
  if (body?.score !== undefined) patch.score = parseScore(body.score);
  if (body?.tags !== undefined) patch.tags = parseTags(body.tags);

  const post = await updatePost(db, existing.id, patch);

  // Reconcile published counts across status and category transitions.
  const wasPub = existing.status === 'published';
  const isPub = nextStatus === 'published';
  if (!wasPub && isPub) {
    await bumpCategoryCount(db, nextCategoryId, 1);
    if (!existing.publishedAt) await setPublishedAt(db, existing.id, new Date());
  } else if (wasPub && !isPub) {
    await bumpCategoryCount(db, existing.categoryId, -1);
  } else if (wasPub && isPub && nextCategoryId !== existing.categoryId) {
    await bumpCategoryCount(db, existing.categoryId, -1);
    await bumpCategoryCount(db, nextCategoryId, 1);
  }

  return c.json({ post: publicPost(post!) });
});

// Delete (owner only). Drop the published count if it was live.
app.delete('/:id', requireAuth, async (c) => {
  const db = c.var.db;
  const existing = await getPostById(db, c.req.param('id'));
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.authorId !== c.var.user.id) return c.json({ error: 'forbidden' }, 403);

  await deletePost(db, existing.id);
  if (existing.status === 'published') await bumpCategoryCount(db, existing.categoryId, -1);
  return c.json({ ok: true });
});

export default app;
