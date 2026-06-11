/* Public author profiles. No auth — this is what the SSR profile page reads. */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getDb } from '../db/client';
import { getUserByHandle } from '../db/queries/users';
import { listPosts, publicPost } from '../db/queries/posts';

const app = new Hono<AppEnv>();

app.get('/:handle', async (c) => {
  const db = getDb(c);
  const u = await getUserByHandle(db, c.req.param('handle').toLowerCase());
  if (!u) return c.json({ error: 'not_found' }, 404);

  const posts = await listPosts(db, { authorId: u.id, status: 'published' });
  const likes = posts.reduce((s, p) => s + p.likes, 0);

  return c.json({
    user: {
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
    stats: { published: posts.length, likes },
    // List surface: strip the full HTML bodies (they're only needed on the article page).
    posts: posts.map((p) => { const { bodyEn, bodyJa, ...rest } = publicPost(p); return rest; }),
  });
});

export default app;
