# ADR-032 — Porch Light

Status: accepted (2026-10-01). Not in the master prompt: one of the "features other apps lack" proposed on 2026-10-01,
chosen by you as the next build after Portraits everywhere.

## Decisions taken with you (2026-10-01)

- **Audience is picked each time:** All Pals (default) or Close Pals only.
- **Length:** 30 minutes, 1 hour or 2 hours. It always turns itself off; it can be switched off early.
- **No Chime and no push.** A light is only seen by Pals who look (Home, or the Porch).
- **An optional note** of up to 60 characters ("free for chai ☕").

## Decisions

1. **It is the opposite of "online now".** Nothing is inferred from activity: a light exists only because its owner
   switched it on, and only while it is on. One row per person (`porch_lights`, primary key `user_id`). Switching off
   deletes it; switching on again replaces it (the time starts over). A light past `until_at` is off everywhere it is
   read, and `purgeExpiredLights` (daily job) deletes it, so there is no record of when anyone was around. The database
   itself refuses a light longer than two hours or ending before it began.
2. **Who sees it is decided at read time** (`relationships.palsReaching`): an accepted Pal **now**, no block in either
   direction, **not restricted by the owner**, and not muting the owner. A Close-only light also needs the **owner's**
   Close mark on the viewer (the viewer's mark on the owner does not count). Suspended or leaving owners are left out
   (`getCards`). The owner muting a Pal does not hide their own light from that Pal.
3. **Restrict hides it.** ADR-010 says Restrict limits interaction, not who may look; a light is nothing but an
   invitation to interact, and a restricted Pal's Whispers would be held anyway. The restricted Pal cannot tell: a
   Close-only light looks exactly the same from outside, and nobody is told a light exists.
4. **The answer never says who else sees it.** Viewers get the owner's name, photo (by the usual Portrait rule), note
   and end time — never the audience or any id. The owner sees their own audience.
5. **Note text** follows the Post Card rules (normalised, no disguising characters, no links). It is not separately
   reportable in this slice; the person can be reported.
6. **Rate limits:** 30 switches an hour (on, off or change), so a light cannot be flashed at someone as a signal; 240
   reads a minute.
7. **Times** are shown in Howdy's calendar time zone (Asia/Kolkata, ADR-028) as "8:30 pm", formatted on the server
   (`clockOf`) so the page and the browser never disagree.
8. **Module.** `lights` depends on `profiles` (names) and `relationships` (reach); nothing depends on it. Migration
   `0026`. Privacy Policy 1.6.0 describes it (no re-acceptance: it adds a feature, not a new use of existing data).

## Not in this slice

A Chime or push when a Pal's light comes on; lights for a Town Hall; a schedule ("every evening"); reporting a note.

## Verification

`tests/security/lights.test.ts` (15) and `tests/unit/calendar.test.ts` (`clockOf`). Mutation run
`.dev/mutate-lights.mjs`: 16 protections broken one at a time, all caught (block is tested with the Pal link still in
place, since blocking also ends the link).
