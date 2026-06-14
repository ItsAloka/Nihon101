import { Hono, type Context } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { verifyAccess } from '../lib/tokens';
import { requireAuth } from '../middleware/requireAuth';
import { publicPostCard } from '../db/queries/posts';
import {
  feedCandidates,
  followedCandidates,
  followedAuthorIds,
  seenPostIds,
  rankFeed,
  recordRead,
} from '../db/queries/feed';
import { userAffinityFor, type Affinity } from '../db/queries/affinity';
import { ensureUserEmbedding } from '../db/queries/embeddings';

const app = new Hono<AppEnv>();

const EMPTY_AFFINITY: Affinity = new Map();

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

// For You — the single X-style ranked feed. One list that blends:
//   - posts from authors you follow (strongly prioritized, and guaranteed in
//     the pool even when older than the global-recent slice)
//   - trending (engagement-decayed) + fresh (recent) posts from everyone
//   - tilted toward the category of content you actually engage with
// Logged out = pure trending+fresh (also what SSR and crawlers get).
// ?limit caps the slice (default 24, max 50), ?offset pages it.
app.get('/', async (c) => {
  const db = getDb(c);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 24));
  const offset = Math.max(0, Number(c.req.query('offset')) || 0);

  const uid = await optionalUserId(c);

  // Refresh the reader's taste vector (cached, hourly TTL) so the candidate
  // queries can score semantic similarity against it.
  if (uid) await ensureUserEmbedding(db, uid).catch(() => {});

  // Followed authors first, so we can pull their recent posts into the pool.
  const following = uid ? await followedAuthorIds(db, uid) : new Set<string>();
  const [global, followed] = await Promise.all([
    feedCandidates(db, { userId: uid ?? undefined }),
    following.size ? followedCandidates(db, [...following], { userId: uid ?? undefined }) : Promise.resolve([]),
  ]);

  // Candidate pool = global recent ∪ followed authors' recent posts (deduped).
  const byId = new Map<string, (typeof global)[number]>();
  for (const p of global) byId.set(p.id, p);
  for (const p of followed) byId.set(p.id, p);
  const cands = [...byId.values()];

  const [affinity, seen] = uid
    ? await Promise.all([
        userAffinityFor(db, uid),
        seenPostIds(db, uid, cands.map((p) => p.id)),
      ])
    : [EMPTY_AFFINITY, new Set<string>()];

  const ranked = rankFeed(cands, { affinity, following, seen });
  const page = ranked.slice(offset, offset + limit);

  const strip = (p: (typeof cands)[number]) => {
    const { trend: _trend, ...rest } = p;
    return publicPostCard(rest);
  };
  return c.json({
    feed: page.map(strip),
    nextOffset: offset + limit < ranked.length ? offset + limit : null,
    personalized: !!uid,
  });
});

// Record that the requester read a post — the affinity signal. Fire-and-forget
// from the reader; never blocks the page.
app.post('/read/:postId', requireAuth, async (c) => {
  const db = getDb(c);
  await recordRead(db, c.req.param('postId'), c.var.user!.id);
  return c.json({ ok: true });
});

export default app;
