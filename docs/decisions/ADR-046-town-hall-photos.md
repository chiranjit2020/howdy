# ADR-046 — A photo on a Town Hall post

**Context.** Post Cards have carried one photo since ADR-031, checked automatically since ADR-039. Town Hall posts
(ADR-033) were words only ("no photos" was the user's call at the time). With Town Halls now real communities, the
user asked for photos there next (2026-10-07), following the Post Card design.

**Decision.** **One photo per Town Hall post**, any member, through exactly the same pipeline, limits and automatic
check as a Post Card photo. Replies stay words only.

## How it works
- **One pipeline.** The browser uploads through the existing `/api/me/card-photo` (signed URL, then the server decodes
  and re-encodes a WebP at most 1280 px, EXIF dropped, the photo check run). A finished photo waits on nothing; it can
  then be nailed to a card **or** posted in a Town Hall — never both.
- **`media.hall_post_id`** (new; `ON DELETE SET NULL`, like `card_id`), with checks `card_id is null or hall_post_id is
  null` and "only a `card_photo`", and a unique index (one photo per post). Migration `0038_hall_post_photos`.
- **Posting.** `createPost(…, photoId)` inserts the post and attaches the photo in one transaction, only if it is MY
  finished photo, on no card and no other post, and younger than 55 minutes (the clean-up takes unattached ones at 60).
  Otherwise a 422 and no post. Nailing a card now also refuses a photo already posted in a Town Hall.
- **Seen exactly by who sees the post.** `GET /api/hall-posts/:id/photo` serves only through `hallPostPhotoFor` — the
  same `loadPost` rule as the words (an active member; published, or my own, or I am staff; the writer not hidden from
  me) — and a photo the photo check is holding only to its owner. Missing, hidden and "no photo" are one 404.
  `no-cache` + ETag, re-checked before any 304, so leaving or being banned stops it at the next request.
- **Held posts.** Staff see a held post's photo in the held tray to judge it (unless the photo check holds the photo).
- **It goes with its post.** Removing the post (writer, staff, moderator, the 30-day held clean-up, either account)
  sets `hall_post_id` to null: the photo stops being served at once, and `purgeDetachedCardPhotos` (now: on no card AND
  no post) deletes the file.
- **Moderators** see the photo on a reported Town Hall post in the queue (`cardHasPhoto` now covers posts; the existing
  moderator photo route answers for `hall_post` reports too).
- **Download my data** includes the photos on my own Town Hall posts.
- Screen-reader text says "post" for a Town Hall post's photo, "card" for a card's. Privacy Policy 1.17.0 (no
  re-acceptance); the welcome page mentions photos in Town Halls.

## Alternatives considered
- **A separate `hall_photo` media kind and upload route** — duplicate code for identical rules; one kind with two
  possible homes keeps the pipeline and the photo check in one place.
- **Photos on replies too** — more to moderate, little gain; cards don't have them either.

## Consequences / known limits
- The name `card_photo` / `/api/me/card-photo` now also covers Town Hall photos (kept to avoid churn).
- Opened Time Capsules (ADR-043) never carry photos.
