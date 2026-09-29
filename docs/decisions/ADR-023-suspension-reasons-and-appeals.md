# ADR-023 — Suspension reasons, timed suspensions and appeals

Status: accepted (Phase 11, second slice, 2026-09-29). Builds on ADR-018 (the moderation queue).

## Context

ADR-018 left three gaps. A suspended person saw only the generic "not available" sign-in error, so they could not
tell they were suspended, why, or for how long. Every suspension lasted until someone remembered to lift it. And
master prompt §31 asks for appeals, which the Terms promised only through an email address.

Decisions taken with you (2026-09-29): tell the person the **reason and the end date, with an in-app appeal**;
suspensions are **7 days, 30 days, or indefinite**, and timed ones **lift themselves**.

## Decisions

1. **`users.status` stays the one switch.** Every gate in the app already checks `status = 'active'`. A new
   `suspensions` table (migration `0019`) says why, until when, and holds the appeal. A live row (`lifted_at is null`)
   exists exactly while the account is suspended (a partial unique index allows one per person). Accounts suspended
   before 0019 were given a live row with reason `other` and no end date. A suspension set by hand in the database,
   which has no row, is treated the same way, and gets a row as soon as its owner appeals.
2. **The reason is one of a closed set, never free text.** It is shown to the suspended person, so a moderator picks
   from the report reasons (harassment, spam, impersonation, inappropriate, other). Suspending from a report defaults
   to that report's reason. A length (`7d` / `30d` / `indefinite`) is required: the API refuses a suspension without
   one, and the UI makes it a second step, so a suspension is never a single stray click.
3. **Told only after the password is proven.** Sign-in still verifies the password first, with the same dummy-hash
   timing. Only then does a suspended account get `403 ACCOUNT_SUSPENDED` with `data: {reason, endsAt, appeal}`.
   Nothing else is included: no moderator, no ids, no report. A wrong password looks exactly as it always did. A
   `pending_deletion` account is still the generic `ACCOUNT_UNAVAILABLE`.
4. **Timed suspensions lift themselves, twice over.** At sign-in, an ended suspension is lifted and the person is
   signed straight in (audited as `suspension_expired`). The daily purge job (`liftExpiredSuspensions`) lifts the rest,
   so the person reappears in lists without having to come back first. Indefinite ones are never touched.
5. **One appeal per suspension, with the sign-in details.** A suspended person has no session, so
   `POST /api/auth/appeal` takes the identifier and password again. They go through the same `verifyCredentials` and
   the SAME login rate limits, so an appeal is not a second place to guess passwords. The text follows the report
   rules (at most 500 characters, no disguising characters). A second appeal answers 409. A new suspension later
   allows a new appeal.
6. **Answered exactly once.** `grant` lifts the suspension (`lift_cause = 'appeal'`) and `uphold` lets it stand. The
   update requires the appeal to be still open, so a repeat or a racing moderator gets 409 and changes nothing.
   Reinstating by hand also marks an open appeal as granted. Sign-in tells the person whether their appeal is
   waiting or was upheld. The moderator sees open appeals oldest first on `/moderation`, and the page and API stay
   404 to everyone else.
7. **Module boundary.** `auth` may now import `moderation` (which depends on nothing), so no import cycle is possible.
   The password check stays in `auth`. What to say about a suspension, and the appeal itself, live in `moderation`.
   Its `fileAppeal` checks the account is suspended again rather than trust the caller.
8. **The documents say so.** Terms, Campfire Rules and Privacy moved to 1.1.0 (in-app appeals, suspension lengths, and
   suspension records kept for the life of the account). At first `acceptVersion` did not move. On 2026-09-30 you chose to
   raise Privacy's to 1.1.0 (ADR-025 added a new use of data: reported Whisper words outlive the Whisper), so
   everyone is asked once. Closed reports are now deleted 1 year after closing.

## Not in this slice

An email telling the person they were suspended. Today they learn at their next sign-in, which is the moment it
matters; an email would need its own wording and unsubscribe thinking. Also not included: bulk actions, appeals for
removed Post Cards, and a limit on a moderator answering an appeal about their own suspension. With a small team
that limit would leave appeals unanswerable, so it is recorded in the audit trail instead.

## Verification

`tests/security/suspensions.test.ts` (24 tests) and the updated `tests/security/moderation.test.ts` (22). Mutation run
`.dev/mutate13.mjs`: 14 protections removed one at a time, and all 14 were caught. The first run let two escape, and
the tests were strengthened. One was answering an upheld appeal a second time. The other was the module accepting an
appeal from an active account, which the HTTP layer hid.
