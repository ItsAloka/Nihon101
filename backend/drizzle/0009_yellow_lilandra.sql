-- pgvector extension (semantic embeddings). drizzle-kit can't express this, so
-- it's hand-added here; the rest of the file is generated.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "user_embedding" (
	"user_id" text PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "user_embedding" ADD CONSTRAINT "user_embedding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_embedding_idx" ON "posts" USING hnsw ("embedding" vector_cosine_ops);