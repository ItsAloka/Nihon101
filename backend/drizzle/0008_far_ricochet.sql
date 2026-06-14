ALTER TABLE "posts" ADD COLUMN "trend_score" real;--> statement-breakpoint
CREATE INDEX "posts_trend_idx" ON "posts" USING btree ("trend_score");