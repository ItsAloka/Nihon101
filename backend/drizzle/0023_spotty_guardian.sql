ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirmed_at" bigint;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "code_expires_at" bigint;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_newsletter_unconfirmed" ON "newsletter_subscribers" USING btree ("created_at") WHERE confirmed_at is null;--> statement-breakpoint
-- Backfill: rows that subscribed before double opt-in existed are grandfathered
-- in as confirmed (otherwise the 7-day prune would silently drop the whole list).
UPDATE "newsletter_subscribers" SET "confirmed_at" = (extract(epoch from now()) * 1000)::bigint WHERE "confirmed_at" IS NULL;