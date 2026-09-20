CREATE TABLE "card_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_replies_body_len" CHECK (char_length("card_replies"."body") between 1 and 80),
	CONSTRAINT "card_replies_status_check" CHECK ("card_replies"."status" in ('published', 'pending'))
);
--> statement-breakpoint
CREATE TABLE "post_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fence_owner_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_cards_body_len" CHECK (char_length("post_cards"."body") between 1 and 160),
	CONSTRAINT "post_cards_status_check" CHECK ("post_cards"."status" in ('published', 'pending'))
);
--> statement-breakpoint
CREATE TABLE "yos" (
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "yos_card_id_user_id_pk" PRIMARY KEY("card_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "fence_visibility" text DEFAULT 'members' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "fence_posting" text DEFAULT 'posse' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "fence_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "evidence_text" text;--> statement-breakpoint
ALTER TABLE "card_replies" ADD CONSTRAINT "card_replies_card_id_post_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."post_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_replies" ADD CONSTRAINT "card_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_cards" ADD CONSTRAINT "post_cards_fence_owner_id_users_id_fk" FOREIGN KEY ("fence_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_cards" ADD CONSTRAINT "post_cards_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yos" ADD CONSTRAINT "yos_card_id_post_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."post_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yos" ADD CONSTRAINT "yos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_replies_card_idx" ON "card_replies" USING btree ("card_id","created_at","id");--> statement-breakpoint
CREATE INDEX "card_replies_author_idx" ON "card_replies" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_cards_fence_page_idx" ON "post_cards" USING btree ("fence_owner_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "post_cards_author_idx" ON "post_cards" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "yos_user_idx" ON "yos" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_fence_visibility_check" CHECK ("profiles"."fence_visibility" in ('everyone', 'members', 'posse'));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_fence_posting_check" CHECK ("profiles"."fence_posting" in ('members', 'posse', 'nobody'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_evidence_len" CHECK ("reports"."evidence_text" is null or char_length("reports"."evidence_text") <= 160);