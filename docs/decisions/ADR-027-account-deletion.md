# ADR-027 — Account deletion ("Burn the Deed")

Status: accepted (2026-09-30). Implements the design in `docs/DATA_LIFECYCLE.md` §2 (written in Phase 3).

## Context

The Privacy Policy promised deletion, but the only route was writing to the privacy address. Master prompt §55 asks
for deletion that understands the dependency graph, not `DELETE FROM users`. Object storage (Portraits) is outside
the database, so a cascade alone would orphan files.

Decisions taken with you (2026-09-30): a **14-day grace period, cancelled by signing in**; the call sign is **held
back 90 days**; a **suspended account may delete itself**.

## Decisions

1. **Ask with the password, close at once.** Workshop → "Burn the Deed" re-checks the password (rate limited 5/hour)
   and confirms once more. The account becomes `pending_deletion`, every session is revoked, and it disappears
   everywhere, because every gate admits only `active` accounts. An email gives the deletion date.
2. **Suspended accounts too.** They have no session, so `POST /api/auth/close` takes the sign-in details, with the same
   checks and limits as signing in. The suspension notice offers "Delete my account instead…". Reports about them
   stay (with the link cleared) for their usual year, so no evidence is lost.
3. **14 days to change your mind.** Signing in during the grace period answers `403 ACCOUNT_CLOSING`
   (`data.deleteOn`), and only after the password is proven. A wrong password looks like any other. "Keep my account"
   (`POST /api/auth/keep`) puts it back exactly as it was: suspended if a suspension is still in force, so closing and
   reopening cannot be used to escape a suspension. The sessions that were open when it closed stay dead, so a lost
   device is not revived.
4. **Files first, then the account.** The daily job (`purgeDeletedAccounts`, app layer, because it composes `auth` and
   `media`) deletes the person's photo files, and deletes the account only when no `media` row is left. A storage
   failure defers that account to the next run; one account's failure never stops the others. Deleting the `users`
   row cascades everything in DATA_LIFECYCLE §1. The audit log (`account_deleted`, no user id) and reports keep their
   rows without the link.
5. **Call sign held back 90 days, as a keyed hash.** `retired_handles` stores `HMAC-SHA256(AUTH_SECRET, handle)`,
   never the name, and sign-up answers exactly as for a taken call sign. After 90 days the call sign is free even
   before the job forgets the row. Rotating `AUTH_SECRET` frees every held call sign early; that is acceptable.
6. **Documents.** Privacy and Terms 1.2.0: self-service deletion, the 14 days, and the 90-day hold. `acceptVersion` is
   unchanged: this adds a right and asks nothing new.

## Not in this slice

A download of my data ("Export"; still by email). Deleting on someone's behalf (a moderator or the operator, e.g. an
under-age account) goes through the same `closeAccount` → job path, but there is no moderator button for it yet.

## Verification

`tests/security/account-deletion.test.ts` (12). Mutation run `.dev/mutate17.mjs`: 12 protections, all caught. The
first run let two escape, and the tests were strengthened: old sessions after "Keep my account", and a held call sign
whose date has passed before the job runs.
