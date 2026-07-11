ALTER TABLE "posts" ADD COLUMN "translation_claimed_at" bigint;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "translation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "posts_translation_queue_idx" ON "posts" USING btree ("updated_at") WHERE translation_status = 'pending';