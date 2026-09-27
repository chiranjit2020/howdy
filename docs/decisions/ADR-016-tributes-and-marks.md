# ADR-016 — Tributes and Marks

Status: accepted (Phase 9, the master prompt's own "Phase 9": Tributes + Marks + Signals — Signals already exist from the
Ranch phase). Decisions taken with you: Posse-only for both, one Mark total per pair every 30 days, exactly one pinned
Tribute at a time (2026-09-22).

## Context

Master prompt §61 groups Tributes and Marks with Signals as peer-validation features — "no follower counts", "no popularity
rankings" (PRODUCT_DISCOVERY C11). A Tribute is a testimonial with owner approval required; Marks are five deep-vibe
awards (Chill / Pure / Cinema / Sigma / Gem), per-person, 30-day cooldown. The design kit already had `TributeCard` and the
Mark names from your profile mockup; there was no backend for either.

## Decisions

1. **Both are Posse-only to give** (`tribute:give` / `mark:give` in the authz policy — the same shape as `whisper:exchange`:
   a mutual Posse and no block either way). Viewing a Tribute or the Vibe Matrix follows the Ranch's own visibility, same
   as the Fence — no separate visibility setting was asked for.
2. **A Tribute always waits for approval — there is no fast path.** Unlike a Post Card (which only waits when Review is on,
   or is silently `held` for a Restricted writer), every Tribute from someone else starts `pending`. That is simpler and
   safer: approving one can never leak whether its author was Restricted, because there is no other route it could have
   taken. Non-published Tributes are visible only to their author and the owner (the owner sees all of them, in a waiting
   queue merged with the Fence's — `GET /api/me/tributes/waiting`; the public list only ever shows a stranger's own).
3. **At most one pinned Tribute per owner**, enforced by a partial unique index (`tributes_one_pinned_per_owner_idx`) —
   the same pattern as one `ready` Portrait per person (ADR-015). Pinning a new one unpins the old one in one transaction;
   only a `published` Tribute may be pinned (a second CHECK constraint, `tributes_pinned_published`).
4. **Marks are an append-only log**, not a single row per pair: the Vibe Matrix is everything a person has ever received,
   by kind. But a rater may give one target only **one Mark — any kind — every 30 days**; a rolling window cannot be a
   unique constraint, so it is checked at write time, and the check-then-insert is one atomic statement
   (`insert … select … where not exists (…)`) so two racing requests cannot both slip through.
5. **Who gave a Mark, and which kind, is never shown beyond the target.** The Ranch's Vibe Matrix is the aggregate count
   per kind and nothing else — no per-Mark rows, no leaderboard, no cross-person comparison (C11). The recipient does get a
   Chime ("X gave you a Mark") naming the giver — consistent with a Yo's Chime — but the Chime text never names the kind;
   the breakdown is the only place a kind is shown.
6. **Chimes**: `tribute_waiting` (actionable, like `card_waiting` — reaches the owner even if they have Restricted this
   Posse member, since Restrict limits routing, not the fact that Posse membership was used correctly), `tribute_approved`,
   `mark_given`. All three share one new preference category, `tributes` (covers Marks too — "Tributes & Marks" in
   Workshop). `notifications.card_id` stays `null` for all three (they are about a person, like `posse_requested` and
   `whisper_received`, not about a specific row), so a second Tribute or Mark from the same person before the first Chime
   is read just bumps the existing row rather than creating a new one.
7. **Retention**: a waiting Tribute nobody answers is dropped after 30 days, same as a Fence card (`purgeStaleTributes`,
   wired into `pnpm jobs:purge`). Marks have no retention — they are the whole point of the aggregate, and there is no
   sensitive detail in a row (no visibility, no content, nothing beyond two ids, a kind and a date).
8. **Rate limits fail closed**: reading matches the Fence (240/min signed in, 60/min anonymous); giving a Tribute is
   20/hour per person and 3/hour per (author, owner) pair; giving a Mark is 30/hour per person (the 30-day cooldown does
   the real work; this only stops hammering the endpoint itself).

## Consequences

- A restricted Posse member can still leave a Tribute or a Mark (Restrict limits what the owner is shown by default
  elsewhere, e.g. the Fence's `held` status; here Posse membership alone gates it, same as Whispers).
- The Vibe Matrix can look identical for two very different distributions once totals are small (e.g. 1 Chill vs. 1 Chill
  from a different pair) — this is intentional: nothing here is meant to distinguish individuals.
- No badges, streaks or "top Mark" language — the master prompt explicitly asks to avoid complex badges (§50) and public
  popularity rankings (§53/C11).

## Not in this phase

Tribute visibility settings separate from the Ranch's; Marks on Post Cards or anywhere but a Ranch; a history of who gave
what (by design); Mark categories beyond the five named in the mockup.

## Amendment, 2026-09-27 — the five Marks become traits

The five Marks are now **Gem** (rare, genuinely valuable), **Pure** (kind, trustworthy), **Chill** (calm, easygoing),
**Sharp** (smart, insightful) and **Bold** (confident, courageous). A Mark answers "what kind of person is this?", not
"what kind of post was that?". Cinema described a moment, not a person, and Sigma was slang that ages and means
different things to different people, so both are gone. Migration `0014` deletes their rows, which also ends those
givers' cooldowns (decided with the owner of the product). Popcorn-style reactions belong on Post Cards, as a later phase.

The matrix shows **earned counts until 20 Marks**, then the percentage bars: a handful of Marks makes percentages look
lopsided, and a wall of 0% looks empty. Each Mark has clay artwork (`public/art/mark-*.png`), cut from the design sheet
together with the future Post Card reactions (`react-*.png`). Only Yo's (`react-yo`) is in use so far.
