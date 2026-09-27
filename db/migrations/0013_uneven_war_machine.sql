CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_acceptances_document_check" CHECK ("legal_acceptances"."document" in ('terms', 'privacy')),
	CONSTRAINT "legal_acceptances_version_check" CHECK ("legal_acceptances"."version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_acceptances_once" ON "legal_acceptances" USING btree ("user_id","document","version");