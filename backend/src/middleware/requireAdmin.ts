import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from './requireAuth';
import { getDb } from '../db/client';
import { getUserById } from '../db/queries/users';

/** Gate behind a valid access token AND role=admin. Chains requireAuth first
 *  (sets c.var.user from the JWT, returns 401 if missing/invalid), then checks
 *  the role claim — 403 if signed in but not an admin.
 *
 *  The role rides in the 15-min access token, so READS are a pure claim check (no
 *  DB hit). But that means a just-revoked or just-banned admin keeps power until
 *  their token expires — unacceptable for STATE CHANGES. So any mutating request
 *  (non-GET) is re-verified against the live user row: still admin, still not
 *  banned. Reads stay cheap; destructive actions can't ride a stale token. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  let denied = false;
  const res = await requireAuth(c, async () => {
    if (c.var.user?.role !== 'admin') { denied = true; return; }
    if (c.req.method !== 'GET') {
      const live = await getUserById(getDb(c), c.var.user.id);
      if (!live || live.role !== 'admin' || live.isBanned) { denied = true; return; }
    }
    await next();
  });
  if (denied) return c.json({ error: 'forbidden' }, 403);
  return res;
};
