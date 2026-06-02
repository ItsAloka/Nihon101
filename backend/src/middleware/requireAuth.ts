import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { verifyAccess } from '../lib/tokens';

/** Gate a route behind a valid access JWT. Sets c.var.user on success. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  try {
    const claims = await verifyAccess(c.env.JWT_SECRET, header.slice(7));
    c.set('user', { id: claims.sub, username: claims.name, role: claims.role });
    return next();
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
};
