# ADR-037 — "Download my data"

Status: accepted (2026-10-04).

## Context

The Privacy Policy offered a copy of your data only by email (ADR-019 §7 flagged the gap), and most people live in
India, where the DPDP Act gives a right to a summary of what is held. Deletion became self-service in ADR-027; export
was the last right that still needed us by hand.

Decisions taken with you (2026-10-04): an **instant download** from the Workshop (no emailed link); a **ZIP with the
photos**; **"yours plus what you can see"** — everything you gave Howdy plus what the app already shows you; the
**password again plus a limit**.

## Decisions

1. **One rule: nothing in the file that the app would not show you right now.** Every module hands over its own rows
   in the state the person already sees (`<module>/export.ts`, read-only, no rate limits of their own):
   - a card, reply or Town Hall post **held** because its owner restricted the writer looks posted to the writer in
     the app, so it is "posted" in the writer's file and "waiting for approval" in the owner's;
   - a **declined** Pal request still looks sent to the person who asked;
   - Whispers held back from me are in my held tray, never my thread (ADR-026); my own held Whispers look sent;
   - a **sealed** Time Capsule has no words, not even for its writer; coming capsules say who and when (ADR-028);
   - **Marks** I received are counts per kind, never who gave which;
   - Tracks are exactly the Tracks page (Pals by name, everyone else as counts; frozen under Shadow Walk).
2. **One check for every person the file names** (`src/app/_lib/data-export.ts`): their account is active and they are
   not hidden from me (a block either way, or my mute), the same `getCards` + `hiddenAuthors` pair every Fence and list
   uses. An item that would name someone else is left out entirely, not anonymised: "a card on a Fence you can no
   longer see" would itself reveal that the account still exists behind a block or a suspension. My own lists (Pals,
   blocked, muted, restricted) follow the Pals page and the Workshop: anyone still active.
3. **Never in the file:** anyone else's email or any user id; anyone's private choices about me (their Close Pals,
   their mutes, their read receipts); read positions; push subscription keys; the security audit log; report outcomes,
   evidence snapshots or the person I reported (my own words and the reason are in). Suspensions of my own account are
   in, as sign-in told me: reason, dates, my appeal and its answer — never which moderator.
4. **Password again, two limits** (`verifyForExport`): attempts 10/hour, spent before the password is checked (like a
   sign-in), and finished exports 3/day, spent only after it is right. An audit row `data_exported`. A `POST` only, so a
   link or a prefetch can never start one.
5. **Streamed ZIP, built on the spot** (`src/platform/zip.ts`): stored entries (the photos are already-compressed WebP),
   no dependency, Node's `zlib.crc32`. The database is read and the JSON built before the first byte, so every error
   is still a normal JSON answer; photo files are read one at a time while streaming, so memory stays at one file and
   Vercel's 4.5 MB buffered-response limit does not apply. Entries carry no timestamps. Contents: `README.txt`,
   `data.json` (readable, indented, people as call sign + name), `photos/portrait.webp` and `photos/cards/<n>.webp`
   for every card in the file. Lists are capped (5,000 per kind) — far beyond real use, so one export stays bounded.
6. **Policy:** Privacy 1.9.0 describes the download; nobody is asked to agree again (it only adds a right).

## Consequences

- Words I wrote in a Town Hall I have left, or on a Fence whose owner is now hidden from me, are not in my file —
  the app does not show them to me either. Writing to the privacy address remains the route for anything else.
- Chimes are not exported: they hold no words, are rebuilt at read time and fade within 90 days.

## Verification

`tests/security/data-export.test.ts` (12): password and session, the two limits, a valid ZIP with checked CRCs, the
Portrait byte for byte, no other person's email or id, held card both ways, declined request, a blocker vanishes
entirely, suspended and closing accounts vanish, held Whisper in the tray only, sealed capsules wordless, Marks as
counts. Mutation run `.dev/mutate21.mjs`: 8/8 caught. e2e `tests/e2e/data-export.spec.ts`: a 320 px phone, axe, 44 px
targets, wrong password, then a real download that is a ZIP named after the person.
