ALTER TABLE "profile_details" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "linkedin" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "x_handle" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "youtube" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "facebook" text;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "website_audience" text DEFAULT 'posse' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "email_audience" text DEFAULT 'posse' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "phone_audience" text DEFAULT 'posse' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_details" ADD COLUMN "socials_audience" text DEFAULT 'posse' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_website_audience_check" CHECK ("profile_details"."website_audience" in ('members', 'posse', 'only_me'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_socials_audience_check" CHECK ("profile_details"."socials_audience" in ('members', 'posse', 'only_me'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_email_audience_check" CHECK ("profile_details"."email_audience" in ('posse', 'only_me'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_phone_audience_check" CHECK ("profile_details"."phone_audience" in ('posse', 'only_me'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_website_check" CHECK ("profile_details"."website" is null or ("profile_details"."website" like 'https://%' and char_length("profile_details"."website") <= 200 and "profile_details"."website" !~ '\s'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_email_check" CHECK ("profile_details"."email" is null or (char_length("profile_details"."email") <= 254 and "profile_details"."email" ~ '^[^@\s]+@[^@\s]+$'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_phone_check" CHECK ("profile_details"."phone" is null or (char_length("profile_details"."phone") <= 20 and "profile_details"."phone" ~ '^\+?[0-9 ()-]+$'));--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_instagram_check" CHECK ("profile_details"."instagram" is null or "profile_details"."instagram" ~ '^[A-Za-z0-9._]{1,30}$');--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_linkedin_check" CHECK ("profile_details"."linkedin" is null or "profile_details"."linkedin" ~ '^[A-Za-z0-9-]{3,100}$');--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_x_handle_check" CHECK ("profile_details"."x_handle" is null or "profile_details"."x_handle" ~ '^[A-Za-z0-9_]{1,15}$');--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_youtube_check" CHECK ("profile_details"."youtube" is null or "profile_details"."youtube" ~ '^[A-Za-z0-9._-]{3,30}$');--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_facebook_check" CHECK ("profile_details"."facebook" is null or "profile_details"."facebook" ~ '^[A-Za-z0-9.]{5,50}$');