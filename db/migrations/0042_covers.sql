ALTER TABLE "media" DROP CONSTRAINT "media_kind_check";--> statement-breakpoint
DROP INDEX "media_one_ready_per_owner_idx";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "cover_preset" text;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_ready_per_owner_idx" ON "media" USING btree ("owner_id","kind") WHERE "media"."status" = 'ready' and "media"."kind" in ('portrait', 'cover');--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_cover_preset_check" CHECK ("profiles"."cover_preset" is null or "profiles"."cover_preset" in ('porch', 'sunflower', 'dusk', 'meadow', 'lilac', 'sunrise'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('portrait', 'card_photo', 'cover'));