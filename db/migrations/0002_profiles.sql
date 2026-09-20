CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"portrait_tint" text DEFAULT 'peach' NOT NULL,
	"signal" text,
	"signal_set_at" timestamp with time zone,
	"signal_expires_at" timestamp with time zone,
	"ranch_visibility" text DEFAULT 'members' NOT NULL,
	"signal_visibility" text DEFAULT 'members' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_len" CHECK (char_length("profiles"."display_name") between 1 and 50),
	CONSTRAINT "profiles_display_name_clean" CHECK ("profiles"."display_name" !~ '[\x00-\x1f\x7f]'),
	CONSTRAINT "profiles_portrait_tint_check" CHECK ("profiles"."portrait_tint" in ('peach', 'mint', 'gold', 'lavender', 'sky')),
	CONSTRAINT "profiles_ranch_visibility_check" CHECK ("profiles"."ranch_visibility" in ('everyone', 'members', 'posse')),
	CONSTRAINT "profiles_signal_visibility_check" CHECK ("profiles"."signal_visibility" in ('everyone', 'members', 'posse')),
	CONSTRAINT "profiles_signal_len" CHECK ("profiles"."signal" is null or char_length("profiles"."signal") between 1 and 80),
	CONSTRAINT "profiles_signal_pair" CHECK (("profiles"."signal" is null) = ("profiles"."signal_expires_at" is null))
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Every account gets a Ranch. Accounts created before this migration start with their handle as display name.
INSERT INTO "profiles" ("user_id", "display_name") SELECT "id", "handle" FROM "users" ON CONFLICT ("user_id") DO NOTHING;