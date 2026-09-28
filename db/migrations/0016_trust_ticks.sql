CREATE TABLE "trust_ticks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"earned_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_ticks" ADD CONSTRAINT "trust_ticks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trust_ticks_checked_idx" ON "trust_ticks" USING btree ("checked_at");