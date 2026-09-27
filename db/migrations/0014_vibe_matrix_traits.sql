ALTER TABLE "marks" DROP CONSTRAINT "marks_kind_check";--> statement-breakpoint
-- Cinema and Sigma are retired with no counterpart in the new set, so their Marks go (and their givers' cooldowns with them).
DELETE FROM "marks" WHERE "kind" NOT IN ('gem', 'pure', 'chill', 'sharp', 'bold');--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_kind_check" CHECK ("marks"."kind" in ('gem', 'pure', 'chill', 'sharp', 'bold'));
