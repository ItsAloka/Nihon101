CREATE TABLE "post_count_events" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_count_events" ADD CONSTRAINT "post_count_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_count_events_post_idx" ON "post_count_events" USING btree ("post_id","kind");--> statement-breakpoint
CREATE INDEX "post_comments_new_idx" ON "post_comments" USING btree ("post_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE parent_id IS NULL;--> statement-breakpoint
CREATE INDEX "post_comments_top_idx" ON "post_comments" USING btree ("post_id","likes" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE parent_id IS NULL;