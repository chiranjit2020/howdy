CREATE TABLE "town_hall_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "town_hall_poll_options_label_len" CHECK (char_length("town_hall_poll_options"."label") between 1 and 60),
	CONSTRAINT "town_hall_poll_options_position" CHECK ("town_hall_poll_options"."position" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "town_hall_poll_votes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_poll_votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "town_hall_polls" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "town_hall_poll_options" ADD CONSTRAINT "town_hall_poll_options_post_id_town_hall_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_poll_votes" ADD CONSTRAINT "town_hall_poll_votes_post_id_town_hall_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_poll_votes" ADD CONSTRAINT "town_hall_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_poll_votes" ADD CONSTRAINT "town_hall_poll_votes_option_id_town_hall_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."town_hall_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_polls" ADD CONSTRAINT "town_hall_polls_post_id_town_hall_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "town_hall_poll_options_order_idx" ON "town_hall_poll_options" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "town_hall_poll_votes_user_idx" ON "town_hall_poll_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "town_hall_poll_votes_option_idx" ON "town_hall_poll_votes" USING btree ("option_id");