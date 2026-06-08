import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { withDb } from './middleware/db';
import auth from './routes/auth';
import categories from './routes/categories';
import posts from './routes/posts';
import media from './routes/media';

const app = new Hono<AppEnv>();

// Exact-origin CORS with credentials (refresh cookie travels on /auth calls).
app.use('*', (c, next) =>
  cors({
    origin: c.env.FRONTEND_ORIGIN,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })(c, next),
);

app.use('*', withDb);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', auth);
app.route('/categories', categories);
app.route('/posts', posts);
app.route('/media', media);

export default app;
