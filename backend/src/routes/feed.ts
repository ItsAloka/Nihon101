import { Hono, type Context } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { verifyAccess } from '../lib/tokens';
import { requireAuth } from '../middleware/requireAuth';
import { forYouFeed, recordRead } from '../db/queries/for-you';

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
// ?limit caps the slice (default 24, max 50), ?offset pages it.
app.get('/', async (c) => {
  const result = await forYouFeed(getDb(c), {
    userId: await optionalUserId(c),
    limit: Number(c.req.query('limit')) || undefined,
    offset: Number(c.req.query('offset')) || undefined,
  });
  return c.json(result);
});

// Record that the requester read a post — the affinity signal. Fire-and-forget
// from the reader; never blocks the page.
app.post('/read/:postId', requireAuth, async (c) => {
  await recordRead(getDb(c), c.req.param('postId'), c.var.user!.id);
  return c.json({ ok: true });
});

export default app;
