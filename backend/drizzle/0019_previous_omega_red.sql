CREATE TABLE "contact_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"locale" text DEFAULT 'ja' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"replied_at" bigint,
	"replied_by" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"locale" text DEFAULT 'ja' NOT NULL,
	"user_id" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_replied_by_users_id_fk" FOREIGN KEY ("replied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_messages_status_idx" ON "contact_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_newsletter_email" ON "newsletter_subscribers" USING btree ("email");