ALTER TABLE "reports" DROP CONSTRAINT "reports_evidence_len";--> statement-breakpoint
DROP INDEX "reports_one_open_per_pair";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "subject" text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "town_hall_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_town_hall_id_town_halls_id_fk" FOREIGN KEY ("town_hall_id") REFERENCES "public"."town_halls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_pair" ON "reports" USING btree ("reporter_id","target_user_id","subject") WHERE "reports"."status" = 'open';--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_check" CHECK ("reports"."subject" in ('person', 'card', 'portrait', 'whisper', 'town_hall'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_evidence_len" CHECK ("reports"."evidence_text" is null or char_length("reports"."evidence_text") <= 600);--> statement-breakpoint
-- Reports filed before 0021 were about a person, or about a Post Card (those carry the card or its words).
UPDATE "reports" SET "subject" = 'card' WHERE "card_id" IS NOT NULL OR "evidence_text" IS NOT NULL;
