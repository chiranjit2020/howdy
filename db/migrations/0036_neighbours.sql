-- Every Mark given before ADR-044 was Pals-only, so existing rows are from a Pal; new rows must say (no default).
ALTER TABLE "marks" ADD COLUMN "from_pal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "marks" ALTER COLUMN "from_pal" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "town_hall_members" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
-- Best known answer for today's members: when their row was made.
UPDATE "town_hall_members" SET "joined_at" = "created_at" WHERE "status" = 'active';
