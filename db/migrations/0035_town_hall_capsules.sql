CREATE TABLE "town_hall_capsules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_hall_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"open_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_capsules_body_len" CHECK (char_length("town_hall_capsules"."body") between 1 and 280)
);
--> statement-breakpoint
ALTER TABLE "town_hall_posts" ADD COLUMN "capsule_sealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "town_hall_capsules" ADD CONSTRAINT "town_hall_capsules_town_hall_id_town_halls_id_fk" FOREIGN KEY ("town_hall_id") REFERENCES "public"."town_halls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_capsules" ADD CONSTRAINT "town_hall_capsules_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "town_hall_capsules_hall_idx" ON "town_hall_capsules" USING btree ("town_hall_id","open_on");--> statement-breakpoint
CREATE INDEX "town_hall_capsules_due_idx" ON "town_hall_capsules" USING btree ("open_on");--> statement-breakpoint
CREATE INDEX "town_hall_capsules_author_idx" ON "town_hall_capsules" USING btree ("author_id");