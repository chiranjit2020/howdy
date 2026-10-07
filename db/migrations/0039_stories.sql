CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stories_audience_check" CHECK ("stories"."audience" in ('pals', 'close')),
	CONSTRAINT "stories_caption_len" CHECK ("stories"."caption" is null or char_length("stories"."caption") between 1 and 80),
	CONSTRAINT "stories_twelve_hours" CHECK ("stories"."expires_at" > "stories"."created_at" and "stories"."expires_at" <= "stories"."created_at" + interval '12 hours')
);
--> statement-breakpoint
CREATE TABLE "story_reactions" (
	"story_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_reactions_story_id_user_id_pk" PRIMARY KEY("story_id","user_id"),
	CONSTRAINT "story_reactions_kind_check" CHECK ("story_reactions"."kind" in ('yo', 'laugh', 'fire', 'popcorn', 'love'))
);
--> statement-breakpoint
CREATE TABLE "story_views" (
	"story_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_views_story_id_viewer_id_pk" PRIMARY KEY("story_id","viewer_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_card_or_hall_post";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "story_views" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "story_id" uuid;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_author_expires_idx" ON "stories" USING btree ("author_id","expires_at");--> statement-breakpoint
CREATE INDEX "stories_expires_idx" ON "stories" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "story_reactions_user_idx" ON "story_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "story_views_viewer_idx" ON "story_views" USING btree ("viewer_id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_per_story_idx" ON "media" USING btree ("story_id") WHERE "media"."story_id" is not null;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted')) = ("notifications"."card_id" is null));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_story_only_for_card_photos" CHECK ("media"."story_id" is null or "media"."kind" = 'card_photo');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_one_home" CHECK (num_nonnulls("media"."card_id", "media"."hall_post_id", "media"."story_id") <= 1);