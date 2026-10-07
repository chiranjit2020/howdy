# ADR-047 — Stories

**Context.** Howdy had photos on Post Cards (ADR-031) and Town Hall posts (ADR-046), both kept until removed. The user
asked for Stories next (2026-10-07): a photo that is gone after a while, the light-weight way to share a moment with
Pals. Choices taken with the user: **photo only, 12 hours**; audience **Pals, or Close Pals only, chosen per Story**
(like the Porch Light, ADR-032); the viewer list is **reciprocal** — one Workshop switch, on by default — and a
restricted person is never shown in it; **react** (the five Post Card kinds) and **"Reply"** opens a Whisper quoting the
Story; an optional caption of at most 80 characters.

**Decision.** A `stories` row with one `card_photo` attached (`media.story_id`), read through the same reach rule as
the Porch Light, deleted with everything that hangs off it once its 12 hours are up.

## How it works
- **Tables** (migration `0039_stories`): `stories` (author, `audience` pals|close, caption ≤ 80, `expires_at` checked
  to be within 12 hours of `created_at`), `story_views` and `story_reactions` (one per person per Story; cascade with
  the Story). `profiles.story_views` (default on). `media.story_id` (`ON DELETE SET NULL`, unique, card photos only);
  the old "card or hall post" check became `media_one_home`: at most one of `card_id`, `hall_post_id`, `story_id`.
  Chime type `story_reacted`.
- **Posting.** `POST /api/stories` with a photo from the existing `/api/me/card-photo` pipeline (re-encoded WebP,
  EXIF dropped, the photo check). The Story and the photo are joined in one transaction, only for MY finished photo on
  no card, post or other Story and under 55 minutes old — else 422 and no Story. Cards and Town Hall posts now refuse a
  Story's photo too. At most 10 live Stories per person; the first-week budget for cards applies; 20 a day.
- **Who sees it** is decided at every read, never stored: `palsReaching` (a Pal now; no block either way; the author
  has not restricted me; I have not muted the author), the author's account active, and for a Close-only Story the
  author marks me Close now. A held photo (photo check) is seen by its owner only. Ring (`GET /api/stories`), list
  (`GET /api/porch/:handle/stories`) and photo (`GET /api/stories/:id/photo`, `no-cache` + ETag re-checked before a
  304) all use the one rule; anything else is the same 404. A viewer is never told the audience.
- **Views.** Opening someone's Story records a view (so my rings know what I have seen). The author sees who viewed
  only while **both** have Story views on (`viewers` is `null` when the author's switch is off, so the UI can say why);
  a viewer with it off is simply not listed. Anyone the author has blocked or restricted is never listed, even for an
  earlier view or reaction (`relationships.limitedAmong`), and nor is anyone hidden from the author.
- **Reactions** are always shown to the author (they are a message, not a trace). The first reaction from a person
  rings a person-shaped Chime ("X reacted to your Story", bumping, no card); changing the kind rings nothing; taking it
  back deletes it. Not on my own Story; not on one I cannot see (404).
- **Reply** links to `/whispers/:handle?draft=…`: the thread page pre-fills my box with "Replying to your Story (“…”): ".
  Nothing is sent until I send it; the usual Whisper rules (Pals, no block) apply.
- **Gone.** Past `expires_at` nothing serves it. The daily purge (`purgeExpiredStories`, before
  `purgeDetachedCardPhotos`) deletes the rows (views and reactions cascade); the photo's `story_id` goes to null and the
  same run deletes the file. The author can take a Story down at once (`DELETE /api/stories/:id`, anyone else 404).
- **Flagging.** `POST /api/reports/story/:id`, only by someone who may see it (not the author): a `card_photo` report
  on that exact photo with the caption as evidence, so the existing queue, moderator photo view and "remove card
  photo" action apply; a removed photo ends the Story.
- **Download my data** lists my live Stories with their photos, and my Story views setting.
- Home shows a ring of Stories (mine first, then Pals with new ones); the Workshop has the "Story views" switch.
  Privacy Policy 1.18.0 (no re-acceptance); the welcome page lists Stories.

## Alternatives considered
- **24 hours** (the common default) — the user chose 12, matching the Signal.
- **One-way viewer lists** (author always sees) — the user chose reciprocal, like "Seen" on Whispers (ADR-021).
- **Not recording views when the viewer's switch is off** — then their own rings could not show what they have seen;
  the row is kept for the 12 hours and only its *showing* depends on the switches.
- **A separate media kind** — same reasoning as ADR-046: one pipeline and one photo check.

## Consequences / known limits
- `card_photo` / `/api/me/card-photo` now also mean Story photos (kept to avoid churn).
- A view stays recorded if someone leaves Pals; it is just no longer listed if the author restricts or blocks them.
- Expiry is exact for reads; rows linger up to a day until the purge, unreachable.
