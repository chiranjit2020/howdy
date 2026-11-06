ALTER TABLE "post_cards" DROP CONSTRAINT "post_cards_body_len";--> statement-breakpoint
ALTER TABLE "town_hall_posts" DROP CONSTRAINT "town_hall_posts_body_len";--> statement-breakpoint
ALTER TABLE "post_cards" ADD CONSTRAINT "post_cards_body_len" CHECK (char_length("post_cards"."body") between 0 and 500);--> statement-breakpoint
ALTER TABLE "town_hall_posts" ADD CONSTRAINT "town_hall_posts_body_len" CHECK (char_length("town_hall_posts"."body") between 0 and 280);