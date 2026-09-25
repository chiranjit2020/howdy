CREATE TABLE "tributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tributes_not_self" CHECK ("tributes"."owner_id" <> "tributes"."author_id"),
	CONSTRAINT "tributes_status_check" CHECK ("tributes"."status" in ('pending', 'published')),
	CONSTRAINT "tributes_body_len" CHECK (char_length("tributes"."body") between 1 and 280),
	CONSTRAINT "tributes_pinned_published" CHECK (not "tributes"."pinned" or "tributes"."status" = 'published')
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rater_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marks_not_self" CHECK ("marks"."rater_id" <> "marks"."target_id"),
	CONSTRAINT "marks_kind_check" CHECK ("marks"."kind" in ('chill', 'pure', 'cinema', 'sigma', 'gem'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "tributes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tributes" ADD CONSTRAINT "tributes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tributes" ADD CONSTRAINT "tributes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tributes_one_pinned_per_owner_idx" ON "tributes" USING btree ("owner_id") WHERE "tributes"."pinned";--> statement-breakpoint
CREATE INDEX "tributes_owner_page_idx" ON "tributes" USING btree ("owner_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tributes_author_idx" ON "tributes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "marks_pair_recent_idx" ON "marks" USING btree ("rater_id","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "marks_target_kind_idx" ON "marks" USING btree ("target_id","kind");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given')) = ("notifications"."card_id" is null));