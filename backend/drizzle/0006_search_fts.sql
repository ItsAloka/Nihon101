-- Bilingual full-text search infrastructure (hand-written; drizzle doesn't model
-- tsvector). One combined `search` column mixes both locales' configs so a single
-- GIN index serves EN + JA: title (A) > excerpt + tags (B) > HTML-stripped body (C).
-- EN fields use the 'english' config (stemming); JA fields use 'simple' (no JA word
-- segmentation on stock Postgres, so JA discovery leans on the pg_trgm title
-- fallback below + tag/category filters).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title_en", '')), 'A') ||
  setweight(to_tsvector('simple',  coalesce("title_ja", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("excerpt_en", '')), 'B') ||
  setweight(to_tsvector('simple',  coalesce("excerpt_ja", '')), 'B') ||
  setweight(to_tsvector('simple',  translate(coalesce("tags"::text, ''), '[]",', '    ')), 'B') ||
  setweight(to_tsvector('english', regexp_replace(coalesce("body_en", ''), '<[^>]*>', ' ', 'g')), 'C') ||
  setweight(to_tsvector('simple',  regexp_replace(coalesce("body_ja", ''), '<[^>]*>', ' ', 'g')), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX "posts_search_idx" ON "posts" USING gin ("search");--> statement-breakpoint
-- Typo/partial fallback + the JA workhorse (trigram works on any unicode).
CREATE INDEX "posts_title_en_trgm_idx" ON "posts" USING gin ("title_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "posts_title_ja_trgm_idx" ON "posts" USING gin ("title_ja" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_display_name_trgm_idx" ON "users" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_display_name_ja_trgm_idx" ON "users" USING gin ("display_name_ja" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_handle_trgm_idx" ON "users" USING gin ("handle" gin_trgm_ops);--> statement-breakpoint
-- Tag-page filtering: posts.tags @> '["slug"]' at 50k scale.
CREATE INDEX "posts_tags_gin_idx" ON "posts" USING gin ("tags" jsonb_path_ops);
