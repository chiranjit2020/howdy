ALTER TABLE "town_hall_capsules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "town_hall_capsules" CASCADE;--> statement-breakpoint
ALTER TABLE "town_halls" DROP CONSTRAINT "town_halls_visibility_check";--> statement-breakpoint
UPDATE "town_halls" SET "visibility" = 'open' WHERE "visibility" = 'members';--> statement-breakpoint
ALTER TABLE "town_halls" ADD CONSTRAINT "town_halls_visibility_check" CHECK ("town_halls"."visibility" in ('open', 'invite'));