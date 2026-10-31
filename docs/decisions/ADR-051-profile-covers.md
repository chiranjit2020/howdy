# ADR-051 — Profile covers: Howdy's own covers, or your own photo

Status: accepted (2026-11-01). Asked for by you: work on the cover photo in the profile card.

## Decisions taken with you (2026-11-01)

- **Both:** pick one of Howdy's covers, or upload your own photo.
- **Changed on the profile itself** ("Change cover" on the cover), like the rest of the profile card.

## Decisions

1. **Six Howdy covers** (`COVER_PRESETS`): the illustrated porch (everyone's default) and five palette gradients
   (Sunflower, Dusk, Meadow, Lilac, Sunrise), drawn with whole Tailwind class names (no inline styles: the CSP forbids
   them). Stored as `profiles.cover_preset` (null = porch); the database checks the list. It is public presentation, like
   the initials colour, so it is part of the profile everyone allowed to open it receives.
2. **A cover photo is a Portrait with a different crop.** The same three steps (ask, send straight to storage, finish),
   the same decode-and-re-encode control (only pixels survive; EXIF, location and anything hidden are dropped), the same
   size limit and types, its own folder (`covers/`) and a 1600x560 centre crop. One live cover per person, enforced by
   the database (`media_one_ready_per_owner_idx` now covers `portrait` and `cover`). The media service runs both
   through one set of functions (`ProfilePhotoKind`); the Portrait's API is unchanged.
3. **Who may see it: exactly the Portrait's rule.** `/api/covers/[handle]` serves it only to signed-in people who may open
   that profile; every "no" (missing person, hidden profile, block, no cover, signed out) is the same 404. A viewer who
   cannot see the photo sees the Howdy cover instead.
4. **The photo check refuses, never holds, a cover.** A held Portrait or card photo waits for a moderator; a cover is
   optional and Howdy's covers are always there, so a photo the check would hold is simply refused ("choose a different
   one"). This also means moderation needs no new kind of subject. Reporting a cover by itself is a possible follow-up;
   until then a report about the person covers it.
5. **A photo always wins over a Howdy cover**, so picking a Howdy cover while you have a photo removes the photo: what you
   picked is what shows.
6. **Gone with the account** (`deleteAllMediaFor` takes every kind) and **in the data export** (`photos/cover.webp`,
   `porch.cover`).
7. Migration 0042: the media kind list, the one-live index, `profiles.cover_preset` and its check.
