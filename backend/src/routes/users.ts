/* Public author profiles + the follow graph. The GET is what the SSR profile
 * page reads (no auth required, but reads the viewer's follow state if present);
 * follow/unfollow require auth. */
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types';
import { getDb, getDbCached } from '../db/client';
import { verifyAccess } from '../lib/tokens';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { getUserByHandle, getUserById, publishedStats, acceptTerms } from '../db/queries/users';
import { maskProfanity } from '../lib/profanity';
import { follow, unfollow, isFollowing, followCounts, listFollowing, listFollowers, listFollowingUsers } from '../db/queries/follows';
import { createNotification } from '../db/queries/notifications';

const app = new Hono<AppEnv>();

/** Resolve a route param that may be a user id or a handle → the user row. */
async function resolveUser(db: ReturnType<typeof getDb>, idOrHandle: string) {
  return (await getUserById(db, idOrHandle)) ?? (await getUserByHandle(db, idOrHandle.toLowerCase()));
}

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

// The authors the requester follows ({id, handle}) — drives the For You feed
// split + follow-button state. Declared before /:handle (distinct path length).
app.get('/me/following', requireAuth, async (c) => {
  const db = getDb(c);
  const following = await listFollowing(db, c.var.user!.id);
  return c.json({ following });
});

// One-time acceptance of the content guidelines (/terms) — required before the
// first publish (routes/posts.ts returns terms_not_accepted until this is set).
// Idempotent; keeps the first acceptance timestamp.
app.post('/me/accept-terms', requireAuth, limits.follow, async (c) => {
  await acceptTerms(getDb(c), c.var.user!.id);
  return c.json({ ok: true });
});

// Readers (followers) + Writers (following) lists for the profile modal —
// newest-follow-first, each row carrying the viewer's follow-state. Public, but
// reads the viewer's token to fill per-row follow buttons. Declared before /:handle.
app.get('/:handle/followers', limits.publicRead, async (c) => {
  const db = getDb(c);
  const u = await resolveUser(db, c.req.param('handle'));
  if (!u) return c.json({ error: 'not_found' }, 404);
  const viewerId = await optionalUserId(c);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 30));
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const q = c.req.query('q') || undefined;
  const users = await listFollowers(db, u.id, { viewerId, q, limit, offset: page * limit });
  return c.json({ users });
});

app.get('/:handle/following', limits.publicRead, async (c) => {
  const db = getDb(c);
  const u = await resolveUser(db, c.req.param('handle'));
  if (!u) return c.json({ error: 'not_found' }, 404);
  const viewerId = await optionalUserId(c);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 30));
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const q = c.req.query('q') || undefined;
  const users = await listFollowingUsers(db, u.id, { viewerId, q, limit, offset: page * limit });
  return c.json({ users });
});

app.get('/:handle', limits.publicRead, async (c) => {
  // Public profile shell is shared content → caching handle; the viewer's own
  // profile re-reads live (they may have just saved Settings), and the per-viewer
  // follow state always reads live.
  const viewerId = await optionalUserId(c);
  let u = await getUserByHandle(getDbCached(c), c.req.param('handle').toLowerCase());
  if (u && viewerId === u.id) u = await getUserByHandle(getDb(c), c.req.param('handle').toLowerCase()) ?? u;
  if (!u) return c.json({ error: 'not_found' }, 404);

  // Aggregates only — the profile's story feed pages via /search?author=, so this
  // endpoint never loads post rows (the old listPosts path selected up to 200 full
  // bodies per profile view AND per article read, purely to count them).
  //
  // A SIGNED-IN viewer reads the counts LIVE: Hyperdrive's 60s query cache is never
  // invalidated by a write, so a cached count means follow someone, reload their
  // profile, and the follower number is still the old one for up to a minute while
  // the button already says "Following" (same for publishing — your own profile would
  // claim one fewer post). The counts are what a viewer can change *this second*.
  // An ANONYMOUS viewer (the bulk of profile traffic) can change nothing, so their
  // counts come from the cached handle — a ≤60s-stale follower/post number is
  // invisible and the page loads without waking the Neon compute. isFollowing
  // short-circuits to false for a null viewer (no query).
  const statsDb = viewerId ? getDb(c) : getDbCached(c);
  const [pub, counts, viewerFollows] = await Promise.all([
    publishedStats(statsDb, u.id),
    followCounts(statsDb, u.id),
    isFollowing(getDb(c), viewerId, u.id),
  ]);

  // Read-time profanity masking (same contract as posts/comments). NEVER for the
  // owner: Settings round-trips these fields, so a masked bio would overwrite the
  // original with ●●● on the next save.
  const isSelf = viewerId === u.id;
  const m = isSelf ? (t: string) => t : maskProfanity;
  return c.json({
    user: {
      id: u.id,
      handle: u.handle,
      displayName: m(u.displayName),
      displayNameJa: m(u.displayNameJa),
      bio: m(u.bio),
      bioJa: m(u.bioJa),
      location: u.location,
      avatarUrl: u.avatarUrl,
      bannerUrl: u.bannerUrl,
      role: u.role,
      joinedAt: u.createdAt,
    },
    stats: { ...pub, ...counts },
    isFollowing: viewerFollows,
    isSelf: viewerId === u.id,
  });
});

// Follow a user (param = id or handle). Notifies the followee. Idempotent.
app.post('/:id/follow', requireAuth, limits.follow, async (c) => {
  const db = getDb(c);
  const me = c.var.user!.id;
  const target = await resolveUser(db, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.id === me) return c.json({ error: 'cannot_follow_self' }, 400);

  const created = await follow(db, me, target.id);
  if (created) await createNotification(db, { userId: target.id, type: 'follow', actorId: me });
  const counts = await followCounts(db, target.id);
  return c.json({ following: true, followers: counts.followers });
});

// Unfollow a user (param = id or handle). Idempotent.
app.delete('/:id/follow', requireAuth, limits.follow, async (c) => {
  const db = getDb(c);
  const target = await resolveUser(db, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  await unfollow(db, c.var.user!.id, target.id);
  const counts = await followCounts(db, target.id);
  return c.json({ following: false, followers: counts.followers });
});

export default app;
