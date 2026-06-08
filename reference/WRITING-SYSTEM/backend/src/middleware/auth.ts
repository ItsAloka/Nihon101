import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';
import { verifyJwt } from '../lib/crypto';

/** Reject unless a valid access JWT is present; sets `c.var.user`. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = token ? await verifyJwt(token, c.env.JWT_SECRET) : null;
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', { id: claims.sub, username: claims.username, role: claims.role });
  await next();
});
