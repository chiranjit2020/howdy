# ADR-018 — The moderation queue (reports, card removal, suspension)

Status: accepted (Phase 11, first slice, 2026-09-27). Built on the `reports` table from Phase 4 (ADR-010) and on
migration `0012` (`users.role`, `reports.card_id` / `reviewed_by` / `reviewed_at`), which an earlier pass added with the
service functions but never wired to an API, a page or tests.

## Context

Master prompt §31 asks for Block / Mute / Report / Restrict first (done in Phase 4) and "eventually" a Moderation
Queue, Moderator Actions, Account Suspension, Content Removal, an Audit Log and Appeals. Reports were being collected
with nothing to read them. This slice covers the queue, the three actions a moderator needs most often, and the audit
trail. It does not cover appeals.

## Decisions

1. **Roles are set by hand, never in the app.** `users.role` is `member | moderator | admin`, changed only with
   `pnpm set-role <call sign> <role>` (whoever holds the database credentials). The script writes `role_changed` to
   `audit_log`. No request body anywhere accepts a role. `admin` passes the same gate as `moderator` today and is kept
   for later capabilities.
2. **The moderation area is not advertised.** Every `/api/moderation/*` endpoint and the `/moderation` page answer a
   non-moderator with the ordinary 404, byte-for-byte the same as a missing page. The role is re-read on every
   request, so taking a role away takes effect on the next one. The page has no `loading.tsx`, since that would stream
   a 200 before the role check could answer 404 (the Phase 8 lesson).
3. **One closed set of actions per target.** A report can be dismissed, have its card removed (only when it was
   filed against a specific Post Card and the card still exists), or have its target suspended:
   `POST /api/moderation/reports/:id {action}`. An account can be suspended or reinstated directly:
   `POST /api/moderation/accounts/:handle {action}`.
4. **A report is closed exactly once.** Every action closes the report inside its own transaction, first, with
   `WHERE status in ('open','reviewing')`. A report that is already closed answers 409, and when two moderators race,
   one wins and the loser's whole transaction (card removal, suspension) rolls back. The single atomic check replaced a
   separate read-then-check, which the mutation run showed was redundant.
5. **Suspension ends every session.** Sessions already stop validating for a suspended account, and the realtime
   server already closes its sockets. We revoke them anyway so that reinstating someone does not quietly revive an
   old, possibly stolen, device; they must sign in again. Only an `active` account is suspended or reinstated, so a
   `pending_deletion` account is never turned into anything else.
6. **Staff are never suspended from the queue.** That includes a moderator acting on themselves. One moderator must
   not be able to lock the others out, so that is done by hand with `set-role` followed by a direct status change.
   The refusal rolls back, and the report stays open for someone else.
7. **Evidence outlives the content.** Removing a card deletes it (its replies and Yos cascade) but keeps the report
   with its 160-character evidence snapshot; `canRemoveCard` turns false. Reporter and target references SET NULL when
   an account goes. The queue shows suspended and leaving accounts with their status, unlike every member-facing list.
8. **Audit.** `report_dismissed`, `card_removed`, `account_suspended` and `account_reinstated` go to `audit_log` with
   the moderator as `user_id`, but only when something actually changed. Idempotent repeats are not logged.
9. **Limits.** Reading: 120/min per moderator. Acting (reports and accounts share one budget): 120/hour, spent before
   the report or handle lookup and even on a miss. Both fail closed.

## Not in this slice (deferred)

Appeals; telling a suspended person why, and for how long (today they see the generic "not available" sign-in
error); timed suspensions; a `reviewing` claim step (the status exists but nothing sets it); photo/Portrait reports and
image moderation; the held-Whispers tray; bulk actions; any automated or AI signal (§31: never the sole authority);
a phone tab for Moderation (it is sidebar-only, like Workshop and Town Halls).

## Verification

`tests/security/moderation.test.ts` (22 tests) and a mutation run (`.dev/mutate11.mjs`): 11 protections removed one
at a time, each made a test fail.
