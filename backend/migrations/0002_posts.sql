-- 0002_posts — categories + posts (bilingual blog writing system).
-- Hand-written ANSI SQL (portable to Postgres). Text IDs, ms timestamps,
-- 0/1 booleans, JSON-as-text. No SQLite-only features.

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,            -- slug, e.g. 'culture'
  label_en    TEXT NOT NULL,
  label_ja    TEXT NOT NULL,
  kanji       TEXT NOT NULL DEFAULT '',
  tint        TEXT NOT NULL,               -- palette key, e.g. 'rose'
  post_count  INTEGER NOT NULL DEFAULT 0,  -- published posts in this category
  created_by  TEXT,                        -- null for the built-in defaults
  created_at  INTEGER NOT NULL
);
CREATE INDEX categories_count_idx ON categories (post_count);

CREATE TABLE posts (
  id           TEXT PRIMARY KEY,
  author_id    TEXT NOT NULL,
  category_id  TEXT NOT NULL,
  slug         TEXT NOT NULL,
  title_en     TEXT NOT NULL DEFAULT '',
  title_ja     TEXT NOT NULL DEFAULT '',
  excerpt_en   TEXT NOT NULL DEFAULT '',
  excerpt_ja   TEXT NOT NULL DEFAULT '',
  body_en      TEXT NOT NULL DEFAULT '',     -- sanitized HTML
  body_ja      TEXT NOT NULL DEFAULT '',     -- sanitized HTML
  cover        TEXT,                         -- R2 url, null = none
  status       TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  density      TEXT NOT NULL DEFAULT 'compact', -- 'compact' | 'normal' | 'relaxed'
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

-- Built-in categories (mirror frontend data.js). created_by NULL = system.
INSERT INTO categories (id, label_en, label_ja, kanji, tint, post_count, created_by, created_at) VALUES
  ('culture',    'Culture',    '文化',           '文', 'rose',  0, NULL, 0),
  ('food',       'Food',       '食',             '食', 'amber', 0, NULL, 0),
  ('travel',     'Travel',     '旅',             '旅', 'blue',  0, NULL, 0),
  ('language',   'Language',   '言葉',           '言', 'lilac', 0, NULL, 0),
  ('animation',  'Animation',  'アニメ',         '画', 'peach', 0, NULL, 0),
  ('philosophy', 'Philosophy', '哲学',           '哲', 'sage',  0, NULL, 0),
  ('history',    'History',    '歴史',           '史', 'clay',  0, NULL, 0),
  ('fashion',    'Fashion',    'ファッション',   '装', 'mauve', 0, NULL, 0),
  ('news',       'News',       '今日のこと',     '新', 'sky',   0, NULL, 0);
