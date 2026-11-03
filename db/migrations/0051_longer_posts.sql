ALTER TABLE "card_replies" DROP CONSTRAINT "card_replies_body_len";--> statement-breakpoint
ALTER TABLE "post_cards" DROP CONSTRAINT "post_cards_body_len";--> statement-breakpoint
ALTER TABLE "town_hall_replies" DROP CONSTRAINT "town_hall_replies_body_len";--> statement-breakpoint
ALTER TABLE "card_replies" ADD CONSTRAINT "card_replies_body_len" CHECK (char_length("card_replies"."body") between 1 and 280);--> statement-breakpoint
ALTER TABLE "post_cards" ADD CONSTRAINT "post_cards_body_len" CHECK (char_length("post_cards"."body") between 1 and 500);--> statement-breakpoint
ALTER TABLE "town_hall_replies" ADD CONSTRAINT "town_hall_replies_body_len" CHECK (char_length("town_hall_replies"."body") between 1 and 280);