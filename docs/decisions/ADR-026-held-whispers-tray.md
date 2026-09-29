# ADR-026 — The held tray: Whispers kept back from the person who restricted their sender

Status: accepted (Phase 11, fifth slice, 2026-09-29). Closes the gap ADR-013 left open ("a held tray is a later
moderation decision").

## Context

Restrict (ADR-010/013) stores a restricted person's Whispers as `held`. They look delivered to the sender and are
never shown, counted, rung or pushed to the recipient. The recipient had no way to read them at all. That left them
unable to see what was being said, or to report it (ADR-025 refused held Whispers for exactly that reason).

## Decisions

1. **A separate page, not the thread.** `/whispers/held` (and `GET /api/whispers/held`) lists the Whispers held back
   from me, newest first, with their sender. A link on the Whispers list, "Held back from people you restricted (n)",
   appears only when there is something to see. The tray is never a badge, a Chime, a push, or part of any unread
   count, so Restrict stays quiet.
2. **Reading tells the sender nothing.** Opening the tray does not move my read position, shows no "Seen" (ADR-021),
   and emits no event. The tests compare the conversation row and the notification count before and after.
3. **Only what was sent to me.** Held Whispers I sent (which look delivered to me) are not in my tray. Anyone else's
   held Whispers never are. Senders whose accounts are suspended or gone are left out, as in every member-facing list.
4. **It outlives the relationship.** The tray shows held Whispers whether or not I still restrict the sender, and
   whether or not we can still exchange Whispers. After a block, it is where the evidence is.
5. **Lifting a restriction does not deliver old held Whispers.** They stay in the tray until the 7-day retention
   removes them; new Whispers arrive in the thread normally. Delivering them later would ring the recipient for old
   words and show the sender a thread that suddenly changed.
6. **Reportable by their recipient.** `messageForReport` now accepts `held` as well as `sent`, still only for the
   participant who did not send it. Each tray entry has "Flag this Whisper".
7. **"held" and "unread" are reserved call signs.** `/whispers/held` and `/api/whispers/held` (like the existing
   `/api/whispers/unread`) are fixed words beside `/whispers/[call sign]`, so a person with that call sign would share
   their URL with the page. Both are now refused at sign-up. This also fixes a latent collision: someone could already
   sign up as `unread`. Accounts that ALREADY hold either name (if any) are not changed by this. Check production by
   hand before relying on it.

## Verification

`tests/security/held-tray.test.ts` (6), updated `report-subjects` and `auth-flow` tests. Mutation run
`.dev/mutate16.mjs`: 5 protections, all caught.
