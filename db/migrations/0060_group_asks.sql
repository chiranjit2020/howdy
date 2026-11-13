CREATE TABLE "town_hall_ask_answers" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_ask_answers_post_id_user_id_pk" PRIMARY KEY("post_id","user_id"),
	CONSTRAINT "town_hall_ask_answers_verdict" CHECK ("town_hall_ask_answers"."verdict" in ('buy', 'wait')),
	CONSTRAINT "town_hall_ask_answers_reason_len" CHECK (char_length("town_hall_ask_answers"."reason") between 2 and 140)
);
--> statement-breakpoint
CREATE TABLE "town_hall_asks" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"item" text NOT NULL,
	"price_rupees" integer NOT NULL,
	"alternative" text,
	"note" text,
	"noted_at" timestamp with time zone,
	"outcome" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "town_hall_asks_item_len" CHECK (char_length("town_hall_asks"."item") between 2 and 80),
	CONSTRAINT "town_hall_asks_price" CHECK ("town_hall_asks"."price_rupees" between 1 and 10000000),
	CONSTRAINT "town_hall_asks_alternative_len" CHECK ("town_hall_asks"."alternative" is null or char_length("town_hall_asks"."alternative") between 1 and 140),
	CONSTRAINT "town_hall_asks_note_len" CHECK ("town_hall_asks"."note" is null or char_length("town_hall_asks"."note") between 1 and 280),
	CONSTRAINT "town_hall_asks_outcome" CHECK ("town_hall_asks"."outcome" is null or "town_hall_asks"."outcome" in ('bought', 'waiting', 'skipped')),
	CONSTRAINT "town_hall_asks_decided_at" CHECK (("town_hall_asks"."outcome" is null) = ("town_hall_asks"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_hall_post_iff_hall_type";--> statement-breakpoint
ALTER TABLE "town_hall_ask_answers" ADD CONSTRAINT "town_hall_ask_answers_post_id_town_hall_asks_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_asks"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_ask_answers" ADD CONSTRAINT "town_hall_ask_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_asks" ADD CONSTRAINT "town_hall_asks_post_id_town_hall_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "town_hall_ask_answers_user_idx" ON "town_hall_ask_answers" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted', 'hall_ask_created', 'hall_ask_answered'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted', 'hall_ask_created', 'hall_ask_answered')) = ("notifications"."card_id" is null));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hall_post_iff_hall_type" CHECK (("notifications"."type" in ('hall_reply_created', 'hall_reaction_given', 'hall_ask_created', 'hall_ask_answered')) = ("notifications"."hall_post_id" is not null));