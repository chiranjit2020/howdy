CREATE TABLE "ask_answers" (
	"ask_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_answers_ask_id_user_id_pk" PRIMARY KEY("ask_id","user_id"),
	CONSTRAINT "ask_answers_verdict" CHECK ("ask_answers"."verdict" in ('buy', 'wait')),
	CONSTRAINT "ask_answers_reason_len" CHECK (char_length("ask_answers"."reason") between 2 and 140)
);
--> statement-breakpoint
CREATE TABLE "asks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"item" text NOT NULL,
	"price_rupees" integer NOT NULL,
	"why" text NOT NULL,
	"alternative" text,
	"note" text,
	"noted_at" timestamp with time zone,
	"outcome" text,
	"decided_at" timestamp with time zone,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asks_audience" CHECK ("asks"."audience" in ('friends', 'everyone')),
	CONSTRAINT "asks_status" CHECK ("asks"."status" in ('published', 'held')),
	CONSTRAINT "asks_item_len" CHECK (char_length("asks"."item") between 2 and 80),
	CONSTRAINT "asks_price" CHECK ("asks"."price_rupees" between 1 and 10000000),
	CONSTRAINT "asks_why_len" CHECK (char_length("asks"."why") between 3 and 280),
	CONSTRAINT "asks_alternative_len" CHECK ("asks"."alternative" is null or char_length("asks"."alternative") between 1 and 140),
	CONSTRAINT "asks_note_len" CHECK ("asks"."note" is null or char_length("asks"."note") between 1 and 280),
	CONSTRAINT "asks_outcome" CHECK ("asks"."outcome" is null or "asks"."outcome" in ('bought', 'waiting', 'skipped')),
	CONSTRAINT "asks_decided_at" CHECK (("asks"."outcome" is null) = ("asks"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_subject_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
DROP INDEX "notifications_once_per_person";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "ask_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "ask_id" uuid;--> statement-breakpoint
ALTER TABLE "ask_answers" ADD CONSTRAINT "ask_answers_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_answers" ADD CONSTRAINT "ask_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_answers_user_idx" ON "ask_answers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asks_list_idx" ON "asks" USING btree ("audience","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "asks_author_idx" ON "asks" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_ask" ON "notifications" USING btree ("recipient_id","actor_id","type","ask_id") WHERE "notifications"."ask_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_ask_idx" ON "notifications" USING btree ("ask_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_person" ON "notifications" USING btree ("recipient_id","actor_id","type") WHERE "notifications"."card_id" is null and "notifications"."hall_post_id" is null and "notifications"."ask_id" is null;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_check" CHECK ("reports"."subject" in ('person', 'card', 'portrait', 'card_photo', 'whisper', 'town_hall', 'hall_post', 'ask'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ask_iff_ask_type" CHECK (("notifications"."type" in ('ask_created', 'ask_answered')) = ("notifications"."ask_id" is not null));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted', 'hall_ask_created', 'hall_ask_answered', 'ask_created', 'ask_answered'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted', 'hall_ask_created', 'hall_ask_answered', 'ask_created', 'ask_answered')) = ("notifications"."card_id" is null));