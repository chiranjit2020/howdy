CREATE TABLE "town_hall_members" (
	"town_hall_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_members_town_hall_id_user_id_pk" PRIMARY KEY("town_hall_id","user_id"),
	CONSTRAINT "town_hall_members_role_check" CHECK ("town_hall_members"."role" in ('owner', 'member')),
	CONSTRAINT "town_hall_members_status_check" CHECK ("town_hall_members"."status" in ('active', 'invited')),
	CONSTRAINT "town_hall_members_owner_active" CHECK ("town_hall_members"."role" <> 'owner' or "town_hall_members"."status" = 'active')
);
--> statement-breakpoint
CREATE TABLE "town_halls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"visibility" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "town_halls_name_len" CHECK (char_length("town_halls"."name") between 3 and 50),
	CONSTRAINT "town_halls_description_len" CHECK (char_length("town_halls"."description") between 1 and 280),
	CONSTRAINT "town_halls_visibility_check" CHECK ("town_halls"."visibility" in ('open', 'members', 'invite'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_card_iff_card_type";--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "townhalls" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "town_hall_members" ADD CONSTRAINT "town_hall_members_town_hall_id_town_halls_id_fk" FOREIGN KEY ("town_hall_id") REFERENCES "public"."town_halls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_hall_members" ADD CONSTRAINT "town_hall_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_halls" ADD CONSTRAINT "town_halls_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "town_hall_members_one_owner_idx" ON "town_hall_members" USING btree ("town_hall_id") WHERE "town_hall_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "town_hall_members_user_idx" ON "town_hall_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "town_halls_directory_idx" ON "town_halls" USING btree ("visibility","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "town_halls_owner_idx" ON "town_halls" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_card_iff_card_type" CHECK (("notifications"."type" in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted')) = ("notifications"."card_id" is null));