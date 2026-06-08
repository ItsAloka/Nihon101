-- 0001_init_auth — users, refresh tokens, google links, one-way follows.
-- Hand-written ANSI SQL (portable to Postgres). Text IDs, ms timestamps, 0/1 booleans.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  email          TEXT NOT NULL,
  password_hash  TEXT,
  display_name   TEXT NOT NULL,
  avatar_color   TEXT NOT NULL DEFAULT 'var(--teal)',
  bio            TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'user',
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_username_idx ON users (username);
CREATE UNIQUE INDEX users_email_idx ON users (email);

CREATE TABLE refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  family_id   TEXT NOT NULL,
  replaced_by TEXT,
  revoked     INTEGER NOT NULL DEFAULT 0,
  user_agent  TEXT,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX refresh_tokens_hash_idx ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE google_links (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  google_sub TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX google_links_sub_idx ON google_links (google_sub);
CREATE INDEX google_links_user_idx ON google_links (user_id);

CREATE TABLE user_follows (
  id           TEXT PRIMARY KEY,
  follower_id  TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX user_follows_pair_idx ON user_follows (follower_id, following_id);
CREATE INDEX user_follows_following_idx ON user_follows (following_id);
