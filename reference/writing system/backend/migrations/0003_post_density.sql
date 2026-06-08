-- 0003_post_density — per-post line spacing ('compact' | 'normal' | 'relaxed').
ALTER TABLE posts ADD COLUMN density TEXT NOT NULL DEFAULT 'compact';
