CREATE TABLE "post_saves" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_embedding" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_embedding" CASCADE;--> statement-breakpoint
DROP INDEX "posts_embedding_idx";--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_saves_post_user_idx" ON "post_saves" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_saves_user_idx" ON "post_saves" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "embedding";