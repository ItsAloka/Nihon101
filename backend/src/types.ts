export type AppBindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
};

export type AppVars = {
  JWT_SECRET: string;
  REFRESH_PEPPER: string;
  FRONTEND_ORIGIN: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  DEEPL_API_KEY: string;
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
