ALTER TABLE "card_replies" DROP CONSTRAINT "card_replies_status_check";--> statement-breakpoint
ALTER TABLE "post_cards" DROP CONSTRAINT "post_cards_status_check";--> statement-breakpoint
ALTER TABLE "card_replies" ADD CONSTRAINT "card_replies_status_check" CHECK ("card_replies"."status" in ('published', 'pending', 'held'));--> statement-breakpoint
ALTER TABLE "post_cards" ADD CONSTRAINT "post_cards_status_check" CHECK ("post_cards"."status" in ('published', 'pending', 'held'));