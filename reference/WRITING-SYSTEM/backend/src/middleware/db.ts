import { createMiddleware } from 'hono/factory';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import type { AppEnv } from '../types';

/** Attach a Drizzle instance bound to the request's D1 binding as `c.var.db`. */
export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  await next();
});
