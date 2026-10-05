ALTER TABLE "reports" DROP CONSTRAINT "reports_subject_check";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "held" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_check" CHECK ("reports"."source" in ('member', 'photo_check'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_photo_check_has_photo" CHECK ("reports"."source" = 'member' or ("reports"."reporter_id" is null and "reports"."subject" in ('portrait', 'card_photo')));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_check" CHECK ("reports"."subject" in ('person', 'card', 'portrait', 'card_photo', 'whisper', 'town_hall', 'hall_post'));