# Howdy Build Status

_Last updated: 2026-09-22_

## Current Phase

Phase 9 — Media / Portrait (**complete**, scope: Portrait only). Next: **Tributes + Marks** (the master prompt's Phase 9; Signals already exist from the Ranch phase), then Town Halls. Photos on Post Cards, image moderation and account deletion are the open Media follow-ups.

## Status

| Phase | State |
| --- | --- |
| 0 — Repository, architecture, security foundation | DONE |
| 1 — Design system | DONE |
| 2 — Authentication + sessions | DONE (needs a real mail provider + Neon DB before any deploy) |
| 3 — User / Profile / Ranch | DONE (retention job not yet scheduled) |
| 4 — Relationships / Posse | DONE |
| 5 — Fence + Post Cards + Yo | DONE |
| 6 — Notifications / Chimes | DONE |
| 7 — Whispers + WebSockets | DONE |
| 8 — Tracks + Shadow Walk | DONE |
| 9 — Media / Portrait | DONE (Portrait only; not yet exercised against a real R2 bucket) |

## Completed in Phase 9

Decisions taken with you: **Cloudflare R2 through the S3 protocol** (AWS S3 is a config change) and **Portrait (profile photo) only**. ADR-015.

- [x] **Schema + migration `0009_media`:** `media` (owner, kind, status pending / ready / retired, random object key, content type, size, width, height);
      a partial unique index allows one `ready` Portrait per person; cascades with the user (files do not: see DATA_LIFECYCLE).
- [x] **`platform/storage`:** `ObjectStore` interface with a local-folder driver (development, tests) and an R2 driver (`@aws-sdk/client-s3`, presigned PUT that
      signs the content type AND exact length, 300 s); server-made keys only (path tricks refused); signed short-lived upload tokens for the local driver.
      Production refuses the local driver unless `ENABLE_TEST_STORAGE=1`. CSP `connect-src` gains only the R2 origin.
- [x] **`media` module** (depends on no other module): start upload → finish (read back, size check, **decode with sharp, crop square, re-encode to 512×512 WebP**,
      EXIF / location dropped, rotation applied, first frame only, JPEG / PNG / WebP only, 5 MB and 24-megapixel limits) → replace / remove; retention job
      `purgeStaleMedia` (in `pnpm jobs:purge`); `deleteAllMediaFor` for the future account-deletion flow.
- [x] **API:** `POST/PUT/DELETE /api/me/portrait`, `PUT /api/media/local/[token]` (local driver only), `GET /api/portraits/[handle]` (same rule as opening the Ranch;
      one identical 404 for missing / hidden / blocked / suspended / signed-out / no photo; `private, no-cache` + ETag, 304 only after access is re-checked).
- [x] **UI:** Workshop "Portrait" card (choose / replace / remove, live preview, errors), photo in the top-bar avatar and the Ranch header for people who may open it.
- [x] **Limits:** 10 upload starts and 20 finishes per person per hour, 600 photo reads per minute; a person has at most one unfinished upload.

Also this phase (UI redesign from your mockups, before Media): sign-in pages, app shell (top bar + sidebar / bottom tabs), Ranch profile page, clay artwork
replacing emoji, loader / bird / palette / shadow tokens, sign-in and shell pages fixed to Daylight (`:root:has(.daylight-only)`).

## Completed in Phase 8

- [x] **Schema + migration `0008_tracks`:** `tracks` (one row per owner/visitor pair: two ids and a `date` — no time of day, no count, no address),
      `profiles.shadow_walk`. CHECK not-self; cascade with either person.
- [x] **`tracks` module** (`profiles`, `relationships` → `tracks`): `recordVisit` (idempotent, at most one write per pair per day), `listTracks`
      (rules applied at READ time), `purgeOldTracks`, `bucketOf`.
- [x] **Domain event `ranch.visited`**, emitted by `profiles` only after the policy allowed a signed-in person to open someone else's Ranch;
      handled after the response, so the visitor's page never depends on it.
- [x] **Rules:** Posse visitors named (while the Posse lasts), everyone else a per-bucket count with no clues; muted / blocked / inactive people
      not shown or counted; only Today / Yesterday / This week; same-day order by call sign; cap 50; 7-day retention.
- [x] **Shadow Walk:** private flag (`PATCH /api/me/ranch`); no Track is left by a shadowed visit and your own Tracks freeze.
- [x] **API/UI:** `GET /api/me/tracks`; `/tracks` page with the Shadow Walk switch, "Your Posse dropped by", "Others" counts, frozen state;
      header "Tracks" link; `TrackItem` gained `count` and `href`. Rename `whisperPartners` → `posseMembersAmong`.
- [x] **ADR-014**; `DATA_LIFECYCLE.md` (new table, retention, Tracks privacy rules), `ARCHITECTURE.md`.

## Tests

`pnpm vitest run` → **52 files / 822 tests ✔** (unit, UI, database and security). `pnpm e2e` → **59 Playwright tests ✔** (58 earlier + 1 Portrait), production build, real CSP,
real WebSocket process. `pnpm lint` is clean.

Phase 9 added: 40 database / security tests (tests/security/media.test.ts), 13 storage-driver tests (R2 signing, tokens, key safety), 7 image-processing tests (orientation
checked by pixel colour, EXIF gone, pixel-bomb refused), 4 streaming body-cap tests, env / CSP / boundary tests, and the Portrait browser test.

**Mutation check** (`.dev/mutate10.mjs`): 29 protections removed one at a time; **28 caught**. The body size cap first ESCAPED (the size-mismatch check hid it), so it got its own
test and is now caught. The one uncaught mutant is equivalent: the S3 signer signs `content-length` by itself, with or without our explicit header list.

(Phase 8, for reference.) `pnpm check` then → 47 files / 749 tests ✔; `pnpm e2e` → 58 Playwright tests ✔.

New this phase (22 + e2e): the coarse "when"; the row holds only two ids and a DATE (checked against the catalogue); a day's repeats do not even
rewrite the row (row version unchanged); a later day moves the date; nothing recorded for yourself / signed-out / a Ranch you cannot open / a
missing person / suspended owner / a blocked pair (also when the recorder is called directly) / Shadow Walk (and the visitor's response is
byte-identical); a failing listener changes nothing; lists and other pages leave no Track; who is named follows the Posse *now*; muted / blocked
vanish (not even counted); inactive accounts; days and order; cap of 50; frozen while on Shadow Walk and back off; the flag is private and
validated; limits and 401; only incoming Tracks; retention; DB constraints; cascade; lint boundaries; e2e in real browsers (named friend, hidden
count without the stranger's handle anywhere on the page, no time of day, lists do not count as visits, Shadow Walk both ways, block/mute,
axe light+dark incl. the frozen state, 320 px, 44 px).

**Mutation check** (`.dev/mutate9.mjs`): 15 protections removed one at a time (Shadow Walk visitors, self visits, blocked ingest, inactive
accounts, dedupe, date advance, Posse gate, muted/blocked shown, freeze, arrival order, cap, old Tracks shown, retention, read limit, visit
announced before the policy allows the view). **Two initially ESCAPED** (self visits, inactive accounts — the database constraint / other
layers covered for them); direct tests of the recorder now catch both. All 15 caught.

## Failures encountered and fixed (Phase 9)

| Failure | Cause | Fix | Verification |
| --- | --- | --- | --- |
| Two racing "finish" requests could delete the live Portrait | A stale clean-up removed a row that another request had just made live | Clean-up only deletes `pending` / `retired` rows; the loser answers 404 | race test + mutation |
| A raw upload could be left in storage with no row pointing at it | The best-effort delete after going live could fail | The raw upload gets its own `retired` row in the same transaction | failure-injection test + mutation |
| Body size cap not proven | The size-mismatch check hid it | Direct stream test: stops reading, ignores a lying length header | mutation |
| CSP violations on every page in production (`style-src-attr blocked inline`) | `next/image` writes an inline `style` that our CSP forbids; only a production build shows it | One plain `<img>` component (`ui/art/img.tsx`) for the logo, artwork, avatars | e2e |
| Hidden / blocked Ranch and Whisper answered 200, not 404 | The `loading.tsx` screens I added make Next stream a 200 before it knows the page is missing | Removed the two `loading.tsx` files (the loader is still used by `LoadingState`) | e2e |
| Top-bar logo and avatar links only 35 px tall | Inline images shorter than a 44 px touch target | `min-h-11` / `size-11` on those links; "View all" in the Posse card too | e2e (6 layout checks) |
| Signal text and expiry split into two paragraphs | New Signal card layout | One paragraph | e2e |

## Failures encountered and fixed (Phase 8)

| Failure | Cause | Fix | Verification |
| --- | --- | --- | --- |
| Every date query failed | Postgres read `date - $1` (untyped parameter) as `date - date` | Inline the constant retention window as a literal | tests |
| Two mutations escaped | Other layers (DB check, Ranch policy) masked the missing guard | Test the recorder directly | mutation |
| `h3` right after the page `h1` in the empty/frozen state | `EmptyState` defaults to `h3` | `as="h2"` | e2e axe |
| Long call sign overflowed at 320 px | Handle line could not wrap | `overflow-wrap:anywhere` | e2e overflow check |
| Mutation pattern not found after Prettier reflowed a line | Matched the formatted source | Shorter pattern | mutation |

## Blockers / Open questions

1. **Mail provider (deploy blocker)** — unchanged.
2. **Neon dev branch** — still none; local Postgres used. Two processes hold DB pools (site + realtime).
3. **First commit** — not made (not requested).
4. **Schedule `pnpm jobs:purge`** (now also drops Tracks past 7 days and abandoned uploads / leftover files) and decide the audit-log retention period.
6. **Cloudflare R2 (deploy blocker for photos):** create a private bucket, an Object Read & Write API token for it, and a bucket CORS rule allowing `PUT` from `APP_URL`; set `STORAGE_DRIVER=r2` and the four `R2_*` variables (see `.env.example`). The R2 driver is tested against a fake client only.
5. **Deploying `pnpm ws`** (see ADR-013): long-lived Node process, `NODE_ENV=production`, `WS_PUBLIC_URL=wss://<same host as the site>`, Redis.

## Known Issues / Deferred

- Posse members always see each other's visits unless the visitor chose Shadow Walk (disclosed on the page). A person with few non-Posse
  visitors may guess who a hidden one was from what they know.
- No Tracks digest / push, Guess Who, reveal tokens or cohort clues; no "who I visited".
- The header now has seven links (wraps on phones).
- Earlier deferrals still stand (restricted Whispers tray, non-Posse Whispers, no MFA/passkeys, account deletion designed not built,
  fixed-window limiter, placeholder icons, e2e needs local Edge, no visual baselines, master prompt §49–50 items).

## Next Task

**Tributes + Marks** (master prompt §61, "Phase 9": Tributes + Marks + Signals; Signals are already built), then Town Halls (§61 Phase 10). The design kit has \`TributeCard\` and
the Mark names (Chill / Pure / Gem / Cinema) from your profile mockup, but there is no backend for either yet. Media follow-ups to schedule: photos on Post Cards (per-card media with the Fence's privacy rules), showing Portraits in lists / cards / Chimes
(needs a per-viewer decision per row), reporting a photo (Phase 11), image moderation, and the account-deletion flow calling `deleteAllMediaFor`.

## Architectural Decisions

ADR-001 … ADR-015 in `docs/decisions/`; lifecycle and deletion design in `docs/DATA_LIFECYCLE.md`.

