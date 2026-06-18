import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from './requireAuth';

/** Gate behind a valid access token AND role=admin. Chains requireAuth first
 *  (sets c.var.user from the JWT, returns 401 if missing/invalid), then checks
 *  the role claim — 403 if signed in but not an admin. The role rides in the
 *  access token, so this is a pure claim check, no DB round-trip. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  let denied = false;
  const res = await requireAuth(c, async () => {
    if (c.var.user?.role !== 'admin') { denied = true; return; }
    await next();
  });
  if (denied) return c.json({ error: 'forbidden' }, 403);
  return res;
};
