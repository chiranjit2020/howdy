# ADR-050 — Personal details on a profile, each with its own audience

Status: accepted (2026-11-01). Asked for by you: a personal details card on the profile.

## Decisions taken with you (2026-11-01)

- **Details:** lives in, from (hometown), work, education, birthday (day and month), languages and relationship
  status. All optional.
- **A setting per detail:** Everyone on Howdy, Friends, or Only me.
- **Edited on the profile itself** (the Details card's "Add details" / "Edit details"), not in Settings.
- **The tick line** sits in the same card: "Howdy team" (blue Verified) or "Trusted member" (gold), with what it means.

## Decisions

1. **One table, `profile_details`** (migration 0041): one row per person, made on first save, deleted with the account
   (`on delete cascade`). Each detail has its own audience column (`members` / `posse` / `only_me`, default `posse`).
   The database enforces what the app does: lengths (60), no control characters, birthday day and month together and
   in range, the relationship and audience lists.
2. **The audience is decided when the profile is read** (`detailsForViewer`), never stored as "who saw it": the owner
   sees everything (with each audience); anyone else must be signed in, "posse" details need a friendship now, and
   "only_me" are never shown. Parting ways or a block takes them away at once; a block hides even "Everyone on Howdy"
   details (the profile page already stops blocked people; this checks again). "Everyone on Howdy" never reaches
   signed-out visitors, even on a profile open to everyone.
3. **The birthday has no year**, so it can never reveal an age (Howdy is 18+, and an age is more than people need to
   share). 29 February is allowed.
4. **Screened like every public line** (`src/shared/validation/details.ts`): normalised, no links, no characters that
   can disguise text; empty clears a detail. Unknown keys are dropped and there is no id in the request, so a person can
   only ever change their own.
5. **Only the owner sees audiences.** Other viewers get the words only, so nobody learns that something is hidden from
   them.
6. **In the data export** (`porch.details`): every detail and its audience.
7. The app's database login needs nothing new: it is granted every future table by default (`db/roles/app-role.ts`).
