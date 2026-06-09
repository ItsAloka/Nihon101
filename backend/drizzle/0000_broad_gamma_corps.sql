CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"label_en" text NOT NULL,
	"label_ja" text NOT NULL,
	"kanji" text DEFAULT '' NOT NULL,
	"tint" text NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"google_sub" text NOT NULL,
	"email" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"body" text DEFAULT '' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"category_id" text NOT NULL,
	"slug" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ja" text DEFAULT '' NOT NULL,
	"excerpt_en" text DEFAULT '' NOT NULL,
	"excerpt_ja" text DEFAULT '' NOT NULL,
	"body_en" text DEFAULT '' NOT NULL,
	"body_ja" text DEFAULT '' NOT NULL,
	"cover" text,
	"cover_label" text DEFAULT '' NOT NULL,
	"cover_credit" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"density" text DEFAULT 'compact' NOT NULL,
	"score" real,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"published_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" text NOT NULL,
	"user_agent" text,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"revoked_at" bigint,
	"replaced_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "categories_count_idx" ON "categories" USING btree ("post_count");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_likes_comment_user_idx" ON "comment_likes" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX "comment_likes_user_idx" ON "comment_likes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_google_sub" ON "google_links" USING btree ("google_sub");--> statement-breakpoint
CREATE INDEX "ix_google_user" ON "google_links" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_pr_hash" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_pr_user" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_comments_user_idx" ON "post_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_comments_parent_idx" ON "post_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_post_user_idx" ON "post_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_likes_user_idx" ON "post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_rt_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_rt_user" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_rt_family" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_users_email" ON "users" USING btree ("email");