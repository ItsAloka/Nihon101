import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { closeDb } from './db/client';
import auth from './routes/auth';
import google from './routes/google';
import posts from './routes/posts';
import categories from './routes/categories';
import media from './routes/media';
import translate from './routes/translate';

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
app.route('/translate', translate);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, _env: AppEnv['Bindings']) {
    // wire trending recompute later
  },
};
