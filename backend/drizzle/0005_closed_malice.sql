CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tags_count_idx" ON "tags" USING btree ("post_count");