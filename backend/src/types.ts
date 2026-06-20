export type AppBindings = {
  MEDIA: R2Bucket;
  // Site-wide trending hot-cache (top-20 cards), written by the per-minute cron.
  // Optional: absent in local dev with no KV binding → trending falls back to DB.
  TRENDING_KV?: KVNamespace;
  // Exact atomic rate limiter for the auth brute-force class (login/register).
  // Optional: absent → rateLimit('do') falls back to the KV tier.
  RATE_LIMITER?: DurableObjectNamespace;
};

export type AppVars = {
  DATABASE_URL: string;
  // "true" in prod (behind Hyperdrive / Neon pooler): reuse ONE per-isolate pool
  // across requests instead of opening+closing one per request. Unset in local dev
  // (direct Docker Postgres) → per-request pool. See db/client.ts.
  DB_POOLED?: string;
  JWT_SECRET: string;
  REFRESH_PEPPER: string;
  FRONTEND_ORIGIN: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  DEEPL_API_KEY: string;
  OPENAI_API_KEY: string;
  OPENAI_EMBED_API_KEY: string; // separate key for embeddings (feed + search semantic layer)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
};

export type SessionUser = {
  id: string;
  username: string;
  role: 'user' | 'admin';
};

export type AppEnv = {
  Bindings: AppBindings & AppVars;
  Variables: {
    user?: SessionUser;
    requestId?: string;
  };
};
