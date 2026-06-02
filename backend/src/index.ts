import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import auth from './routes/auth';
import google from './routes/google';

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

app.get('/', (c) => c.json({ ok: true, service: 'nihon101-api' }));

app.route('/auth', auth);
app.route('/auth/google', google);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, _env: AppEnv['Bindings']) {
    // wire trending recompute later
  },
};
