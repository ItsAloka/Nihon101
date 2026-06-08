-- 0004_post_cover_caption — cover photo caption fields for the reading view.
-- A short PHOTO tag (e.g. 'still from Your Name') and a credit line
-- (e.g. '© CoMix Wave Films'). Language-neutral single values, matching the
-- existing seed posts. Hand-written ANSI SQL (portable to Postgres).

ALTER TABLE posts ADD COLUMN cover_label  TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN cover_credit TEXT NOT NULL DEFAULT '';
