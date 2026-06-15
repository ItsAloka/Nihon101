export type AppBindings = {
  MEDIA: R2Bucket;
  // Site-wide trending hot-cache (top-20 cards), written by the per-minute cron.
  // Optional: absent in local dev with no KV binding → trending falls back to DB.
  TRENDING_KV?: KVNamespace;
};

export type AppVars = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  REFRESH_PEPPER: string;
  FRONTEND_ORIGIN: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  DEEPL_API_KEY: string;
  OPENAI_API_KEY: string;
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
  };
};
