CREATE TABLE "town_hall_bans" (
	"town_hall_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by" uuid,
	"asked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_bans_town_hall_id_user_id_pk" PRIMARY KEY("town_hall_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "town_hall_bans" ADD CONSTRAINT "town_hall_bans_town_hall_id_town_halls_id_fk" FOREIGN KEY ("town_hall_id") REFERENCES "public"."town_halls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_bans" ADD CONSTRAINT "town_hall_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_bans" ADD CONSTRAINT "town_hall_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "town_hall_bans_user_idx" ON "town_hall_bans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "town_hall_bans_by_idx" ON "town_hall_bans" USING btree ("banned_by");