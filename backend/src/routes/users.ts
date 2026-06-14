/* Public author profiles + the follow graph. The GET is what the SSR profile
 * page reads (no auth required, but reads the viewer's follow state if present);
 * follow/unfollow require auth. */
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types';
import { getDb } from '../db/client';
import { verifyAccess } from '../lib/tokens';
import { requireAuth } from '../middleware/requireAuth';
import { getUserByHandle, getUserById } from '../db/queries/users';
import { listPosts, publicPost } from '../db/queries/posts';
import { follow, unfollow, isFollowing, followCounts, listFollowing } from '../db/queries/follows';
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

app.get('/:handle', async (c) => {
  const db = getDb(c);
  const u = await getUserByHandle(db, c.req.param('handle').toLowerCase());
  if (!u) return c.json({ error: 'not_found' }, 404);

  const viewerId = await optionalUserId(c);
  const [posts, counts, viewerFollows] = await Promise.all([
    listPosts(db, { authorId: u.id, status: 'published' }),
    followCounts(db, u.id),
    isFollowing(db, viewerId, u.id),
  ]);
  const likes = posts.reduce((s, p) => s + p.likes, 0);

  return c.json({
    user: {
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      displayNameJa: u.displayNameJa,
      bio: u.bio,
      bioJa: u.bioJa,
      location: u.location,
      avatarUrl: u.avatarUrl,
      role: u.role,
      joinedAt: u.createdAt,
    },
    stats: { published: posts.length, likes, ...counts },
    isFollowing: viewerFollows,
    isSelf: viewerId === u.id,
    // List surface: strip the full HTML bodies (they're only needed on the article page).
    posts: posts.map((p) => { const { bodyEn, bodyJa, ...rest } = publicPost(p); return rest; }),
  });
});

// Follow a user (param = id or handle). Notifies the followee. Idempotent.
app.post('/:id/follow', requireAuth, async (c) => {
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
app.delete('/:id/follow', requireAuth, async (c) => {
  const db = getDb(c);
  const target = await resolveUser(db, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  await unfollow(db, c.var.user!.id, target.id);
  const counts = await followCounts(db, target.id);
  return c.json({ following: false, followers: counts.followers });
});

export default app;
