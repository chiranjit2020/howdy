# Howdy Build Status

_Last updated: 2026-09-27_

## Current Phase

**P0 — Legal Foundation** (ADR-019) is **complete**. It is a security/legal foundation item done ahead of Phase 11.
Phases 0–10 are complete. Next: **Phase 11 — Moderation + Anti-Abuse Expansion**. A first slice of it (the
moderation queue) was built on 2026-09-27 and is parked in `git stash` ("moderation queue (ADR-018)"), awaiting a
keep-or-drop decision. Open follow-ups: photos on Post Cards, image moderation, account deletion, a real R2 bucket CORS
rule, and e2e coverage for Tributes (Marks and Town Halls have it since 2026-09-27; see Known Issues).

Also shipped on 2026-09-27 (all live): the Vibe Matrix's five traits, Post Card reactions, a Whisper button on Pals rows
(Close Pal moved into ⋯), the Chime bell clearing when Chimes is opened, and the fixes below. Migrations `0014` and `0015`
are applied to `howdy_dev`, `howdy_prod` and the local e2e database. **Last full e2e run: 79 of 79 pass** (2026-09-27,
with the new Marks and Town Halls specs and the fixes they led to).

## Added 2026-09-27 — e2e coverage for Marks and Town Halls

- [x] `tests/e2e/marks.spec.ts`: a Pal awards a Mark, sees it counted and the 30-day wait (kept after a reload); the owner
      is told without the kind and has no picks; a non-Pal's picks are closed and the API refuses (403). Axe light/dark,
      320 px and 44 px targets.
- [x] `tests/e2e/town-halls.spec.ts`: start via the form, discover and join, invite-only hidden (404) until invited,
      invite by call sign and accept, remove a member, delete. Axe light/dark on the directory and a Town Hall, 320 px
      and 44 px targets.
- [x] `tests/ui/howdy.test.tsx`: the Vibe Matrix switches from counts to percentages at exactly 20 Marks (checked to fail
      with the threshold moved), and closed picks show their reason.
- [x] Shared e2e helpers `axeViolations(page)` and `smallTargets(page)` in `tests/e2e/helpers.ts` (older specs still
      carry their own copies).
- Found and fixed by these specs:
  - **A removed Town Hall member stayed in the owner's list** until a full reload (the list is the page's own state;
    `router.refresh()` does not reset it). The removal now updates the list too.
  - **Heading levels:** the Town Halls list went h1 → h3, and a Town Hall's own page had no h1. `TownHallCard` takes
    `headingLevel` (2 in lists, 1 on its own page); invite cards are h2.
- Also fixed: the Portrait e2e waited for **every** Portrait image to decode, including the phone tab bar's, which is
  hidden on wide screens and lazy, so it may never load (a flaky failure). It now waits only for Portraits on screen
  and still counts all three.

## Fixed 2026-09-27 — found by the e2e run (91a5b78)

- A made-up Town Hall id (`/town-halls/not-a-real-id`) reached Postgres as an invalid uuid and threw. The gate layout
  still answered 404, but **the page renders alongside its layout**, so the page's own `getTownHall` read the raw id.
  It now treats a malformed id as missing (test in `tests/security/page-gates.test.ts`). Rule: a page behind a gate
  layout must still validate its own params.
- The Portrait e2e expected 2 Portraits on your own Porch; the phone tab bar's Porch tab (0f2fc36) adds a third, present
  in the page even where it is hidden. Test updated.

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
| 9 — Tributes + Marks | DONE (Marks have e2e coverage; Tributes do not yet — see Known Issues) |
| 10 — Town Halls | DONE (directory + membership only, no shared feed; e2e coverage since 2026-09-27) |
| P0 — Legal Foundation | DONE (documents need a lawyer's review before launch — see ADR-019 "Before launch") |

## Completed in P0 — Legal Foundation (ADR-019), 2026-09-27

Decisions taken with you: operator **Chiranjit Karmakar (individual, India)**; public contact
**privacy@howdy.chiranjitkarmakar.com**; minimum age **18**; existing accounts are **asked once** on their next visit.

- [x] **Privacy Policy, Terms of Service, Campfire Rules, Cookie Policy.** Each is complete, plain-language and
      accurate to what the code does, lives in `content/legal/*.md`, and has "Needs legal review" notes where a lawyer
      must confirm something.
- [x] **Versioning** (`src/shared/legal.ts`): a displayed `version`, plus an `acceptVersion` that asks people to agree
      again only when it moves. Every page shows its version, effective date and last-updated date.
- [x] **Acceptance tracking**: migration `0013` adds `legal_acceptances` (append-only, cascades with the account, DB
      checks on document and version). Stake a Claim requires the "18 or older and I agree" box, and the versions are
      recorded in the sign-up transaction. `/agree` asks once whenever something is pending (gated in `AppFrame`), and
      the legal pages stay readable before agreeing. `GET/POST /api/me/legal`.
- [x] **Footer** on every page (in `AppShell`): Privacy · Terms · Campfire Rules · Cookies · © Howdy.
- [x] **Reading experience**: section cards, a sticky "On this page" list (xl) or a fold-out list (smaller screens)
      with the current section marked, smooth scrolling that respects reduced motion, focus moved to the chosen
      heading, a reading-progress bar, anchor links. Metadata: title, description, canonical URL, Open Graph, Twitter.
- [x] **Retention made real**: `pnpm jobs:purge` is now a daily Vercel Cron (`/api/jobs/purge`, 04:00 UTC,
      `CRON_SECRET`). The Privacy Policy's retention periods were only true for reads until now.
- [x] **Tests**: `tests/unit/legal.test.ts`, `tests/security/legal.test.ts`, `tests/e2e/legal.spec.ts` (routes,
      320/768/1440 px, keyboard, axe light and dark, the sign-up box, the `/agree` gate). Mutation run
      `.dev/mutate-legal.mjs`: 7 of 7 caught. Found and fixed along the way: a test ("duplicate sign-up cannot claim a
      handle") that had started passing for the wrong reason (a validation error) once the box became required.
- [x] Also fixed: a pre-existing lint error in `tests/e2e/helpers.ts` and Prettier drift in
      `src/app/porch/[handle]/loading.tsx`. Both made `pnpm check` fail on `main`.

## Fixed 2026-09-27 — the Chime bell kept its number after reading

The bell's count is drawn by the layout on the server, and nothing redrew it after a Chime was read in the page, so it
stayed until a full reload. Opening Chimes now reads everything it shows (`{ all: true, before: <when the page was
drawn> }`, so a Chime that rings meanwhile stays unread) and refreshes the frame; what was new stays highlighted for
that visit. "Mark all read" is gone (nothing left for it to do). Tests: `tests/security/chimes.test.ts` ("all, before"),
`tests/e2e/chimes.spec.ts` updated and passing.

## Added 2026-09-27 — Post Card reactions (ADR-011 amendment)

- [x] Yo, Laugh, Fire, Popcorn and Love on every Post Card, one per person per card (switching kind updates it). Migration
      `0015` adds `yos.kind` (default `'yo'`). It is additive, so the running code keeps working before and after it.
- [x] Counts per kind only. The Chime reads "reacted to your card" and rings once per new reaction; the preference is
      called "Reactions".
- [x] Tests: security (kinds, switching, refused kind, no names, database check, no second Chime), UI (tap, picker,
      take back, summary text), e2e fence spec updated to switch Yo → Laugh.

## Changed 2026-09-27 — the Vibe Matrix becomes five traits (ADR-016 amendment)

- [x] Marks are now **Gem / Pure / Chill / Sharp / Bold**. Cinema and Sigma are retired: migration `0014` deletes their
      rows and tightens `marks_kind_check`. Applied to `howdy_dev` and `howdy_prod` (prod had no Marks yet, so nothing
      was deleted) before the push.
- [x] Earned counts (with each Mark's meaning) until 20 Marks, then the percentage bars (`PERCENT_AFTER`).
- [x] Clay artwork for every Mark and the Post Card reactions, cut from the design sheet into `public/art/mark-*.png` and
      `react-*.png`. Yo (🤘) now uses `react-yo` everywhere, and the Mark Chime (💎) uses `mark-gem`. Laugh, Fire,
      Popcorn and Love reactions are a later phase.
- [x] `pnpm build` and the full e2e run pass; Marks have their own spec (`tests/e2e/marks.spec.ts`).
- Fixed the same day: 4 Dropdown tests failed (`window.matchMedia is not a function` in jsdom) since the "menus stay on
  screen" change. The menu now works without `matchMedia` (as the bird does), so it no longer crashes on open in
  embedded browsers that lack it.

## Fixed 2026-09-27 — hidden pages answered 200 again (the loading outlines, 07f28aa)

The loading outlines added for every page brought back the Phase 8 bug: a hidden Porch, a Whisper thread you may not
open and an invite-only Town Hall answered **200** (with a not-found page inside) instead of **404**, because once a
`loading.tsx` streams, the status is fixed. This time the outlines were kept:

- Each of those pages now has a **gate layout** (`porch/[handle]/layout.tsx`, `whispers/[handle]/layout.tsx`,
  `town-halls/[id]/layout.tsx`) that calls a check-only function (`mayViewRanchByHandle`, `mayOpenThread`,
  `mayOpenTownHall`) and `notFound()` BEFORE the outline streams. A layout renders outside its own segment's loading
  boundary. The checks have no side effects, because layouts also run for link prefetches: the Porch check records no
  visit, which is tested. Each check has its own rate-limit budget, and the pages keep their full checks.
- A parent segment's `loading.tsx` wraps its children too, so the Whispers and Town Halls **list** pages and their
  outlines moved into a `(list)` route group. The URLs are unchanged.
- Tests: `tests/security/page-gates.test.ts` (mutation run `.dev/mutate-gates.mjs`, 5 of 5 caught) and
  `tests/e2e/not-found.spec.ts`. Axe and layout loops now wait for the page to replace its outline (`pageReady`),
  because they sometimes measured the outline itself.

**Rule for new pages:** a page that can be "not found" for some viewers and has a `loading.tsx` needs a gate layout,
and no `loading.tsx` may sit above it.

## Completed in Phase 10 — Town Halls (ADR-017)

Decisions taken with you: **directory + membership only** this phase (no shared post feed yet), **any active member
may create one**, `open`/`members` both self-serve instantly and are both listed in the directory, `invite` is never
listed and needs the owner's invite plus the invitee's acceptance (2026-09-23).

- [x] **Schema + migration `0011`:** `town_halls` (owner, name, description, visibility open/members/invite; CHECK
      name 3–50 chars, description 1–280, visibility enum) and `town_hall_members` (one row per person: role
      owner/member, status active/invited; CHECK an owner row is always active; a partial unique index caps a Town
      Hall at one owner). `notifications` gained two types (`townhall_invited`, `townhall_invite_accepted`, both
      `card_id IS NULL`) and `notification_prefs` gained a `townhalls` column.
- [x] **`town-halls` module** (depends only on `profiles` — no relationships/authz dependency; membership is its own
      gate): `createTownHall` (owner + active membership in one transaction), `listDirectory` (keyset, open/members
      only, never invite-only, no member count anywhere), `listMine`, `listMyInvites`, `getTownHall` (invite-only
      hidden ≡ missing without a membership row), `listMembers` (active members only, same hidden-≡-missing rule),
      `act` (join / leave / accept / decline — one endpoint, one closed set of verbs, mirroring the Posse
      request/accept shape), `invite` (owner only, by call sign, idempotent), `removeMember`, `updateTownHall`,
      `deleteTownHall` (cascades every membership).
- [x] **API**: `GET/POST /api/town-halls`, `GET/PATCH/DELETE/POST /api/town-halls/[id]`,
      `GET /api/town-halls/[id]/members`, `DELETE /api/town-halls/[id]/members/[handle]`,
      `POST /api/town-halls/[id]/invite`, `GET /api/me/town-halls`, `GET /api/me/town-halls/invites`.
- [x] **UI**: `/town-halls` (Discover / Mine / Invites tabs, a "Start a Town Hall" form using the existing
      `TownHallCard`), `/town-halls/[id]` (join/leave/accept/decline, roster, owner-only invite form and member
      removal, delete with confirmation). New sidebar-only nav item (the phone tab bar stays at six) with an
      invite-count badge; a new `VibeMatrix`-style icon (`TownHallIcon`) and two new `ChimeItem` variants.
- [x] **Limits**: reading matches the Fence (240/min); creating 5/day; join/leave/accept/decline together 60/hour
      (spent even on a no-op repeat); inviting 30/hour per person **and** a stricter 20/hour per Town Hall (so an
      owner of several Town Halls cannot spend their whole budget on just one).

## Completed in Phase 9 — Tributes + Marks (ADR-016)

Decisions taken with you: **Posse-only** to give either one, **one Mark total per pair every 30 days** (any kind), **exactly
one pinned Tribute** at a time (2026-09-22).

- [x] **Schema + migration `0010`:** `tributes` (owner, author, body, status pending/published, pinned; CHECK not-self,
      CHECK pinned-only-if-published, one pinned per owner via a partial unique index) and `marks` (rater, target, kind;
      CHECK not-self, CHECK kind in the five names; an append-only log, no retention). `notifications` gained three types
      (`tribute_waiting`, `tribute_approved`, `mark_given`, all `card_id IS NULL`) and `notification_prefs` gained a
      `tributes` column (covers both).
- [x] **`tributes` module**: `giveTribute` (Posse gate via `authz.can('tribute:give', …)`, always `pending` — no fast
      path), `listTributes` (keyset, pinned leads, a stranger sees only published, the author also sees their own pending),
      `approveTribute` / `setTributePinned` / `removeTribute` (owner and/or author only), `listWaitingTributes` (merged
      into the existing Fence waiting queue), `purgeStaleTributes` (30 days, in `pnpm jobs:purge`).
- [x] **`marks` module**: `getVibeMatrix` (aggregate count per kind — Gem/Pure/Chill/Sharp/Bold since migration 0014; originally Chill/Pure/Cinema/Sigma/Gem — for a target; visible
      wherever the Ranch is), `giveMark` (Posse gate; the 30-day cooldown is checked and enforced in one atomic
      `insert … where not exists (…)` statement so two racing requests cannot both slip through).
- [x] **`authz` policy**: `tribute:give` / `mark:give` share `whisper:exchange`'s shape (mutual Posse, no block, not
      yourself); viewing either follows the Ranch's own `profile:view` visibility, same as the Fence.
- [x] **API**: `GET/POST /api/ranch/[handle]/tributes`, `DELETE/PATCH /api/tributes/[id]`,
      `POST /api/tributes/[id]/approve`, `GET /api/me/tributes/waiting`, `GET/POST /api/ranch/[handle]/marks`.
- [x] **UI**: `TributesSection` (composer, pinned-leading list, pin/unpin, take-down, pagination) and `VibeMatrixSection`
      (aggregate bars + a five-way "award a Mark" picker with a cooldown hint) on the Ranch page; owner's waiting queue
      merges Tributes with Fence cards/replies; a new "Tributes & Marks" Chime toggle in the Workshop; three new
      `ChimeItem` icon variants were already in the design kit (`TRIBUTE_CREATED`, `MARK_AWARDED`, reused `CARD_WAITING`).
- [x] **Limits**: reading matches the Fence (240/min signed in, 60/min anonymous); giving a Tribute 20/hour per person +
      3/hour per (author, owner) pair; giving a Mark 30/hour per person (the cooldown does the real work).

## Completed in Phase 9 — Media / Portrait

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

`pnpm vitest run` → **55 files / 881 tests ✔** (unit, UI, database and security). `pnpm lint` / `pnpm typecheck` /
`pnpm format:check` clean. `pnpm e2e` was **not run this pass either** (production build; machine had ~1–1.5 GB free
RAM throughout — see the ledger's machine constraint) — Tributes/Marks/Town Halls all have no Playwright coverage yet
(Known Issues).

Town Halls added 27 database / security tests (`tests/security/town-halls.test.ts`): creation (validation, rate
limit), the directory (open/members only, never invite-only, joined flag, no member count anywhere), reading one
(invite-only hidden ≡ missing), joining/leaving (idempotent, owner cannot leave), invites (owner-only, idempotent,
self-invite refused, two independent rate limits — per person and a stricter per-Town-Hall one — proven separately),
the roster (active-members-only), managing members (owner-only, cannot remove self), updating/deleting (owner-only,
cascade), "mine" (every visibility I belong to), Chimes (invited/accepted, muted inviter rings nobody), DB
constraints (bad visibility/role/status, the owner-must-be-active check, at most one owner per Town Hall), and cascade
delete (owner deletion removes the whole Town Hall; a regular member's deletion only drops their own row).

Tributes + Marks added 32 database / security tests (`tests/security/tributes.test.ts`, `tests/security/marks.test.ts`):
Posse gate (give and view), self-tribute/self-mark refused, always-pending with no fast path, approve/pin/remove ownership,
mute/block hiding both the public list and the waiting queue, input screening (length/links/disguising chars), the 30-day
cooldown (including a concurrent-race test — two simultaneous gives, only one wins), Vibe Matrix aggregation scoped to the
right target, rate limits (per-person, proven across many owners so a tighter per-pair limit cannot mask it), DB
constraints, retention and cascade-delete.

Phase 9 Media added: 40 database / security tests (tests/security/media.test.ts), 13 storage-driver tests (R2 signing, tokens, key safety), 7 image-processing tests (orientation
checked by pixel colour, EXIF gone, pixel-bomb refused), 4 streaming body-cap tests, env / CSP / boundary tests, and the Portrait browser test.

**Mutation check, Town Halls** (`.dev/mutate12.mjs`): 14 protections removed one at a time; **all 14 caught**. This
round caught a real bug before it shipped: removing the owner-active/visibility re-check inside `act()` exposed that
`leave`/`decline` on an `invite`-only Town Hall was building its response from a re-read (`getTownHall`) that the
action itself had just made return "not found" — turning an ordinary decline into a 500 (see Failures table).

**Mutation check, Tributes + Marks** (`.dev/mutate11.mjs`): 14 protections removed one at a time; **13 caught**. The one uncaught
mutant is equivalent: removing the explicit `BLOCKED` check inside the `tribute:give`/`mark:give` policy branch is still
caught by `access()`'s prior `profile:view` check, which independently denies a blocked pair before the give-specific branch
is ever reached.

**Mutation check, Media** (`.dev/mutate10.mjs`): 29 protections removed one at a time; **28 caught**. The body size cap first ESCAPED (the size-mismatch check hid it), so it got its own
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

## Failures encountered and fixed (Phase 10 — Town Halls)

| Failure | Cause | Fix | Verification |
| --- | --- | --- | --- |
| `decline` (and `leave`, on an `invite`-only Town Hall) answered 500 instead of 200 | `act()` built its response by re-reading the Town Hall through the same visibility-gated `getTownHall()` the directory uses; the action had just removed the caller's only membership row, so the gate now (correctly) hid it, and the handler mistook that for a server error | Build the response from what the action already knows, deterministically, instead of re-querying through a gate it just closed | test for declining a real pending invite |
| The per-Town-Hall invite rate limit (50/hour) could never fire before the per-person one (30/hour) | Only the owner can invite into their own Town Hall, so for one owner the two counters always moved together — the looser one was unreachable dead weight | Made the per-hall limit *stricter* (20/hour) than the per-person one, so concentrating invites on one Town Hall trips it first | two separate rate-limit tests (per-hall vs. per-person across several halls) |
| A rate-limit test signed up 31 real accounts inside the loop and hit signup's own limit first | Reused the full `person()` helper (real signup + login) for throwaway invite targets | Bulk-inserted rows directly (`insertUser`, or raw SQL for Town Halls themselves) to stay under the endpoint's own limit, not an unrelated one | the two invite rate-limit tests |

## Failures encountered and fixed (Phase 9 — Tributes + Marks)

| Failure | Cause | Fix | Verification |
| --- | --- | --- | --- |
| Two racing `giveMark` requests could both slip past the 30-day cooldown | Check-then-insert as two separate statements | One atomic `insert … where not exists (…)` | race test (`Promise.all`) + mutation |
| Existing `TributeCard` UI test broke when pin/remove actions were added for published Tributes | The design-kit component only ever rendered `actions` while `status === 'pending'` (its documented contract) | Kept that contract; pin/remove render outside `TributeCard` in `TributesSection` instead | `pnpm test` (pre-existing `tests/ui/howdy.test.tsx` case) |
| `pnpm vitest run` reformatted a test file mid-session and `source-hygiene` failed | A literal bidi override character (`U+202E`) was embedded directly in `tributes.test.ts` source while writing an input-screening test | Build the character at runtime (`String.fromCharCode(0x202e)`) instead of embedding it in source | `tests/unit/source-hygiene.test.ts` |
| Two mutations initially ESCAPED (rate limits on giving a Tribute/Mark) | No test exercised the limit in isolation: a naive same-owner loop would have hit the tighter per-owner Tribute limit first, masking the per-person one | Tests spam **different** owners/targets (bulk-inserted) so only the per-person limiter can trip | mutation |

## Failures encountered and fixed (Phase 9 — Media)

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
4. ~~Schedule `pnpm jobs:purge`~~ **Done 2026-09-27**: daily Vercel Cron `/api/jobs/purge` (ADR-019). Still open: decide the audit-log and report-evidence retention periods (flagged in the Privacy Policy).
5. **Cloudflare R2 (deploy blocker for photos):** create a private bucket, an Object Read & Write API token for it, and a bucket CORS rule allowing `PUT` from `APP_URL`; set `STORAGE_DRIVER=r2` and the four `R2_*` variables (see `.env.example`). The R2 driver is tested against a fake client only.
6. **Deploying `pnpm ws`** (see ADR-013): long-lived Node process, `NODE_ENV=production`, `WS_PUBLIC_URL=wss://<same host as the site>`, Redis.

## Known Issues / Deferred

- **Tributes/Marks/Town Halls have no Playwright (e2e) coverage yet** — `pnpm e2e` needs a production build and was
  skipped every pass this session because the machine had very little free RAM throughout (see the ledger's machine
  constraint); run it before trusting real-browser behaviour (axe, 320px, 44px targets, CSP) for any of the three.
- Town Halls have no shared post feed yet (directory + membership only, ADR-017); `members` visibility is today
  identical in effect to `open` (self-serve either way) — only the label differs, in case a real approval-gated join
  flow is wanted later.
- Posse members always see each other's visits unless the visitor chose Shadow Walk (disclosed on the page). A person with few non-Posse
  visitors may guess who a hidden one was from what they know.
- No Tracks digest / push, Guess Who, reveal tokens or cohort clues; no "who I visited".
- The sidebar now has eight links (Town Halls is `sidebarOnly`, so the phone tab bar stays at six; the desktop sidebar
  wraps — already true at seven before this phase).
- Earlier deferrals still stand (restricted Whispers tray, non-Posse Whispers, no MFA/passkeys, account deletion designed not built,
  fixed-window limiter, placeholder icons, e2e needs local Edge, no visual baselines, master prompt §49–50 items).

## Next Task

**Moderation + Anti-Abuse Expansion** (master prompt §61 Phase 11). Media follow-ups still open: photos on Post Cards
(per-card media with the Fence's privacy rules), showing Portraits in lists / cards / Chimes (needs a per-viewer
decision per row), reporting a photo, image moderation, and the account-deletion flow calling `deleteAllMediaFor`.
Tributes/Marks/Town Halls follow-ups: e2e coverage for Tributes; revisit whether Tribute/Mark giving should ever
widen beyond Posse-only; a Town Hall shared feed if the need becomes real; Town Hall roles beyond owner/member.

## Architectural Decisions

ADR-001 … ADR-017 and ADR-019 in `docs/decisions/`; lifecycle and deletion design in `docs/DATA_LIFECYCLE.md`.

