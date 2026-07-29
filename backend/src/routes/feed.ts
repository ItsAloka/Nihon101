import { Hono, type Context } from 'hono';
import { getDb, getDbCached } from '../db/client';
import type { AppEnv } from '../types';
import { verifyAccess } from '../lib/tokens';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { forYouFeed, recordRead, recordSearchClick } from '../db/queries/for-you';
import { likedPostIds } from '../db/queries/engagement';
import { markTrendingDirty } from '../lib/dirty';

const app = new Hono<AppEnv>();

/** Resolve the requester id from the access token, or null. Never throws. */
async function optionalUserId(c: Context<AppEnv>): Promise<string | null> {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const claims = await verifyAccess(c.env.JWT_SECRET, header.slice(7));
    return claims.sub;
  } catch {
    return null;
  }
}

// For You — the single X-style ranked feed. The whole algorithm lives in
// db/queries/for-you.ts; this route just resolves the viewer and hands off.
// Logged out = pure trending+fresh (also what SSR and crawlers get).
// ?limit caps the slice (default 12, max 50); ?page is the 0-based page index.
app.get('/', limits.feed, async (c) => {
  const userId = await optionalUserId(c);
  // Logged-out feed is identical for everyone (pure trending+fresh) → caching
  // handle. A logged-in feed is personal taste-ranked → always live.
  const db = userId ? getDb(c) : getDbCached(c);
  const result = await forYouFeed(db, {
    userId,
    limit: Number(c.req.query('limit')) || undefined,
    page: Number(c.req.query('page')) || undefined,
    kv: c.env.TRENDING_KV,
  });
  // Honest hearts: tag each card with whether this viewer liked it (live handle).
  if (userId && Array.isArray(result.feed) && result.feed.length) {
    const liked = await likedPostIds(getDb(c), userId, result.feed.map((p: any) => p.id));
    (result as any).feed = result.feed.map((p: any) => ({ ...p, liked: liked.has(p.id) }));
  }
  return c.json(result);
});

// Record that the requester read a post — the affinity signal. Fire-and-forget
// from the reader; never blocks the page.
app.post('/read/:postId', requireAuth, limits.read, async (c) => {
  await recordRead(getDb(c), c.req.param('postId'), c.var.user!.id);
  markTrendingDirty(c); // a read feeds the trending buckets → wake the next tick
  return c.json({ ok: true });
});

// Record that the requester clicked a SEARCH result — the strongest taste signal
// (weight 5), so going exploring pivots the feed. Fire-and-forget from the search UI.
app.post('/search-click/:postId', requireAuth, limits.read, async (c) => {
  await recordSearchClick(getDb(c), c.req.param('postId'), c.var.user!.id);
  return c.json({ ok: true });
});

export default app;
