# ADR-031 — One photo on a Post Card

Status: accepted (2026-09-30). Extends ADR-015 (Portraits and object storage).

Decisions taken with you (2026-09-30): **one photo per card**; on your own Fence anyone may add one, on **someone
else's Fence only their Pals**; **no automatic image checks yet** (reports and removal, as for Portraits).

## Decisions

1. **The same pipeline as a Portrait.** The browser asks `POST /api/me/card-photo` for a signed URL, sends the file
   straight to storage, then `PUT /api/me/card-photo`: the server reads the bytes back, decodes them and re-encodes a
   WebP — the whole picture fitted inside 1280 px, never enlarged, the phone's rotation applied, EXIF and anything
   hidden dropped. The raw upload is deleted. Accepted: JPEG, PNG, WebP, at most 5 MB, at most 24 megapixels.
2. **Waiting, then nailed.** A finished photo sits on no card (`media.card_id` null). `postCard(..., photoId)` inserts the
   card and attaches the photo **in one transaction**, only if it is MY finished `card_photo`, on no card yet, and
   younger than 55 minutes (the clean-up takes unattached ones at 60, so the two can never race). Anything else is a
   422 and no card is made. One photo per card is enforced by a unique index.
3. **Pals-only on someone else's Fence.** A photo on another person's Fence needs a Pal (`POSSE` / `CLOSE_POSSE`) —
   words alone keep following the Fence's own posting rule. `FencePage.canAddPhoto` tells the composer whether to offer
   the button; the server decides again.
4. **Seen exactly by who sees the card.** `GET /api/cards/:id/photo` serves only through `fence.cardPhotoFor`, the same
   rules as the card's words: the Fence readable to the viewer (a Fence is only as open as its Porch; signed-out
   visitors only where both are "everyone"), a waiting card only to its writer and the owner, never from a writer the
   viewer blocked or muted, never from an inactive writer. Missing, hidden and "no photo" are the same 404. `no-cache` +
   ETag, and 304 only after re-checking, so losing access stops the photo at the next request.
5. **It goes with its card.** `media.card_id` is `ON DELETE SET NULL`: whoever removes the card (writer, owner,
   moderator, the 30-day waiting clean-up, either account's deletion), the photo stops being served at once, and
   `purgeDetachedCardPhotos` (daily job) deletes the file, object first then row. Account deletion also removes a
   writer's photos directly (`deleteAllMediaFor`).
6. **Moderators see it.** A reported card with a photo shows it in the queue (`cardHasPhoto`, moderator-only
   `GET /api/moderation/reports/:id/card-photo`); "Remove card" removes the photo with it. There is no photo
   snapshot in the evidence: a removed card's photo is gone.
7. **Found along the way:** starting a Portrait upload used to discard ANY unfinished upload of the person; it now only
   discards an unfinished Portrait, so it cannot wipe a card photo mid-way (tested).

## Not in this slice

Several photos per card; photos on replies, Whispers or Tributes; automatic image checks; resizing into several
sizes for different screens.

## Verification

`tests/security/card-photos.test.ts` (13), e2e `card-photos.spec.ts` (a 320 px phone: choose, preview, nail, see it,
no hidden data). Mutation run `.dev/mutate20.mjs` — which now type-checks every mutant first, so a mutant that does not
compile is reported as INVALID instead of "caught": 13 of 13 caught. Migration `0025`. Privacy 1.5.0.
