CREATE TABLE "admin_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"report_threshold" integer DEFAULT 3 NOT NULL,
	"auto_hide_threshold" integer DEFAULT 6 NOT NULL,
	"updated_at" bigint NOT NULL
);
