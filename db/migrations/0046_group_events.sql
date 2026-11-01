CREATE TABLE "town_hall_events" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"place" text,
	CONSTRAINT "town_hall_events_title_len" CHECK (char_length("town_hall_events"."title") between 3 and 80),
	CONSTRAINT "town_hall_events_place_len" CHECK ("town_hall_events"."place" is null or char_length("town_hall_events"."place") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "town_hall_rsvps" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_rsvps_post_id_user_id_pk" PRIMARY KEY("post_id","user_id"),
	CONSTRAINT "town_hall_rsvps_answer_check" CHECK ("town_hall_rsvps"."answer" in ('going', 'maybe', 'no'))
);
--> statement-breakpoint
ALTER TABLE "town_hall_events" ADD CONSTRAINT "town_hall_events_post_id_town_hall_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_rsvps" ADD CONSTRAINT "town_hall_rsvps_post_id_town_hall_events_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."town_hall_events"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_rsvps" ADD CONSTRAINT "town_hall_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "town_hall_rsvps_user_idx" ON "town_hall_rsvps" USING btree ("user_id");