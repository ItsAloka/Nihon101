/* Hono environment: bindings + secrets + per-request variables. */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from './db/schema';

export interface AuthedUser {
  id: string;
  username: string;
  role: string;
}

export interface AppEnv {
  Bindings: {
    DB: D1Database;
    MEDIA: R2Bucket;
    // [vars]
    FRONTEND_ORIGIN: string;
    // secrets (.dev.vars / wrangler secret)
    JWT_SECRET: string;
    REFRESH_PEPPER: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
    RESEND_API_KEY: string;
    RESEND_FROM: string;
  };
  Variables: {
    user: AuthedUser;
    db: DrizzleD1Database<typeof schema>;
  };
}
