CREATE TABLE "tracks" (
	"owner_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"seen_on" date NOT NULL,
	CONSTRAINT "tracks_owner_id_visitor_id_pk" PRIMARY KEY("owner_id","visitor_id"),
	CONSTRAINT "tracks_not_self" CHECK ("tracks"."owner_id" <> "tracks"."visitor_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "shadow_walk" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_visitor_id_users_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracks_owner_seen_idx" ON "tracks" USING btree ("owner_id","seen_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tracks_seen_idx" ON "tracks" USING btree ("seen_on");--> statement-breakpoint
CREATE INDEX "tracks_visitor_idx" ON "tracks" USING btree ("visitor_id");