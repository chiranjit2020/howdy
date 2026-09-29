# ADR-025 — Reporting a photo, a Whisper or a Town Hall

Status: accepted (Phase 11, fourth slice, 2026-09-29). Extends ADR-010 (reports) and ADR-018 (the queue).

## Context

Only a person or a Post Card could be reported. ADR-015 left photos unreportable, Whispers could not be reported
at all, and Town Halls, whose name and description anyone browsing the directory reads, could not be either.
Decision taken with you (2026-09-29): add **Portraits, Whispers and Town Halls**.

## Decisions

1. **One `subject` per report, and one pointer per kind of thing.** Migration `0021` adds `reports.subject`
   (`person | card | portrait | whisper | town_hall`) and `media_id`, `message_id` and `town_hall_id` beside the existing
   `card_id`. All of them are SET NULL, so the report outlives the thing. Only the pointer that matches the subject is
   ever set. Reports filed before 0021 were backfilled as `card` when they carried a card or its words.
2. **One open report per reporter, target and kind of thing.** The unique index now includes `subject`. Reporting
   someone and then, separately, their photo files both, and repeating either is still a silent no-op. The auto-hold
   count (ADR-024) was already `count(distinct reporter)`, so one person with several open reports still counts once.
3. **Only what you can see, and the same 404 for everything else.** You can report a photo only if you may see it (the
   same `mayViewRanch` rule as the photo itself). A Town Hall follows the `getTownHall` rule, so an invite-only one stays
   invisible. A Whisper can be reported only by the person who **received** it, and only if it reached them (`sent`,
   never `held`). Your own photo or Town Hall, your own Whisper, someone else's thread, a held message, a made-up id:
   all answer the identical 404.
4. **Whispers: one message, never the thread, and reportable after a block.** Reporting doesn't require that you can
   still exchange Whispers, because blocking a harasser is usually the step right before reporting them. The report
   keeps a snapshot of that one message's words (evidence is now at most 600 characters, enough for a Town Hall's name
   and description). Nothing reads the rest of the thread. The Whisper still vanishes from the thread after 7 days; its
   words stay with the report. The Privacy Policy now says so.
5. **Photos: the exact version.** The report names the Portrait's media id. A moderator sees that version through
   `GET /api/moderation/reports/:id/portrait` (moderators only, `no-store`), and it is a 404 once that version is
   replaced or removed. `remove_portrait` retires only that version: a newer photo is never touched (409), and one
   whose row is gone has nothing to remove (400).
6. **Actions per kind of thing.** `remove_portrait`, `remove_whisper` (deletes that one message for both sides) and
   `remove_town_hall` (its memberships and invites cascade) join `remove_card`. Each works only on a report about
   that kind of thing, closes the report first in its own transaction, and is audited (`portrait_removed`,
   `whisper_removed`, `town_hall_removed`). Queue items carry `subject` and `canRemove`, and show when the thing is
   already gone.
7. **Boundaries.** `moderation` still imports no module. It deletes messages and Town Halls directly by row, the same
   way it already deletes a card. The photo is in object storage, which only `media` may touch, so the app route hands
   `media.retirePortrait` to `removeReportedPortrait`. It runs inside the report's transaction, so if removing the photo
   fails, the report stays open.
8. **Where you find it.** Porch ⋯ menu → "Flag their photo…" (only when they have one you can see). A Whisper thread →
   "Flag a Whisper" puts a flag button under each Whisper you received. A Town Hall you don't own → "Flag this Town
   Hall…". The report routes live under `/api/reports/…`, because `/api/whispers/<word>` belongs to call signs.

## Not in this slice

Reporting a Tribute, a Signal or a reply on its own (a reply's author can be reported as a person); image moderation
(automatic nudity/violence detection — needs an outside service and its own privacy decision); a fixed retention
period for report evidence (flagged "Needs legal review" in the Privacy Policy since P0).

## Verification

`tests/security/report-subjects.test.ts` (15 tests). Mutation run `.dev/mutate15.mjs`: 13 protections, all caught. The
first run let three escape. Each one needed an old photo row that lingers after a failed clean-up, so a test now
recreates exactly that.
