ALTER TABLE "media" DROP CONSTRAINT "media_kind_check";--> statement-breakpoint
DROP INDEX "media_one_ready_per_owner_idx";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_card_id_post_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."post_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_per_card_idx" ON "media" USING btree ("card_id") WHERE "media"."card_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_ready_per_owner_idx" ON "media" USING btree ("owner_id","kind") WHERE "media"."status" = 'ready' and "media"."kind" = 'portrait';--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_card_only_for_card_photos" CHECK ("media"."card_id" is null or "media"."kind" = 'card_photo');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('portrait', 'card_photo'));