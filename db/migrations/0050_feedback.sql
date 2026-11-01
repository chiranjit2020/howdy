CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"page" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	CONSTRAINT "feedback_kind_check" CHECK ("feedback"."kind" in ('idea', 'broken', 'other')),
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" in ('new', 'read', 'done')),
	CONSTRAINT "feedback_body_len" CHECK (char_length("feedback"."body") between 1 and 1000),
	CONSTRAINT "feedback_page_check" CHECK ("feedback"."page" is null or "feedback"."page" ~ '^/([A-Za-z0-9_.@-][A-Za-z0-9/_.@-]{0,198})?$')
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id");