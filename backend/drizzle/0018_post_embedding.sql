-- Semantic layer for For You + search. pgvector can't be modeled by drizzle-kit, so
-- this is hand-written (like the 0006 search tsvector). The `embedding` column is kept
-- OUT of schema.ts and queried via raw SQL, so drizzle-kit never tries to manage it.
-- Nullable: a post has no embedding until the embed-on-write job (or backfill) fills it,
-- and the whole feature degrades to 0 when it's null — so this is safe to ship empty.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
-- Cosine HNSW: nearest-meaning lookup for semantic search; For You reads the column.
CREATE INDEX IF NOT EXISTS "posts_embedding_idx" ON "posts" USING hnsw ("embedding" vector_cosine_ops);
