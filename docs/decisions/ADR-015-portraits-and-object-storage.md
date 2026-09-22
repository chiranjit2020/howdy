# ADR-015 — Portraits (profile photos) and object storage

Status: accepted (Phase 9). Resolves the open item in ARCHITECTURE ("object storage choice: R2 vs S3 vs Cloudinary is decided at Media
time; the signed-upload pattern is fixed").

## Context

A photo is user-supplied binary content: the biggest untrusted-input surface Howdy has taken on so far, and it shows a face. The master
prompt (§45) fixes the shape — signed upload URL → object storage → processing → CDN — and says media processing must stay isolated
from core request handling. The scope decided for this phase is **Portrait (avatar) only**; photos on Post Cards come later.

## Decisions

1. **Cloudflare R2, spoken through the S3 protocol** (`@aws-sdk/client-s3`, path-style, region `auto`). No egress fees, and because the
   code only uses put / get / head / delete / presigned PUT, AWS S3 or any S3-compatible store is a configuration change. Cloudinary was
   rejected: a different, vendor-specific API that cannot be swapped cheaply. The store sits behind a small `ObjectStore` interface
   (`src/platform/storage`), with a **local-folder driver** for development and tests so no account is needed to build or test.
   **Production refuses the local driver** (files on one disk do not survive a redeploy) unless the end-to-end test flag is set.
2. **The bucket stays private and there is no public CDN.** Browsers only ever get a **signed URL to upload**; every photo is read back
   by the server and **served by the app**, which applies the Ranch's visibility rules first. A public bucket URL would ignore
   blocks, Posse-only Ranches and account suspension forever once it had been seen.
3. **Signed upload, then a server-side "finish".** `POST /api/me/portrait` (type + size) → a URL that is valid for 5 minutes and signs
   the **content type and the exact byte length**, so it cannot be reused for a bigger or different file → the browser PUTs the file
   straight to storage → `PUT /api/me/portrait` makes the server read it back, **decode, crop and re-encode** it, and only then go live.
   `DELETE` removes it. There is no user id in any of these requests: the target is always the signed-in person.
4. **Only our own re-encoded output is ever stored or served: a 512×512 WebP.** Decoding and re-encoding is the real security control:
   whatever the file claimed to be or hid (script in an SVG, an HTML/JPEG polyglot, trailing bytes) does not survive, and EXIF
   (location, camera, copyright) is dropped after applying the phone's rotation flag. The client's claimed type is never trusted:
   the bytes are inspected and only JPEG / PNG / WebP are accepted (no SVG, GIF, TIFF, HEIC). Limits: 5 MB, 24 megapixels (a "pixel
   bomb" is small on disk and huge in memory), first frame only. Every unusable file gets **one** generic error.
5. **Processing runs inside the request, bounded** (size, pixels, one image, tens of milliseconds with `sharp`). The plan asks for it to
   be isolated from core request handling; the isolation here is the module boundary and hard limits, not a queue. If it ever shows up
   in latency or an abuse pattern, `completePortrait` is the single function to move to a worker.
6. **Who may see a photo = who may open that Ranch**, decided when it is requested (`mayViewRanch`, the same policy as the Ranch
   page). A missing person, a hidden Ranch, a blocked pair, a suspended account, a signed-out visitor and "no photo" all give the
   **same 404**, so this cannot be used to learn who exists or who has a photo. The response is `private, no-cache` with an ETag: a
   browser may keep the bytes but must ask again, and a 304 is only answered **after** access is re-checked, so a block takes the
   photo away on the next request even from a cached copy. A per-person read limit is spent before the handle is looked up.
7. **Data model** (`media`, migration 0009): one row per file with a random object key (says nothing about the owner) and a status:
   `pending` (URL issued, nothing trusted), `ready` (served) or `retired` (replaced/removed, being deleted). A partial unique index
   allows **one `ready` Portrait per person** — enforced by the database. A person has at most one unfinished upload.
8. **Deleting is objects-first, then rows** (DATA_LIFECYCLE), and never breaks the request that triggered it: if storage hiccups, the row
   stays `retired` and `pnpm jobs:purge` finishes it. The raw upload gets its own `retired` row in the same transaction that makes the
   new photo live, so a failed delete can never leave a file that nothing points at. A cleanup can only delete `pending`/`retired`
   rows, so a stale cleanup can never remove someone's live Portrait (found while reasoning about two racing "finish" requests).
   Unfinished uploads are removed after 60 minutes. **Account deletion must call `deleteAllMediaFor(userId)` before the user row goes**
   (rows cascade; files do not): the deletion flow is not built yet, so this is recorded in DATA_LIFECYCLE.
9. **Limits (fail closed):** 10 upload starts and 20 finishes per person per hour, 600 photo reads per minute.
10. **CSP:** `connect-src` gains exactly one origin, the R2 endpoint (`https://<account>.r2.cloudflarestorage.com`), only when the R2
    driver is configured; nothing else changes and photos are same-origin images.

## Consequences

- The bucket needs a **CORS rule allowing `PUT` from `APP_URL`** (documented in `.env.example`). This was **not exercised against a real
  R2 bucket**: the signing is unit-tested (the URL signs type and length, expires in 300 s, never contains the secret; commands and
  "not found" handling against a fake client), but the first real upload happens when credentials exist.
- Photos show on your own avatar (top bar, Workshop) and on the Ranch header for people allowed to open it. Lists, Post Cards, Chimes
  and Whispers still show the coloured initials: showing a photo there needs a per-viewer decision for every row and is a follow-up.
- No image moderation (nudity/violence detection) and no reporting of a photo yet; the report flow (Phase 11) should learn a `portrait` subject.
- Portraits are visible only to signed-in people, even for a Ranch that is open to everyone.

## Not in this phase

Photos on Post Cards, video, a crop/zoom editor in the browser, a CDN, image moderation, per-list avatars, the account-deletion flow.
