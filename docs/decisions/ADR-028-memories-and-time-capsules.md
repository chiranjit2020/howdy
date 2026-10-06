# ADR-028 — Memories and Time Capsules (Phase 12)

Status: accepted (2026-09-30). Master prompt §61 Phase 12; the prompt names the feature ("Memories: social history",
"Time Capsules") but not its shape, so the shape below was decided with you.

## Decisions taken with you (2026-09-30)

- A Time Capsule is for **me or one Pal**.
- The Pal **sees that one is coming, and when**, but never the words.
- If the two are **no longer Pals, or there is a block, on the day, it never opens** (it is deleted).
- Memories: **on this day** (cards on my Fence), **Pal anniversaries**, and **Tribute anniversaries**.

## Decisions

1. **One calendar: Asia/Kolkata.** There is no per-person time zone and most people are in India, so "today", "on this
   day" and "opens on 12 March" are Indian dates (`src/shared/calendar.ts`). 28 Feb also remembers 29 Feb in a year
   without one; a capsule sealed on 29 Feb for "+1 year" is limited like any date (tomorrow … 5 years).
2. **Sealed means sealed for everyone, the writer included.** No query selects `body` for an unopened capsule: the
   writer sees "for whom, opens when" and can take it back (deleting it); the recipient sees "from whom, opens when".
   This is stored text, not end-to-end encrypted, and the Privacy Policy says so.
3. **Opening is decided on the day.** A capsule opens the first time its recipient looks on or after its day, or in
   the daily job (`openDue`), whichever is first. Both people must be active (a suspended one makes it wait, not
   vanish), and a capsule to a Pal needs them to be Pals with no block **now**, otherwise it is deleted. Opening is a
   conditional update, so two readers opening at once ring once.
4. **The Chime never carries the words.** `capsule_opened` says who it is from ("your past self" for one's own), and
   links to `/capsules`. It is the one Chime whose sender may be its recipient (the database rule `notifications_not_self`
   now allows exactly that type). It has its own "Time Capsules" switch in the Workshop.
5. **Limits.** 1–500 characters with the usual text rules (links allowed, as in Whispers: it is private); a day from
   tomorrow to 5 years (a real calendar day: 30 Feb is refused); at most 20 unopened per writer and 3 to any one Pal;
   10 a day, and 3 a day in an account's first week (ADR-024).
6. **After opening it is the recipient's.** They can delete it; the writer cannot. It stays until they do, or until
   either account is deleted (CASCADE). If the writer is later hidden from the recipient (blocked, muted, suspended),
   the opened capsule is not shown, like every list.
7. **Memories store nothing.** They are worked out when read, from what is still there and still visible today: a
   removed card or Tribute, an ex-Pal, a pending Tribute, someone blocked, muted or suspended — none of these come
   back. Only my own Fence, my own Pal links and Tributes on my Porch. Shown on Home as "On this day", only when there
   is something; no Chime or push (a daily nudge is a later choice).
8. **Modules.** `capsules` (moderation, profiles, relationships) and `memories` (profiles, relationships) are leaves:
   nothing depends on them; the Chime is a domain event (`capsule.opened`). Migration `0023`.

## Not in this slice

Capsules to a Town Hall (since built: ADR-043); a report button on an opened capsule (the writer can be reported as a person); photos in
capsules; a yearly recap; Memories as a Chime or push.

## Verification

`tests/security/capsules.test.ts` (18), `tests/security/memories.test.ts` (7), `tests/unit/calendar.test.ts` (4).
Mutation run `.dev/mutate18.mjs`: 22 protections, all caught (one more — the ex-Pal check in Memories — is a
second guard behind the link being deleted when Pals part, and is expected to escape).
