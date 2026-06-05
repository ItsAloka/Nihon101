-- 0001_init_auth.sql — users, refresh tokens, google links, password resets
-- Portability law: no AUTOINCREMENT, no WITHOUT ROWID, no FTS5, no json_*().
-- IDs = '<prefix>_<nanoid21>'. Timestamps = bigint ms. Booleans = integer 0/1.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  password_hash  TEXT,                       -- null when google-only
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',
  email_verified INTEGER NOT NULL DEFAULT 0, -- 0/1
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_users_email ON users (email);

CREATE TABLE refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,   -- sha256(rawToken + pepper), hex
  family_id   TEXT NOT NULL,   -- rotation family; reuse => revoke whole family
  user_agent  TEXT,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  revoked_at  INTEGER,         -- null = active
  replaced_by TEXT             -- id of the token that rotated this one
);
CREATE UNIQUE INDEX ux_rt_hash ON refresh_tokens (token_hash);
CREATE INDEX ix_rt_user ON refresh_tokens (user_id);
CREATE INDEX ix_rt_family ON refresh_tokens (family_id);

CREATE TABLE google_links (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  google_sub  TEXT NOT NULL,   -- Google account subject id
  email       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_google_sub ON google_links (google_sub);
CREATE INDEX ix_google_user ON google_links (user_id);

CREATE TABLE password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,   -- sha256(rawToken + pepper), hex
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,         -- null = unused
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_pr_hash ON password_resets (token_hash);
CREATE INDEX ix_pr_user ON password_resets (user_id);
