ALTER TABLE "media" DROP CONSTRAINT "media_one_home";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "ask_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_per_ask_idx" ON "media" USING btree ("ask_id") WHERE "media"."ask_id" is not null;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_ask_only_for_card_photos" CHECK ("media"."ask_id" is null or "media"."kind" = 'card_photo');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_one_home" CHECK (num_nonnulls("media"."card_id", "media"."hall_post_id", "media"."story_id", "media"."ask_id") <= 1);