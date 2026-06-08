-- 0002_posts — categories + posts (blog writing system).
-- Hand-written ANSI SQL (portable to Postgres). Text IDs, ms timestamps, 0/1 booleans.

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,            -- slug, e.g. 'anime'
  label       TEXT NOT NULL,
  color_var   TEXT NOT NULL,               -- CSS var, e.g. '--c-anime'
  post_count  INTEGER NOT NULL DEFAULT 0,  -- published posts in this category
  created_by  TEXT,                        -- null for the built-in defaults
  created_at  INTEGER NOT NULL
);
CREATE INDEX categories_count_idx ON categories (post_count);

CREATE TABLE posts (
  id           TEXT PRIMARY KEY,
  author_id    TEXT NOT NULL,
  category_id  TEXT NOT NULL,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  cover        TEXT,                         -- cover image url / data uri
  body         TEXT NOT NULL DEFAULT '',     -- markdown
  status       TEXT NOT NULL DEFAULT 'draft',-- 'draft' | 'published'
  score        REAL,                         -- optional review score, null = none
  tags         TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  likes        INTEGER NOT NULL DEFAULT 0,
  saves        INTEGER NOT NULL DEFAULT 0,
  comments     INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX posts_slug_idx ON posts (slug);
CREATE INDEX posts_author_idx ON posts (author_id);
CREATE INDEX posts_category_idx ON posts (category_id);
CREATE INDEX posts_status_idx ON posts (status);

-- Built-in categories (mirror frontend seed). created_by NULL = system.
INSERT INTO categories (id, label, color_var, post_count, created_by, created_at) VALUES
  ('anime',  'Anime',        '--c-anime',  0, NULL, 0),
  ('manga',  'Manga',        '--c-manga',  0, NULL, 0),
  ('manhwa', 'Manhwa',       '--c-manhwa', 0, NULL, 0),
  ('manhua', 'Manhua',       '--c-manhua', 0, NULL, 0),
  ('novel',  'Light Novels', '--c-novel',  0, NULL, 0),
  ('games',  'Games',        '--c-games',  0, NULL, 0);
