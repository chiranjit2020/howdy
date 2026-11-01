-- ADR-052: one current pick per rater -> target. Keep each pair's most recent Mark (the latest word they chose), drop
-- the older ones, then let the database enforce one row per pair.
DELETE FROM "marks" m USING "marks" newer
WHERE newer."rater_id" = m."rater_id"
  AND newer."target_id" = m."target_id"
  AND (newer."created_at", newer."id") > (m."created_at", m."id");--> statement-breakpoint
DROP INDEX "marks_pair_recent_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "marks_one_per_pair_idx" ON "marks" USING btree ("rater_id","target_id");
