CREATE TABLE "suspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"lift_cause" text,
	"appeal_text" text,
	"appealed_at" timestamp with time zone,
	"appeal_status" text,
	"appeal_reviewed_by" uuid,
	"appeal_reviewed_at" timestamp with time zone,
	CONSTRAINT "suspensions_reason_check" CHECK ("suspensions"."reason" in ('harassment', 'spam', 'impersonation', 'inappropriate', 'other')),
	CONSTRAINT "suspensions_ends_after_start" CHECK ("suspensions"."ends_at" is null or "suspensions"."ends_at" > "suspensions"."created_at"),
	CONSTRAINT "suspensions_lift_cause_check" CHECK ("suspensions"."lift_cause" is null or "suspensions"."lift_cause" in ('reinstated', 'expired', 'appeal')),
	CONSTRAINT "suspensions_lift_pair" CHECK (("suspensions"."lifted_at" is null) = ("suspensions"."lift_cause" is null)),
	CONSTRAINT "suspensions_appeal_status_check" CHECK ("suspensions"."appeal_status" is null or "suspensions"."appeal_status" in ('open', 'upheld', 'granted')),
	CONSTRAINT "suspensions_appeal_pair" CHECK (("suspensions"."appeal_text" is null) = ("suspensions"."appealed_at" is null) and ("suspensions"."appeal_text" is null) = ("suspensions"."appeal_status" is null)),
	CONSTRAINT "suspensions_appeal_len" CHECK ("suspensions"."appeal_text" is null or char_length("suspensions"."appeal_text") <= 500)
);
--> statement-breakpoint
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_appeal_reviewed_by_users_id_fk" FOREIGN KEY ("appeal_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suspensions_one_live_per_user" ON "suspensions" USING btree ("user_id") WHERE "suspensions"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "suspensions_open_appeals_idx" ON "suspensions" USING btree ("appealed_at","id") WHERE "suspensions"."appeal_status" = 'open';--> statement-breakpoint
CREATE INDEX "suspensions_timed_idx" ON "suspensions" USING btree ("ends_at") WHERE "suspensions"."lifted_at" is null and "suspensions"."ends_at" is not null;--> statement-breakpoint
-- Accounts suspended before this migration get a live row too (reason unknown → 'other', no end date), so that "a live
-- row exists exactly when the account is suspended" holds from the start.
INSERT INTO "suspensions" ("user_id", "reason") SELECT "id", 'other' FROM "users" WHERE "status" = 'suspended';
