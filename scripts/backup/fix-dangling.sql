-- Run by restore.sh between loading the rows and adding the constraints. A few kept rows point at short-lived rows the
-- backup leaves out (skip-data.txt). Both links are ON DELETE SET NULL in the live database, so clearing them is exactly
-- what deleting those rows does there. tests/security/db-backup.test.ts fails if a new such link is not handled here.
update reports set message_id = null
 where message_id is not null and not exists (select 1 from messages m where m.id = reports.message_id);
update media set story_id = null
 where story_id is not null and not exists (select 1 from stories s where s.id = media.story_id);
