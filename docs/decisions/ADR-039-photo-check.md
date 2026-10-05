# ADR-039 — The photo check (image moderation)

Status: accepted (2026-10-05). You chose OpenAI's moderation model and "hold for a moderator"; this replaces the
earlier "no image checks for now". Inert until `OPENAI_API_KEY` is set (`.env.local` and Vercel).

## Context

Portraits (ADR-015) and Post Card photos (ADR-031) are re-encoded on our server, but nothing looked at what they
show: a bad photo was visible until someone reported it.

## Decision

1. **Where:** after we decode and re-encode an upload (`media.completePortrait` / `completeCardPhoto`), before it is
   stored as ready. The check is shown a ≤ 512 px JPEG made from OUR pixels — never the upload, never a name or id.
2. **Who:** OpenAI `omni-moderation-latest` over plain fetch (`src/platform/photo-check.ts`). Free; OpenAI keeps
   nothing from `/v1/moderations` and does not train on API data. For images it judges only `sexual`, `violence`,
   `violence/graphic` and `self-harm*`. **It cannot judge `sexual/minors` from a picture** (text-only), so the app makes
   no claim to catch child sexual abuse material.
3. **What happens:**
   - `sexual` or `violence/graphic` ≥ 0.9 → **refused**: the upload is discarded, the person is told the photo can't
     be used. An earlier Portrait stays.
   - anything else flagged, or the check failing / timing out (8 s) → **held**: stored with `media.held = true`, shown
     to its owner as normal and to nobody else (initials instead of a Portrait; a card without its photo), and a
     report with no reporter (`reports.source = 'photo_check'`, subject `portrait` or `card_photo`) joins the queue.
     The owner is not told. Such reports never count towards auto-hold (ADR-024 counts distinct reporters).
   - nothing flagged → as before.
4. **Moderators:** "Dismiss" releases the hold (everyone who may see it now can); "Remove photo" retires it (a card
   keeps its words). Audit: `report_dismissed`, `portrait_removed`, `card_photo_removed`.
5. **Every photo read names its viewer** (`PhotoViewer`: a user id, or `'moderator'`), so a held photo cannot leak
   through a path that forgot to filter — the media module itself refuses it.
6. Privacy Policy 1.10.0 lists OpenAI and the check.

## Consequences

- A held photo is invisible to others until a moderator acts; with one moderator, that can take a while.
- If OpenAI is down, every new photo is held (safe, but noisy). Watch `photo_check.failed` in the logs.
- CSAM: the check does not cover it. Options if it becomes a concern: Cloudflare's CSAM Scanning Tool (needs photos
  served through a Cloudflare-proxied hostname), or PhotoDNA (application required).

## Tests

`tests/security/photo-check.test.ts` — refuse, hold, who sees a held photo (owner, others, signed out, moderator,
lists, the report route), the queue item, Dismiss, Remove, no auto-hold, the verdict thresholds. Mutation-checked:
showing held photos to all (media and Fence), dropping the owner's exemption, never holding, ignoring "refuse",
Dismiss not releasing, and no queue report each make a test fail.
