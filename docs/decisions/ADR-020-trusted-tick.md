# ADR-020 — The Trusted tick

Status: accepted (2026-09-28). Source: `blue-tick-feature-philosophy.md` (the product owner's proposal), reviewed against
the master prompt and ADR-016. Decisions taken with the product owner the same day: a separate earned tick (the team keeps
blue Verified), a checklist where every item must pass (not the proposal's weighted score), small-group thresholds.

## Context

The proposal: don't hand out a blue tick for Vibe Matrix popularity — friend groups would farm it. Instead, several
independent signals (identity, time, Pals, a spread of Marks, clean record, activity) must agree. Three things in the
codebase shaped how it was built:

- The blue **Verified** badge already exists and means "the Howdy team account", which is also unblockable. A member's
  earned tick must never look like it, and must not reuse the `verified` flag (that would make them unblockable too).
- Master prompt §32: "Do not rely on a single trust score"; §50: no complex badges or public popularity rankings; C11:
  no cross-person comparison. So no score is computed, stored or shown.
- Marks (ADR-016) are an append-only log: one rater may give the same person a Mark every 30 days, so "one Mark per
  category per person" has to be enforced by counting **distinct givers**, not rows.

## Decisions

1. **A checklist, all must pass** (`TRUST_RULES` in `src/modules/trust/service.ts`, the one place to tune it):
   email confirmed · account ≥ 30 days · a Portrait · ≥ 3 active Pals · Marks from ≥ 5 different people in the last
   365 days · ≥ 2 kinds each chosen by ≥ 2 different people · signed in within 30 days · no upheld report in 180 days.
   Sized for a small group; raise the numbers as Howdy grows (the proposal's "50 givers, Gem ≥ 20" were unreachable).
2. **Which Marks count**: from a giver whose account is active and at least 14 days old, given within the window. One
   giver counts once, however many Marks they gave — which also neutralises A↔B repeat farming.
3. **Only upheld reports count** (`reports.status = 'actioned'`). An open report counts for nothing: anyone can file
   one, so it would let anyone strip someone's tick, and a tick vanishing would reveal that a report exists.
4. **Stored decision, not live computation**: `trust_ticks (user_id, earned_at, checked_at)` caches pass/fail only.
   Showing the tick is an `exists` sub-select in the profiles module's existing person queries. `earned_at` keeps the
   first date while the tick is held.
5. **When it is re-checked**: at once after a Mark is received or a Pal accepted (domain events); on a visit to the
   person's Porch if the decision is over 6 hours old; every time the owner opens their own Porch; and daily by the
   retention job for anything over a day old (so losses from inactivity or aged-out Marks happen without visits).
6. **Who sees what**: everyone who can see a person sees only the tick. The checklist, with progress for countable
   items, is shown to the owner alone on their own Porch. No numbers about anyone reach anyone else.
7. **Look**: a gold scalloped seal with a tick (`TrustedBadge`), titled "Trusted · earned from Pals", read by screen
   readers as "(Trusted)". `NameBadge` shows Verified for the team, else Trusted, never both. The team account is never
   checked and never shows the Trusted tick.

## Not in this phase

A Chime when the tick is earned or lost; the proposal's spike-review and reciprocal-ring detection (distinct-giver
counting covers the simple case; rings need the moderation queue, still parked); "Verified+" identity checks; showing
the tick in Pals lists (the team badge is not wired there either).
