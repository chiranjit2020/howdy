CREATE TABLE "town_hall_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_hall_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_posts_body_len" CHECK (char_length("town_hall_posts"."body") between 1 and 280),
	CONSTRAINT "town_hall_posts_status_check" CHECK ("town_hall_posts"."status" in ('published', 'held'))
);
--> statement-breakpoint
CREATE TABLE "town_hall_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'yo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id"),
	CONSTRAINT "town_hall_reactions_kind_check" CHECK ("town_hall_reactions"."kind" in ('yo', 'laugh', 'fire', 'popcorn', 'love'))
);
--> statement-breakpoint
CREATE TABLE "town_hall_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_replies_body_len" CHECK (char_length("town_hall_replies"."body") between 1 and 80),
	CONSTRAINT "town_hall_replies_status_check" CHECK ("town_hall_replies"."status" in ('published', 'held'))
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_subject_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
DROP INDEX "notifications_once_per_person";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "hall_post_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "hall_post_id" uuid;--> statement-breakpoint
ALTER TABLE "town_hall_posts" ADD CONSTRAINT "town_hall_posts_town_hall_id_town_halls_id_fk" FOREIGN KEY ("town_hall_id") REFERENCES "public"."town_halls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_posts" ADD CONSTRAINT "town_hall_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_reactions" ADD CONSTRAINT "town_hall_reactions_post_id_town_hall_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_reactions" ADD CONSTRAINT "town_hall_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_replies" ADD CONSTRAINT "town_hall_replies_post_id_town_hall_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_replies" ADD CONSTRAINT "town_hall_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "town_hall_posts_feed_idx" ON "town_hall_posts" USING btree ("town_hall_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "town_hall_posts_author_idx" ON "town_hall_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "town_hall_reactions_user_idx" ON "town_hall_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "town_hall_replies_post_idx" ON "town_hall_replies" USING btree ("post_id","created_at","id");--> statement-breakpoint
CREATE INDEX "town_hall_replies_author_idx" ON "town_hall_replies" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_hall_post_id_town_hall_posts_id_fk" FOREIGN KEY ("hall_post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hall_post_id_town_hall_posts_id_fk" FOREIGN KEY ("hall_post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_hall_post" ON "notifications" USING btree ("recipient_id","actor_id","type","hall_post_id") WHERE "notifications"."hall_post_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_hall_post_idx" ON "notifications" USING btree ("hall_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_per_person" ON "notifications" USING btree ("recipient_id","actor_id","type") WHERE "notifications"."card_id" is null and "notifications"."hall_post_id" is null;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_check" CHECK ("reports"."subject" in ('person', 'card', 'portrait', 'whisper', 'town_hall', 'hall_post'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hall_post_iff_hall_type" CHECK (("notifications"."type" in ('hall_reply_created', 'hall_reaction_given')) = ("notifications"."hall_post_id" is not null));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given')) = ("notifications"."card_id" is null));