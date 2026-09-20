# Howdy Build Status

_Last updated: 2026-09-20_

## Current Phase

Phase 8 — Tracks + Shadow Walk (**complete**). Next: Phase 9 — Media / Portrait (photo upload).

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
| 9 — Media / Portrait | NOT STARTED |

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

`pnpm check` → format ✔ lint ✔ typecheck ✔ **47 files / 749 tests ✔** production build ✔.
`pnpm e2e` → **58 Playwright tests ✔** (12 design kit + 10 auth + 6 Ranch + 8 relationships + 5 Fence + 5 Chimes + 7 Whispers + 5 Tracks), production
build, real CSP, real WebSocket process, Edge.

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
4. **Schedule `pnpm jobs:purge`** (now also drops Tracks past 7 days) and decide the audit-log retention period.
5. **Deploying `pnpm ws`** (see ADR-013): long-lived Node process, `NODE_ENV=production`, `WS_PUBLIC_URL=wss://<same host as the site>`, Redis.

## Known Issues / Deferred

- Posse members always see each other's visits unless the visitor chose Shadow Walk (disclosed on the page). A person with few non-Posse
  visitors may guess who a hidden one was from what they know.
- No Tracks digest / push, Guess Who, reveal tokens or cohort clues; no "who I visited".
- The header now has seven links (wraps on phones).
- Earlier deferrals still stand (restricted Whispers tray, non-Posse Whispers, no MFA/passkeys, account deletion designed not built,
  fixed-window limiter, placeholder icons, e2e needs local Edge, no visual baselines, master prompt §49–50 items).

## Next Task

**Phase 9 — Media / Portrait:** photo Portraits (replacing the palette tint) with the signed-upload pattern fixed in ARCHITECTURE §8: storage choice
decided at this point (R2 vs S3 vs Cloudinary — needs a decision from you; local dev can use a filesystem adapter), client → storage direct upload
with server-issued, short-lived, size- and type-limited signed URLs, server-side verification of type/size/dimensions and re-encoding (strip EXIF /
location, no SVG), private-by-default visibility that follows the Ranch, per-user quotas and upload rate limits, object deletion *before* rows
(DATA_LIFECYCLE §2), the new table's deletion behaviour written first, and moderation hooks (report an image).

## Architectural Decisions

ADR-001 … ADR-014 in `docs/decisions/`; lifecycle and deletion design in `docs/DATA_LIFECYCLE.md`.

