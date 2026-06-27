ALTER TABLE "newsletter_subscribers" ADD COLUMN "last_sent_issue" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "post_comments_created_idx" ON "post_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_likes_created_idx" ON "post_likes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_reads_created_idx" ON "post_reads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_saves_created_idx" ON "post_saves" USING btree ("created_at");