# Howdy Build Status

_Last updated: 2026-10-05_

## Current Phase

**All 13 phases of the master prompt's build order (§61) are built and live**, plus everything added since (latest:
Town Hall feed ADR-033, Dynamic Island ADR-034). Production: Vercel `sin1` + Neon `howdy-sg` (`howdy_prod`), Resend
mail, R2 photos, Upstash Redis; a push to `main` deploys. Production does not migrate on deploy: apply new migrations
to `howdy_dev` and the Singapore `howdy_prod` first.

## 2026-10-06 — Town Hall Deputies, "ask to join", handover (ADR-041) — shipped

Decisions taken with you: **Deputies keep order** (owner alone edits/deletes/appoints/hands over); **a separate "Ask to
join" switch**; **a quiet "no"** (the request runs out after 30 days); **hand over to a Deputy**.

- [x] Members list: Owner / Deputy labels and a per-person Options menu (Make a Deputy, Stand down, Hand the Town Hall
      to them…, Remove…). Staff see "Asking to join (N)" with Let in / No; owners get a "Joining" switch; the create
      form has "Ask to join". Askers see a disabled "Requested". "Mine" shows "N asking to join" to staff.
- [x] Deputies: held tray, take-downs of ordinary members' words, invites, removals; never the owner or another Deputy.
- [x] When an owner's account is deleted, the longest-serving Deputy inherits the Town Hall (else it goes, as before).
- [x] Migration `0033_town_hall_roles`, applied to `howdy_dev`, Singapore `howdy_prod` and the local test + e2e
      databases before the push. Privacy 1.12.0 (no re-acceptance). Daily purge deletes requests older than 30 days.
- [x] Tests: `tests/security/town-hall-roles.test.ts` (15), `tests/e2e/town-hall-roles.spec.ts` (two 320 px phones);
      vitest 1423/1423; affected e2e green (town-halls spec now opens the Options menu to remove). Mutation check
      `.dev/mutate-town-hall-roles.mjs`: 13/13 caught (two mutants first had to be made real: editing has two guards,
      and a no-op "no shows" mutant was replaced by "a no deletes the request").
- Known limit (pre-existing): someone removed from an instant-join Town Hall can rejoin; there is no ban list.

## 2026-10-05 (later) — Passkeys and two-step sign-in (ADR-040) — shipped

Decisions taken with you: **passkeys + authenticator-app codes**; **a passkey signs in alone**; **optional, but required
for staff**; **10 recovery codes, and a password reset does NOT switch two-step off**.

- [x] Workshop → **Sign-in security**: add/remove passkeys, link/unlink an authenticator app (QR, "Open in authenticator
      app" link for the same phone, typed key), recovery codes shown once (copy / download), new codes. Every change
      re-asks the password and emails the owner. Turning two-step on signs out every other device.
- [x] Sign-in: **"Sign in with a passkey"** (no handle, no password); with two-step on, the password leads to "One more
      step" (app code, recovery code, or "Use a passkey instead"). Asked only after the password is right and before
      any account status is said.
- [x] Suspended / closing accounts get a 15-minute **ticket** with the notice: appeal, keep and close use it (the
      password routes now need the second step too, so closing from the sign-in page cannot skip it).
- [x] **Staff need two-step**: moderators/admins without it get a 403 telling them to turn it on (members still 404);
      `pnpm set-role` warns. **`rickdev` must add a passkey or app before moderation opens again in production.**
- [x] Migration `0032_two_step`, applied to `howdy_dev`, Singapore `howdy_prod` and the local test + e2e databases
      before the push. Privacy 1.11.0 (no re-acceptance). Data export lists what is set up,
      never a secret. Daily purge removes stale challenges and unfinished app setups.
- [x] Tests: `tests/unit/two-step-crypto.test.ts` (RFC 4226/6238 vectors, sealing, codes, tickets),
      `tests/security/two-step.test.ts` (34: replay, races, guessing limit, reset, look-alike origin, missing user
      verification, cloned counter, challenge hijack, staff gate agreement, export), `tests/e2e/two-step.spec.ts`
      (Chromium virtual authenticator, 320 px phone). Software authenticator in `tests/helpers/passkey.ts`.
- [x] Verified 2026-10-05: vitest 1408/1408; format, lint, typecheck, build; **full e2e 103/103** (run in batches).
      Mutation check `.dev/mutate-two-step.mjs`: all 10 caught (the race one only after the race test was made
      deterministic with a held row lock). Also fixed a stale e2e assertion from the Home redesign ("1 new" → "1
      request waiting").

## 2026-10-05 — Whispers threat model, burn for me (ADR-038), photo check (ADR-039), Ably load test, dev DB moved

Decisions taken with you: all four remaining items; **silent "burn for me"**; **OpenAI omni-moderation**; **hold for a
moderator**; load test on the **live Ably app up to 150**.

- [x] `docs/WHISPERS_THREAT_MODEL.md` — the §61 list (takeover, tokens, hijacking, IDOR, spoofing, replay, spam,
      exhaustion, XSS, CSRF, DB compromise, leakage), each with its mitigation, test and what is left over.
- [x] Found by it, fixed: a blocked/restricted person could Burn Thread and wipe the other person's held tray.
      **ADR-038**: their burn only clears it for themselves, indistinguishably (positions renumbered, old client ids
      re-keyed). Migration `0030_burn_for_me`. Burn dialog no longer says "for both of you".
- [x] **Photo check (ADR-039)**: refuse (sexual / graphic ≥ 0.9), hold (anything else flagged, or the check failing:
      owner-only + an automatic report), or pass. Every photo read now names its viewer. Moderators: Dismiss releases,
      "Remove photo" retires (a card keeps its words). Migration `0031_photo_check`. **Inert until `OPENAI_API_KEY`
      is set** in `.env.local` and on Vercel. The model cannot judge `sexual/minors` in images (documented).
- [x] Privacy 1.10.0 (no re-acceptance): the burn exception, the photo check, OpenAI as a provider.
- [x] **Ably load test** (`scripts/loadtest/ably-ring.mjs`, from India, 2026-10-05): 25 → 50 → 100 → 150 listeners,
      1,625 rings, 0 lost, 0 failed connects; ring → listener p50 86 ms, p95 251–373 ms, max 443 ms; connect p95
      ~670 ms; site round trip p50 ~150 ms. Ring-to-screen ≈ 0.5 s at p95 — well under ADR-036's 1 s trigger.
- [x] Local dev DB moved off Ohio (blocker 2).
- [x] Tests: `whispers.test.ts` "Burn for me" (5, mutation `.dev/mutate-burn.mjs` 6/6), `photo-check.test.ts` (13,
      mutation `.dev/mutate-photo.mjs` 7/7).

## 2026-10-04 — "Download my data" (ADR-037)

Decisions taken with you: **instant download**, **a ZIP with the photos**, **yours + what you can see**, **password
again + a limit**.

- [x] Workshop → "Download my data": password, then a ZIP (`README.txt`, `data.json`, `photos/`) streamed from
      `POST /api/me/export`. Attempts 10/hour, finished exports 3/day, audit `data_exported`.
- [x] One rule: nothing the app would not show you now. Each module exports its own rows in the state you see (held
      looks posted to its writer, declined requests look sent, sealed capsules have no words, Marks are counts); the
      app layer names people only if active and not hidden (block either way, or your mute), else drops the item.
- [x] Privacy 1.9.0 (no re-acceptance). Also on 2026-10-04: the unused `KV_*` variables removed from Vercel.
- [x] Tests: `tests/security/data-export.test.ts` (12), mutation `.dev/mutate21.mjs` 8/8, e2e
      `tests/e2e/data-export.spec.ts`. No migration.

## 2026-10-04 — Home redesign: "At a glance", plain sign-out

- [x] Greeting card: your photo, "Howdy, name", @call sign; four tappable numbers — unread Whispers, new Chimes, Pals
      (+ requests waiting), Porch visits today ("–" while on Shadow Walk) — each from the same function its own page
      uses, so they agree with it; a compact "Visit your Porch". Pals / Workshop buttons removed (tab bar / ⋯ menu).
- [x] "Hit the Trail" → **Sign out**, "Hit the Trail everywhere" → **Sign out everywhere…** (still asks first), both
      inside an always-open Open Gates card. The phone ⋯ menu now ends with Sign out. Tests: auth, navigation e2e.
- [x] The Whisper thread's actions moved into a "Thread options" ⋯ menu; the header no longer squeezes the name.

## 2026-10-04 — Porch bio, Workshop tidy-up

- [x] **Bio:** an optional line (≤ 150) under your name on the Porch, set in the Workshop's "Tend your Porch"; empty
      clears it. Screened like display names (no links, no disguising characters, normalised spaces), shown as plain
      text, and only to whoever may open the Porch. Migration `0029_profile_bio` on the local test/e2e DBs, `howdy_dev`
      and the Singapore `howdy_prod` (applied before the push). Privacy Policy 1.8.0 mentions it (no re-acceptance).
- [x] Workshop: Portrait colour is one row of tappable circles (real radios for screen readers); the Portrait card is
      more compact. An empty Fence shows the user's "nail a postcard" art to someone who may nail the first card.
- [x] Tests: `tests/security/ranch-edit.test.ts` (bio saved/shown/cleared; links, disguising characters, 151 chars
      refused), `ranch-visibility` (bio is in what a viewer receives), `tests/e2e/ranch.spec.ts` (bio end to end).
      Full e2e: 99 passed + the Ably spec run separately. The Tracks axe/layout tests now wait for the page to replace
      its loading outline (`pageReady`), which they were missing.
- Moderators have no "clear bio" action (display names do not have one either); a report + suspension covers abuse.

## 2026-10-04 — Elixir/Phoenix Whisper service considered, deferred (ADR-036)

- [x] `master-prompt-chat-service.md` reviewed against the repo: idempotency, ordering, block/Restrict, Seen, limits,
      reconnect catch-up and offline Chimes already exist; realtime stays on Ably. Revisit triggers (peak Ably
      connections > 150, p95 ring-to-screen > 1 s, a need for typing/presence or non-Pal Whispers) are in the ADR.

## 2026-10-02 — instant Whispers through Ably (ADR-035)

- [x] Word-free "ring" on a per-person, unguessable, listen-only Ably channel after each Whisper (recipient unless held,
      plus the sender's other devices); Whispers pages fetch what is new from our own API. `GET /api/live/token`,
      CSP allows Ably only when `ABLY_API_KEY` is set; Privacy Policy 1.8.0 lists Ably.
- [x] Tests: `tests/security/live-ping.test.ts` (9; the Restrict rule mutation-checked), CSP test.
- [x] `ABLY_API_KEY` set in `.env.local` and on Vercel (Production, sensitive) on 2026-10-04.
- [x] Verified against the real Ably app: `E2E_ABLY=1 npx playwright test tests/e2e/live-ably.spec.ts` (our socket
      server off; the Whisper arrives well under the 8 s fallback; Ably frames carry no words or call signs).
      `whispers.spec.ts` 7/7 on the self-hosted path; vitest 1,330/1,330.

## 2026-10-01 — audit-log retention, policy updates, Chimes in the island

- [x] Security records (`audit_log`) kept **12 months**, then deleted by the daily job (`purgeOldAuditLog`; migration
      `0028` adds the `created_at` index). Privacy Policy 1.7.0 states it (no re-acceptance: shorter retention), and
      its "decide a period" review note is gone. Town Hall posts are now in the policy; the Cookie Policy (1.1.0) names
      the island's one local-storage note.
- [x] Dynamic Island: "Get Chimes on this phone" (signed in, phone, not yet asked; iPhone only once installed); the
      browser's dialog comes only after a tap. Tests: `tests/ui/chimes-island.test.tsx` (headless browsers report
      notifications as already denied, so this is unit-tested, not e2e).

## 2026-10-01 — Town Hall feed (ADR-033)

Shipped 2026-10-01 (e158b7f); migration `0027_town_hall_feed` on `howdy_dev` and the Singapore `howdy_prod`.
- [x] Members-only feed: posts (280), replies (80, ≤ 20 per post), five reactions; writer or owner removes.
- [x] Fence protections: blocks/mutes, inactive authors, fail-closed limits, first-week budgets, auto-hold + owner's
      "Waiting for you" tray, held items purged after 30 days.
- [x] Reports: subject `hall_post`, moderator `remove_hall_post`. Chimes: reply/reaction to the writer only.
- [x] Tests: `tests/security/town-hall-feed.test.ts` (22; 7 mutations all caught), `tests/e2e/town-hall-feed.spec.ts`
      (320 px phone, axe, 44 px targets, no overflow). Full vitest run: 1,304 tests.

## 2026-10-01 — Porch Light (ADR-032)

Decisions taken with you: **pick All Pals or Close Pals each time**; **30 min / 1 h / 2 h**; **no Chime or push**;
**optional note ≤ 60 characters**.

- [x] Home: a "Porch Lights" card lists Pals whose light is on for me (photo, "free until 8:30 pm", note, Whisper
      button) and holds my own switch. A lit Porch shows a "Porch Light on" card to those Pals, and to its owner.
- [x] Who sees it is decided when read (`palsReaching`): Pals now, no block either way, not restricted by the owner,
      not muting the owner; Close-only uses the owner's own Close mark. No ids or audience in the answer.
- [x] No history: off deletes the row; expired rows mean nothing and `purgeExpiredLights` deletes them daily. The
      database refuses a light longer than 2 hours.
- [x] Tests: `lights` (15) + calendar `clockOf`; mutation `.dev/mutate-lights.mjs` 16/16 caught. Migration `0026`.
      Privacy 1.6.0 (no re-acceptance).

## 2026-10-01 — Portraits everywhere

People's photos now show wherever they are listed: Post Cards and replies, Whispers (list, thread, held tray), Chimes
(photo with the Chime's icon in its corner), Tracks, Town Hall members, "Pals you may know", Memories and Time Capsules —
only when the viewer may open that person's Porch (ADR-015 updated). Tests: `portraits-in-lists` (3) + batch
equivalence + e2e `portraits-in-lists`; mutation 3 of 4 caught, the 4th covered by a second layer.

## 2026-10-01 — moved to Singapore

Database (Neon `howdy-sg`, `aws-ap-southeast-1`), Redis (Upstash, Singapore) and the app servers (`sin1`) now sit
together near India, following `docs/RUNBOOK-move-to-singapore.md`. The copy matched production table for table. The old
Ohio project stays for 1–2 weeks as the way back.

## Added 2026-09-30 — one photo on a Post Card (ADR-031)

Decisions taken with you: **one photo per card**; on someone else's Fence **only their Pals** may add one; **no
automatic image checks yet**.

- [x] Nail composer: "Add a photo" → preview → Nail. Same upload pipeline as Portraits (decoded and re-made on the
      server, EXIF dropped, at most 1280 px). Attached in the card's own transaction; one per card.
- [x] Served only to people who can see the card (same rules as its words); goes with its card; the daily job deletes
      detached files. The owner sees it in the waiting queue; moderators see it on a reported card.
- [x] Fixed: starting a Portrait upload no longer discards an unfinished card photo.
- [x] Also: a phone "More" menu (a410a8b) and clay icons for Time Capsules and Moderation.
- [x] Tests: `card-photos` (13) + e2e; mutation `.dev/mutate20.mjs` 13/13 (mutants now type-checked first).
      Migration `0025`. Privacy 1.5.0.

## Completed in Phase 13 — performance at 20k people, and "Pals you may know" (ADR-029, ADR-030), 2026-09-30

Decisions taken with you: size for **~20,000 people**; "Advanced Intelligence" = **Pals you may know** (no ML).

- [x] A local 20k-person database (`scripts/perf/seed.sql`) and a benchmark of the real reads (`scripts/perf/bench.ts`,
      `RTT_MS=10` simulates the production network). No statement was slow; round trips were the cost.
- [x] The bell (every page): 35 → 9 queries, 93 → 31 ms simulated; Chimes page 91 → 19 queries, 231 → 93 ms —
      batched `getFenceResources` / `fenceStandings`, proven identical to the single lookups for every relationship.
- [x] Fence / Tributes / Vibe Matrix: independent lookups in parallel (139 → 108, 93 → 79, 78 → 47 ms simulated).
- [x] Pals you may know (Pals page): Pals of ≥ 2 of my Pals; never across a block/mute/restrict, any ask or decline,
      a Pals-only Porch, an opt-out or a dismissal. Workshop switch "Suggest me to Pals of my Pals". Migration `0024`.
- [x] Privacy 1.4.0. Tests: `suggestions` (10), `batch-equivalence` (2) + e2e; mutation `.dev/mutate19.mjs`.
- [x] ~~Your call: move to Singapore~~ **Done 2026-10-01** (`docs/RUNBOOK-move-to-singapore.md`; Vercel `sin1`, Neon
      `howdy-sg`, Upstash Singapore).


**Phase 11 — Moderation + Anti-Abuse Expansion** (shipped 2026-09-30; this note is as of 2026-09-29) was built: the moderation queue (ADR-018, restored from `git stash`), suspension reasons + timed suspensions +
appeals (ADR-023), first-week budgets + auto-hold after many reports (ADR-024), reporting photos, Whispers and Town
Halls (ADR-025), and the held-Whispers tray (ADR-026). Migrations `0019`–`0021` are on the local test and e2e databases only: `howdy_dev` and `howdy_prod`
need them **before** this code is pushed. **Full e2e 2026-09-30: 87 of 87 pass** (run in three chunks to fit the
machine's memory), incl. the new `moderation.spec.ts` (suspended sign-in + appeal + moderator lifts it; `/moderation`
404 for members and 44 px touch targets on a phone; the held tray). Still to come in Phase 11: see "Next Task". Open follow-ups outside Phase
11: photos on Post Cards, account deletion, a real R2 bucket CORS rule.

Also shipped on 2026-09-27 (all live): the Vibe Matrix's five traits, Post Card reactions, a Whisper button on Pals rows
(Close Pal moved into ⋯), the Chime bell clearing when Chimes is opened, and the fixes below. Migrations `0014` and `0015`
are applied to `howdy_dev`, `howdy_prod` and the local e2e database. **Last full e2e run: 83 of 83 pass** (2026-09-27,
with the new Tributes, Marks and Town Halls specs and the fixes they led to).

## Added 2026-09-28 (later) — Whisper UI, "Seen" (ADR-021), install + push (ADR-022)

- [x] Whisper thread: the @handle under the name no longer carries the link underline; bubbles are compact with the
      time inline in small type, `11:00 AM · Sent` / `· Seen` on the newest Whisper I sent.
- [x] **Seen** with a reciprocal "Read receipts" switch (Whispers list), on by default; never shown to a restricted
      sender. Migration `0017_read_receipts`.
- [x] **Service worker + install**: `public/sw.js` (no caching), manifest `id`/`scope`/maskable icon, CSP
      `worker-src 'self'`, an Install button / menu steps on Chimes ("Howdy on your phone").
- [x] **Web Push** for Chimes (incl. Whispers), bound to the subscribing session, endpoint host allowlist (SSRF).
      Migration `0018_push_subscriptions`. Needs `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` on Vercel, else push is off.
- [x] Migrations 0017/0018 applied to `howdy_dev`, `howdy_prod` and the local test/e2e databases (2026-09-29; 0016 was
      already on both). VAPID keys set on Vercel production. Full e2e: 83/84, the one failure a hydration race in
      `portrait.spec.ts`, since made to retry.
- [x] Tests: "Seen" block in `tests/security/whispers.test.ts`, new `tests/security/push.test.ts`, e2e Seen check.
      Mutation-checked (Restrict guard, reciprocity, live-session filter, host allowlist). Found and fixed on the way:
      `tests/e2e/whispers.spec.ts` had literal backspace bytes where `\b` was meant, so its "no receipts" check could
      never fail.
- Known flaky (pre-existing, untouched): `marks.test.ts` "two racing requests…" and `storage.test.ts` "is rejected
  under another secret…" each failed once and passed on re-run.

## Added 2026-09-28 — the Trusted tick (ADR-020)

- [x] A gold tick members earn when every check passes: email confirmed, account ≥ 30 days, a Portrait, ≥ 3 Pals,
      Marks from ≥ 5 different people across ≥ 2 kinds (each from ≥ 2 people) in the last year, seen in the last 30
      days, no upheld report in 180 days. Thresholds are small-group values in `TRUST_RULES`, to be raised later.
- [x] Shown beside the name on a Porch and on Post Card and reply authors. The team account keeps blue Verified and
      never shows it. The owner alone sees the checklist ("Trusted tick" card on their own Porch).
- [x] Migration `0016_trust_ticks` (**not yet applied** to `howdy_dev`, `howdy_prod` or the local e2e database).
- [x] Tests: `tests/unit/trust-rules.test.ts`, `tests/security/trust.test.ts` (each rule, which Marks count, open vs
      upheld reports, team account, re-check on Mark / visit / daily job), badge tests in `tests/ui/howdy.test.tsx`.
      Mutation-checked: counting repeat givers, counting open reports, counting young givers, the team showing the
      tick, and no re-check on visit each make a test fail.

## Security test 2026-09-27 — email validation at sign-up (P0 brief)

Ran the "Email Validation Security Test (P0)" brief against sign-up, with the form bypassed.

- Already enforced on the server (unchanged): trimmed and lowercased before storing; no `@`, several `@`, missing
  domain or TLD (`test@gmail`, `user@localhost`), IP literals, consecutive/edge dots, spaces, quotes, `<>`, non-ASCII,
  over 254 characters, non-string values — all 422 `VALIDATION_FAILED` with `fields.email` = "Enter a valid email
  address." A repeat address in another case is the same account (identical reply, no second row). Sign-up is rate
  limited per email and per address (`auth-abuse.test.ts`).
- **Tightened** (`emailSchema` in `src/shared/validation/auth.ts`, used by every email form): domain parts may not start
  or end with a hyphen (`a@b-.com` was accepted); local part at most 64 characters; **punycode (`xn--`) domains are
  refused** (the ASCII form of look-alike IDN domains).
- **Form:** the email is now checked when you leave the box (same rule as the server), marked, kept as typed, cleared as
  soon as it is fixed, and a submit with it wrong sends nothing.
- **Digits on both sides refused** (`123@123.com`, `42@7.co.in`), by the product owner's decision. Kept narrow on purpose:
  digits on one side only are real addresses and stay allowed (`12345@qq.com`, `me@163.com`).
- The error body keeps the app-wide shape (`{ error: { code, message, requestId, fields } }`) rather than the brief's
  example `{ error: "INVALID_EMAIL" }`, so every form reads errors the same way.
- Tests: `tests/helpers/emails.ts` (the shared list), `tests/unit/auth-validation.test.ts` (checked to fail without the
  new rule), `tests/security/signup-email.test.ts` (56 cases through the route handler: rejected with no account and no
  mail, accepted and stored normalised, non-string values, no echo of injection/script input, case-insensitive
  duplicates), `tests/e2e/auth.spec.ts` (blur, kept input, nothing sent, API 422).

## Added 2026-09-27 — e2e coverage for Tributes

- [x] `tests/e2e/tributes.spec.ts`: a Pal leaves a Tribute (shown to him as waiting, with "Take it back"); a non-Pal
      cannot read it or write one; the owner is told, approves it from "Waiting for you", and it shows at once; the author
      is told; a second one is approved, the older is pinned and moves to the top (saved, not just on screen); one is
      taken down for everyone. Axe light/dark as owner and as author, 320 px and 44 px targets.
- Found and fixed:
  - **An approved Tribute did not appear in the owner's list** until a reload (the list is the section's own state and
    the page refresh after approving did not reset it). The section now takes fresh server data when it arrives.
  - **"Pin to top" did not move it to the top** until a reload. The pinned one now leads at once.
  - **Wrong words on a waiting Tribute:** only its author sees it, but it said "Waiting for your approval". Now
    "Waiting for approval".

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
| 9 — Tributes + Marks | DONE (e2e coverage for both since 2026-09-27) |
| 10 — Town Halls | DONE (directory + membership only, no shared feed; e2e coverage since 2026-09-27) |
| P0 — Legal Foundation | DONE (documents need a lawyer's review before launch — see ADR-019 "Before launch") |
| 11 — Moderation + Anti-Abuse | IN PROGRESS (queue, suspensions + appeals, anti-spam layers, report subjects, held tray done; image moderation + evidence retention period need decisions) |

## Completed in Phase 12 — Memories and Time Capsules (ADR-028), 2026-09-30

Decisions taken with you: a Time Capsule is for **me or one Pal**; the Pal **sees that one is coming and when**; it
**never opens if we are no longer Pals** (or there is a block) on the day; Memories = **on this day**, **Pal
anniversaries**, **Tribute anniversaries**.

- [x] `/capsules` (sidebar "Time Capsules"): seal for my future self or a Pal (tomorrow … 5 years, 500 characters);
      opened ones to read and delete; "coming to you" (who + when); "sealed by you" (to whom + when, take back).
      Sealed words are returned to nobody, the writer included.
- [x] Opening on the day, when the recipient looks or in the daily job: both active, still Pals, no block — else
      deleted. A "Time Capsules" Chime (with its own Workshop switch); a capsule to myself rings me too.
- [x] Home "On this day": cards on my Fence, the day we became Pals, Tributes to me — from earlier years, only what is
      still there and visible to me. Nothing stored.
- [x] One calendar for dates: Asia/Kolkata (`src/shared/calendar.ts`).
- [x] Privacy 1.3.0 (Time Capsules and Memories). Migration `0023`.
- [x] Tests: `capsules` (18), `memories` (7), `calendar` (4) + e2e `capsules.spec.ts`; mutation `.dev/mutate18.mjs` 22/22.
- Fixed on the way: the upload-token test was STILL flaky after the first fix — the last character of a 43-character
  base64url signature carries only 4 real bits, so changing it can decode to the same bytes. It now changes the first.

## Added 2026-09-30 — account deletion, "Burn the Deed" (ADR-027)

Decisions taken with you: **14 days** to change your mind (by signing in), call sign **held back 90 days**, a
**suspended account may delete itself**.

- [x] Workshop → "Burn the Deed" (password + confirm) closes the account at once: every session ends, it disappears
      everywhere, an email gives the date. A suspended person can do the same from the sign-in page.
- [x] Signing in during the 14 days → "Your account is closing" → "Keep my account" puts it back exactly as it was
      (still suspended if it was), without reviving old sessions.
- [x] Daily job: photo files first, then the account (deferred if a file cannot be deleted); everything cascades,
      reports and audit rows stay without the link; a closing email.
- [x] Call sign held back 90 days as a keyed hash (`retired_handles`, migration `0022`); sign-up says "taken".
- [x] Privacy + Terms 1.2.0 (self-service deletion; nobody asked to re-agree). DATA_LIFECYCLE §2 now describes what
      is built.
- [x] Tests: `account-deletion` (12) + e2e `account-deletion.spec.ts`; mutation run `.dev/mutate17.mjs` 12/12.

## Fixed 2026-09-30 — two "flaky" tests were real

- **Marks cooldown race (a real bug).** `giveMark` relied on one `insert … where not exists` statement, which under
  read committed lets two racing requests both insert: two Marks inside the 30-day cooldown. The race test failed
  about 1 run in 4 and had been written off as flaky. The pair is now locked (`pg_advisory_xact_lock`) for the
  insert's transaction: 12 of 12 runs pass.
- **Upload-token test.** It "altered" a signature by setting its last character to `A`, a no-op when it already was
  (1 in 64). It now picks a different character.
- **Report retention decided:** closed reports are deleted 1 year after closing (`purgeClosedReports`, daily job).
  Privacy `acceptVersion` raised to 1.1.0, so every existing account is asked once.

## Completed in Phase 11 — suspensions, appeals, anti-spam, report subjects (ADR-023/024/025), 2026-09-29

Decisions taken with you: tell a suspended person the **reason and end date, with an in-app appeal**; suspensions are
**7 days / 30 days / indefinite**; build **all three** anti-spam layers; make **photos, Whispers and Town Halls**
reportable.

- [x] **Suspensions (ADR-023):** `suspensions` table (migration `0019`, existing suspended accounts backfilled). A
      moderator must pick a reason (shown to the person) and a length. Sign-in says why and until when, but only after
      the password is proven (`403 ACCOUNT_SUSPENDED` + `data`). Timed ones lift at sign-in and in the daily purge.
- [x] **Appeals:** one per suspension, from the sign-in page, re-checked with the password and the same login limits.
      Appeals section on `/moderation` (oldest first). Grant lifts; uphold stands and sign-in says so. Answered once (409).
- [x] **First-week budgets (ADR-024):** accounts under 7 days old get extra daily caps on cards, replies, reactions, Pal
      requests, Whispers and Town Halls. Each is spent before any lookup, and lifts by itself on day 8.
- [x] **Auto-hold (ADR-024):** 3+ different reporters (open reports, last 7 days) → that person's cards and replies on
      OTHER Fences are `held` for the owner (invisible to them). Lifts as soon as a moderator closes the reports. Queue
      badge "Writing held for review". Migration `0020` (index).
- [x] **Link safety:** already in place since Phase 5 (public text refuses links; nothing is ever a clickable link).
      A draft "hold new accounts' links" was dead code and was removed. Now pinned by a test.
- [x] **Report subjects (ADR-025):** photo (exact version; moderator sees it; `remove_portrait`), one received Whisper
      (works after a block; only that message reaches the moderator; `remove_whisper`), Town Hall (`remove_town_hall`).
      Migration `0021`. Entry points: Porch ⋯ "Flag their photo…", thread "Flag a Whisper", Town Hall "Flag this Town Hall…".
- [x] **Held tray (ADR-026):** `/whispers/held` shows Whispers held back from people I restricted; reading it tells the
      sender nothing; each can be flagged; old held Whispers stay held after unrestricting. `held` and `unread` are now
      reserved call signs (the latter was a latent URL collision with `/api/whispers/unread`).
- [x] **Documents:** Terms, Campfire Rules and Privacy 1.1.0 (in-app appeals and lengths, suspension records, reported
      Whisper evidence). `acceptVersion` unchanged: nobody is asked to agree again.
- [x] **Tests:** `suspensions` (24), `anti-spam` (13), `report-subjects` (15), `held-tray` (6). Mutation runs
      `.dev/mutate13/14/15/16.mjs`: 14 + 15 + 12 + 5 protections, all caught (after strengthening tests for 5 that first escaped). Tests about everyone's
      general limits now use `settledUser` (a month-old account).

## Completed in Phase 11 — the moderation queue (ADR-018), 2026-09-27 (restored 2026-09-29)

An earlier pass had left migration `0012` (`users.role`, and `reports.card_id` / `reviewed_by` / `reviewed_at`) and the
service functions in place, but they were not wired up and not tested. This pass finished them.

- [x] **API**: `GET /api/moderation/reports` (status filter, keyset paging), `POST /api/moderation/reports/[id]`
      (`dismiss` / `remove_card` / `suspend`), `GET/POST /api/moderation/accounts/[handle]` (look up, `suspend` /
      `reinstate`). A non-moderator gets the plain 404 everywhere.
- [x] **Service fixes**: a report is closed atomically, first, inside each action's transaction (a closed report
      answers 409 and a racing loser rolls back). Suspension revokes every session. Staff (the actor included) cannot
      be suspended from here. A `pending_deletion` account is never overwritten. The queue's `= any(${array})`
      queries were replaced with `inArray`, because they answered 500 the first time anything called them.
- [x] **UI**: `/moderation` (the queue with an Open / Acted on / Dismissed filter, a confirm step before suspending,
      and an account lookup with suspend/reinstate), plus a sidebar-only Moderation link shown to moderators. No
      `loading.tsx`, on purpose.
- [x] **`pnpm set-role <call sign> <member|moderator|admin>`**: the only way to grant a role. It is audited.
- [x] **Tests**: `tests/security/moderation.test.ts` (22). Mutation run `.dev/mutate11.mjs`: 11 of 11 caught.
- [x] Also fixed along the way: a pre-existing lint error (`console.log` in `tests/e2e/helpers.ts`) and Prettier
      drift in `src/app/porch/[handle]/loading.tsx`. Both made `pnpm check` fail on `main`.

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

1. ~~Mail provider~~ **Done:** Resend, domain verified.
2. ~~Neon dev branch~~ **Done:** since 2026-10-05 local dev uses `howdy_dev` on the `dev` branch of `howdy-sg`
   (`still-violet-96054141`; schema-only off `main`, so no real member data; its own role `howdy_dev_owner`). The old
   Ohio `howdy_dev` rows were copied over (873 rows, counts checked). The Ohio project (`dry-mode-62941068`) is now
   only a rollback — delete it after ~2026-10-15 (your call); nothing local depends on it any more.
   ~~Unused `KV_*` Vercel variables~~ removed 2026-10-04.
3. ~~First commit~~ **Done:** everything is on GitHub; pushing `main` deploys.
4. ~~Schedule `pnpm jobs:purge`~~ **Done 2026-09-27**; ~~retention periods~~ **Done 2026-10-01**: audit log 12 months,
   closed reports 1 year.
5. ~~Cloudflare R2~~ **Done:** bucket `howdy` is live and its CORS rule allows `PUT` from the site (checked 2026-10-01).
6. ~~Deploying `pnpm ws`~~ **Not needed:** production's live Whispers go through Ably (ADR-035, live 2026-10-04);
   the self-hosted `pnpm ws` path stays in the code for local dev and tests.

## Known Issues / Deferred

- Town Halls: `members` visibility is today identical in effect to `open` (self-serve either way) — only the label
  differs, in case a real approval-gated join flow is wanted later. (The shared feed is built: ADR-033.)
- Posse members always see each other's visits unless the visitor chose Shadow Walk (disclosed on the page). A person with few non-Posse
  visitors may guess who a hidden one was from what they know.
- No Tracks digest / push, Guess Who, reveal tokens or cohort clues; no "who I visited".
- The sidebar now has eight links (Town Halls is `sidebarOnly`, so the phone tab bar stays at six; the desktop sidebar
  wraps — already true at seven before this phase).
- Earlier deferrals still stand (non-Posse Whispers, no MFA/passkeys, fixed-window limiter, placeholder icons, e2e needs local Edge, no visual baselines, master prompt §49–50 items).
- ~~Whispers threat model + Ably load test (ADR-036)~~ done 2026-10-05. The load test stops at 150 listeners (free
  plan: 200 connections); go higher only on a paid plan.

## Next Task

**All thirteen phases of the master prompt's build order are built** (Phase 13, 2026-09-30), and so is everything
since (Singapore move, Town Hall feed, Dynamic Island, Ably Whispers, Porch bio, Home redesign). What is left is your
call or waits for real use:

1. ~~A self-service data export~~ **Done 2026-10-04** (ADR-037).
2. Deleting the Ohio Neon project after ~2026-10-15 (blocker 2; local dev already moved off it 2026-10-05).
3. ~~A whole-of-Whispers threat model and a staged Ably load test~~ **Done 2026-10-05** (ADR-038, see above).
4. ~~Image moderation~~ **Built 2026-10-05** (ADR-039) — set `OPENAI_API_KEY` to turn it on. CSAM is not covered
   by it (Cloudflare CSAM Scanning Tool or PhotoDNA, if wanted).
5. Capsules to a Town Hall. ~~Town Hall roles + approval-gated join~~ **built 2026-10-06** (ADR-041). ~~MFA/passkeys~~ **built 2026-10-05** (ADR-040). A Town Hall ban list (removed people can rejoin instant-join halls).
6. Revisit whether Tribute/Mark giving should ever widen beyond Pals-only.

## Architectural Decisions

ADR-001 … ADR-041 in `docs/decisions/`; lifecycle and deletion design in `docs/DATA_LIFECYCLE.md`; Whispers threat model in
`docs/WHISPERS_THREAT_MODEL.md`.

