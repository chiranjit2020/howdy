CREATE TABLE "suggestion_dismissals" (
	"user_id" uuid NOT NULL,
	"dismissed_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestion_dismissals_user_id_dismissed_id_pk" PRIMARY KEY("user_id","dismissed_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "discoverable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestion_dismissals" ADD CONSTRAINT "suggestion_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_dismissals" ADD CONSTRAINT "suggestion_dismissals_dismissed_id_users_id_fk" FOREIGN KEY ("dismissed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestion_dismissals_dismissed_idx" ON "suggestion_dismissals" USING btree ("dismissed_id");