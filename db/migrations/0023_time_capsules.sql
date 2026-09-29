CREATE TABLE "time_capsules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"body" text NOT NULL,
	"open_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	CONSTRAINT "time_capsules_body_len" CHECK (char_length("time_capsules"."body") between 1 and 500),
	CONSTRAINT "time_capsules_opened_after_sealed" CHECK ("time_capsules"."opened_at" is null or "time_capsules"."opened_at" >= "time_capsules"."created_at")
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_not_self";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "capsules" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "time_capsules" ADD CONSTRAINT "time_capsules_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_capsules" ADD CONSTRAINT "time_capsules_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_capsules_recipient_idx" ON "time_capsules" USING btree ("recipient_id","opened_at");--> statement-breakpoint
CREATE INDEX "time_capsules_author_sealed_idx" ON "time_capsules" USING btree ("author_id") WHERE "time_capsules"."opened_at" is null;--> statement-breakpoint
CREATE INDEX "time_capsules_due_idx" ON "time_capsules" USING btree ("open_on") WHERE "time_capsules"."opened_at" is null;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_not_self" CHECK ("notifications"."recipient_id" <> "notifications"."actor_id" or "notifications"."type" = 'capsule_opened');--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened')) = ("notifications"."card_id" is null));