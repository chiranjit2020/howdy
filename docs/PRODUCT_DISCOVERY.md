# Howdy — Product Discovery Extract

Source: `howdy-conversation-with-gemini.md` (product exploration). Precedence: `master-prompt.md` wins on
implementation priorities; this file preserves the useful product ideas and records where the two differ.

## 1. Principles

1. Small-circle, human-to-human interaction. No algorithmic feed, no influencer content, no video feed.
2. Curiosity as the daily hook (Tracks), but privacy-gated: reciprocity, dedup, retention limits, block overrides.
3. Asynchronous public banter (Fence / Post Cards) with intentionally tiny limits ("no FB bullshit").
4. Peer validation over vanity metrics (Tributes, Marks) — no follower counts.
5. Tactile clay/pastel UI: warm, playful, modern-minimal, subtle micro-interaction.
6. Initial audience: one bounded community (campus-style). Not global launch.

## 2. Vocabulary (UI term → domain term)

| UI | Domain | Notes |
| --- | --- | --- |
| Ranch | Profile | `/ranch/[handle]` |
| Portrait / Look | avatar | |
| Signal | status | one-liner, auto-expires (12h) |
| Posse | Relationship (mutual) | |
| Scouting | Relationship (one-way watch) | replaces "follow" |
| Passerby | Relationship UNKNOWN/PASSERBY | |
| Outlaw | Block | UI only; domain = `Block` |
| Fence | Fence (per-profile wall) | |
| Post Card | PostCard | 160 chars |
| Scribble / reply | PostCardReply | 80 chars |
| Yo | Yo (its own interaction, not a generic reaction) | one-tap, rate-limited |
| Tip Hat | Tip | zero-text nudge ("poke") |
| Marks (Chill/Pure/Cinema/Sigma/Gem) | Mark | 5 deep-vibe awards; Phase 9 |
| Tribute | Tribute | testimonial, owner approval required |
| Tracks | ProfileVisit | Phase 8 |
| Shadow Walk | visit-privacy mode | hides own visits, freezes own Tracks |
| Trace | anonymised visit clue | needs k-anonymity |
| Whisper | Conversation / Message | 280 chars/bubble |
| Town Hall | Community | Phase 10 |
| Chimes | Notification | |
| Workshop | Settings | `/workshop` |
| Boundary Lines / Iron Latch / Open Gates | privacy / security / sessions | |
| Burn the Deed / Burn Thread | account deletion / thread purge | |
| The Gate / Stake a Claim / Step Inside / Hit the Trail | landing / sign-up / login / logout | |
| Secret Knock / Lost Your Key? / Wax Stamp / Deed Granted | password / reset / OTP / account created | |

## 3. UI / design decisions carried forward

- Palette (semantic tokens over it): Canvas Cream `#F8F5EE`, Clay White `#FFFFFF`, Sherbet Peach `#FFB4A2`,
  Pistachio Mint `#B7E4C7`, Buttercup Gold `#FFEAA7`, Lavender Mist `#D8B4E2`, Sky Tint `#BEE1E6`,
  Deep Charcoal `#2B2D42`, Muted Slate `#8D99AE`. Shadow Walk tint `#E8E3F0`; card-back parchment `#FDFBF7`.
- Clay surface: radius 20–28px, soft outer shadow + inner top-left highlight + inner bottom-right shade.
- Motion: card press 2px translateY with spring; Yo pop; Y-axis card flip (front = message, back = scribbles);
  all gated by `prefers-reduced-motion`.
- Fonts: Plus Jakarta Sans (UI), JetBrains Mono (stamps/timestamps), Fraunces (Tributes/headings).
- Dusk/Daylight theme pair.
- Ranch layout: avatar + presence dot, name/handle, Signal pill, action row (Tip / Yo / Whisper), Pinned Tribute, Fence.
- Fence composer visibility: public vs Posse-only; owner may enable a review gate for incoming cards.

## 4. Security / privacy ideas carried forward

- Reciprocal transparency: Shadow Walk on ⇒ your own Tracks freeze.
- Visit dedup: many visits in 24h = 1 Track; coarse timestamps ("today").
- Block removes the blocker from past and future Tracks silently; blocked visits dropped at ingest.
- Tracks store no IP / device fingerprint / geolocation. Short retention (source says 7d), capped list (50).
- k-anonymity (k ≥ 5) for any clue about a non-Posse visitor; fall back to broader category.
- Daily digest instead of per-visit push; push payloads hide message text.
- Post Card quota (source: 3/hour per Fence) and spike throttle; Whisper rate limit (1 msg/s).

## 5. Contradictions and incomplete decisions

| # | Topic | Source doc | Master prompt | Resolution |
| --- | --- | --- | --- | --- |
| C1 | Post Card length | 280 (Fence section) vs 160 (design section) | 160 / reply 80 | **160 / 80**. Source contradicts itself; master decides. |
| C2 | Whisper storage | Redis-only, 7-day TTL, no relational storage | Postgres is durable truth; Redis is delivery only | **Postgres durable + retention job** (ADR-006). Redis only relays. |
| C3 | Tracks storage | Redis ZSET, "never in a relational table" | Redis for *ephemeral* Tracks; Tracks are events with short retention | Decided in Phase 8; default = Postgres table with hard TTL purge unless Redis is proven necessary (ADR-006). Not built yet. |
| C4 | Whisper "encrypted" / "cryptographic purge" | claimed | not specified | Do **not** claim E2E encryption. Transport TLS + at-rest provider encryption. Burn = hard delete. |
| C5 | Anonymous Fence notes ("Anon Stamp", "Anonymous Passerby") | allowed if owner enables | anti-harassment / anti-abuse focus | **Deferred; default off.** Anonymous content needs moderation tooling first (Phase 11). |
| C6 | Tracks clues (department, year, "near North Canteen") | demographic/location clues | no raw location, minimal metadata | No location clues ever. Cohort clues only after Town Halls give real cohorts + k-anonymity. |
| C7 | "Guess Who", "Spark Token" reveal, Handshake | gamified unmasking | not listed | **Deferred** (Phase 8+); needs product review — guessing games leak identity by elimination. |
| C8 | Yo vs Marks vs Tip | Yo = default reaction; Marks = deep vibes; Tip = poke | "Yo is not a generic reaction system" | Yo (Post Card/profile nod), Tip (profile nudge), Marks (Phase 9, per-person, 30-day cooldown) stay three separate domain concepts. |
| C5b | "Yo-Streak" borders | gamified streaks | "avoid complex badges", no engagement farming | **Deferred / probably dropped** — streaks are engagement-farming. |
| C9 | Whisper access | Posse open; passerby via accepted invite | authorization via relationship + privacy | Adopt: Posse = open thread; non-Posse = request/accept. Phase 7. |
| C10 | Signal expiry | 12h | not specified | Adopt 12h default, configurable. |
| C11 | Vibe Matrix % display | percentage of Marks | "no popularity rankings" | Mark *breakdown* is display of peer feedback, not a ranking; no cross-user comparison/leaderboards. Revisit at Phase 9. |
| C12 | Original audience & "Sparks" metric | campus; aggregate "spark" counts | avoid follower-count competition | Sparks are private to the owner, never public. |

## 6. Roadmap

Follows master prompt §61 unchanged in order (Phase 0 → 13). Only adjustment: Phase 0 includes the
error model, structured logging, env validation and rate-limit abstraction *before* auth, because auth depends on them.
See `BUILD_STATUS.md` for live status.
