CREATE TABLE "post_event_hours" (
	"post_id" text NOT NULL,
	"hour" integer NOT NULL,
	"reads" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "post_event_hours_post_id_hour_pk" PRIMARY KEY("post_id","hour")
);
--> statement-breakpoint
DROP INDEX "posts_status_idx";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "body_chars" integer GENERATED ALWAYS AS (char_length(body_en) + char_length(body_ja)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "post_event_hours" ADD CONSTRAINT "post_event_hours_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_event_hours_hour_idx" ON "post_event_hours" USING btree ("hour");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("status","is_hidden","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_cat_feed_idx" ON "posts" USING btree ("category_id","status","is_hidden","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_author_feed_idx" ON "posts" USING btree ("author_id","status","is_hidden","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_engagement_idx" ON "posts" USING btree ((likes + 2 * comments + 0.5 * saves) DESC,"published_at" DESC NULLS LAST) WHERE status = 'published' AND is_hidden = false;