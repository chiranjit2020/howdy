CREATE TABLE "posse_links" (
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"low_marks_close" boolean DEFAULT false NOT NULL,
	"high_marks_close" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "posse_links_user_low_user_high_pk" PRIMARY KEY("user_low","user_high"),
	CONSTRAINT "posse_links_canonical_order" CHECK ("posse_links"."user_low" < "posse_links"."user_high"),
	CONSTRAINT "posse_links_status_check" CHECK ("posse_links"."status" in ('requested', 'accepted', 'declined')),
	CONSTRAINT "posse_links_requester_is_a_member" CHECK ("posse_links"."requested_by" in ("posse_links"."user_low", "posse_links"."user_high")),
	CONSTRAINT "posse_links_close_needs_accepted" CHECK ("posse_links"."status" = 'accepted' or (not "posse_links"."low_marks_close" and not "posse_links"."high_marks_close"))
);
--> statement-breakpoint
CREATE TABLE "scouts" (
	"scout_id" uuid NOT NULL,
	"scoutee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scouts_scout_id_scoutee_id_pk" PRIMARY KEY("scout_id","scoutee_id"),
	CONSTRAINT "scouts_not_self" CHECK ("scouts"."scout_id" <> "scouts"."scoutee_id")
);
--> statement-breakpoint
CREATE TABLE "user_controls" (
	"actor_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_controls_actor_id_target_id_kind_pk" PRIMARY KEY("actor_id","target_id","kind"),
	CONSTRAINT "user_controls_not_self" CHECK ("user_controls"."actor_id" <> "user_controls"."target_id"),
	CONSTRAINT "user_controls_kind_check" CHECK ("user_controls"."kind" in ('block', 'mute', 'restrict'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"target_user_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reason_check" CHECK ("reports"."reason" in ('harassment', 'spam', 'impersonation', 'inappropriate', 'other')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open', 'reviewing', 'actioned', 'dismissed')),
	CONSTRAINT "reports_details_len" CHECK ("reports"."details" is null or char_length("reports"."details") <= 500),
	CONSTRAINT "reports_not_self" CHECK ("reports"."reporter_id" is distinct from "reports"."target_user_id" or "reports"."reporter_id" is null)
);
--> statement-breakpoint
ALTER TABLE "posse_links" ADD CONSTRAINT "posse_links_user_low_users_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posse_links" ADD CONSTRAINT "posse_links_user_high_users_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_scout_id_users_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_scoutee_id_users_id_fk" FOREIGN KEY ("scoutee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_controls" ADD CONSTRAINT "user_controls_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_controls" ADD CONSTRAINT "user_controls_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posse_links_user_high_idx" ON "posse_links" USING btree ("user_high");--> statement-breakpoint
CREATE INDEX "posse_links_requested_by_idx" ON "posse_links" USING btree ("requested_by","status");--> statement-breakpoint
CREATE INDEX "scouts_scoutee_idx" ON "scouts" USING btree ("scoutee_id");--> statement-breakpoint
CREATE INDEX "user_controls_target_kind_idx" ON "user_controls" USING btree ("target_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_pair" ON "reports" USING btree ("reporter_id","target_user_id") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");