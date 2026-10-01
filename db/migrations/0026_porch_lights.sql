CREATE TABLE "porch_lights" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"note" text,
	"lit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"until_at" timestamp with time zone NOT NULL,
	CONSTRAINT "porch_lights_audience_check" CHECK ("porch_lights"."audience" in ('pals', 'close')),
	CONSTRAINT "porch_lights_note_len" CHECK ("porch_lights"."note" is null or char_length("porch_lights"."note") between 1 and 60),
	CONSTRAINT "porch_lights_length" CHECK ("porch_lights"."until_at" > "porch_lights"."lit_at" and "porch_lights"."until_at" <= "porch_lights"."lit_at" + interval '2 hours')
);
--> statement-breakpoint
ALTER TABLE "porch_lights" ADD CONSTRAINT "porch_lights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "porch_lights_until_idx" ON "porch_lights" USING btree ("until_at");