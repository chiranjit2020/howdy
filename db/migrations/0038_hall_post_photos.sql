ALTER TABLE "media" ADD COLUMN "hall_post_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_hall_post_id_town_hall_posts_id_fk" FOREIGN KEY ("hall_post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_per_hall_post_idx" ON "media" USING btree ("hall_post_id") WHERE "media"."hall_post_id" is not null;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_hall_post_only_for_card_photos" CHECK ("media"."hall_post_id" is null or "media"."kind" = 'card_photo');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_card_or_hall_post" CHECK ("media"."card_id" is null or "media"."hall_post_id" is null);