ALTER TABLE "media" DROP CONSTRAINT "media_kind_check";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_card_only_for_card_photos";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_status_check";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "poster_key" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "media_expires_idx" ON "media" USING btree ("expires_at") WHERE "media"."expires_at" is not null;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_video_fields_only_for_videos" CHECK ("media"."kind" = 'card_video' or ("media"."duration_ms" is null and "media"."poster_key" is null and "media"."expires_at" is null));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_expired_only_for_videos" CHECK ("media"."status" <> 'expired' or "media"."kind" = 'card_video');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('portrait', 'card_photo', 'cover', 'card_video'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_card_only_for_card_photos" CHECK ("media"."card_id" is null or "media"."kind" in ('card_photo', 'card_video'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_status_check" CHECK ("media"."status" in ('pending', 'ready', 'retired', 'expired'));