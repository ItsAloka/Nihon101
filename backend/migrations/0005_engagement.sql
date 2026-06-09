-- 0005_engagement — per-user likes + flat comments for blog posts.
-- Hand-written ANSI SQL (portable to Postgres). Text IDs, ms timestamps,
-- 0/1 booleans, JSON-as-text. No SQLite-only features.
--
-- posts.likes / posts.comments stay as denormalized counters (bumped in app
-- code) so list/reading views never COUNT() over these tables at 50k scale.

-- One row per (post, user) like. The UNIQUE index is the toggle's source of
-- truth — a like is "on" iff a row exists.
CREATE TABLE post_likes (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX post_likes_post_user_idx ON post_likes (post_id, user_id);
CREATE INDEX post_likes_user_idx ON post_likes (user_id);

-- Flat comments (no threading). likes is a denormalized counter for the row.
CREATE TABLE post_comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX post_comments_post_idx ON post_comments (post_id, created_at);
CREATE INDEX post_comments_user_idx ON post_comments (user_id);

-- One row per (comment, user) like.
CREATE TABLE comment_likes (
  id         TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX comment_likes_comment_user_idx ON comment_likes (comment_id, user_id);
CREATE INDEX comment_likes_user_idx ON comment_likes (user_id);
