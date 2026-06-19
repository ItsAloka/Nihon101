CREATE TABLE "login_otps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_otps" ADD CONSTRAINT "login_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_login_otps_user" ON "login_otps" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_td_hash" ON "trusted_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_td_user" ON "trusted_devices" USING btree ("user_id");