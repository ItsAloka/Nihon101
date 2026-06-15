import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { closeDb } from './db/client';
import auth from './routes/auth';
import google from './routes/google';
import posts from './routes/posts';
import categories from './routes/categories';
import media from './routes/media';
import usersRoute from './routes/users';
import translate from './routes/translate';
import home from './routes/home';
import search from './routes/search';
import feed from './routes/feed';
import notifications from './routes/notifications';
import trending from './routes/trending';
import { standaloneDb } from './db/client';
import { recomputeTrendingCache } from './db/queries/trending';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const corsMw = cors({
    origin: c.env.FRONTEND_ORIGIN,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  return corsMw(c, next);
});

// Close the per-request Postgres pool once the request finishes.
app.use('*', async (c, next) => {
  try {
    await next();
  } finally {
    await closeDb(c);
  }
});

app.get('/', (c) => c.json({ ok: true, service: 'nihon101-api' }));

app.route('/auth', auth);
app.route('/auth/google', google);
app.route('/posts', posts);
app.route('/categories', categories);
app.route('/media', media);
app.route('/users', usersRoute);
app.route('/translate', translate);
app.route('/home', home);
app.route('/search', search);
app.route('/feed', feed);
app.route('/notifications', notifications);
app.route('/trending', trending);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: AppEnv['Bindings']) {
    // Per minute: recompute every published post's momentum trend score, then
    // bake the top-20 cards to KV for the zero-Postgres hot path.
    const { db, pool } = standaloneDb(env);
    try {
      await recomputeTrendingCache(db, env.TRENDING_KV);
    } finally {
      await pool.end();
    }
  },
};
