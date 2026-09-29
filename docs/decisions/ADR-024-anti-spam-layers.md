# ADR-024 — Anti-spam layers: first-week budgets and holding after many reports

Status: accepted (Phase 11, third slice, 2026-09-29).

## Context

Master prompt §32 asks for layered controls ("rate limiting + account age + relationship state + trust signals +
behaviour patterns + moderation") and warns against a single trust score. Rate limiting, relationship state (Pals,
Restrict, Fence posting rules) and moderation already existed. Account age was not used anywhere, and neither were
reports as a live signal.

Decisions taken with you (2026-09-29): **new-account limits**, **link safety** and **auto-hold on many reports**.

## Decisions

1. **First-week budgets, on top of everyone's limits.** An account under 7 days old has an extra daily budget per action:
   15 Post Cards, 40 replies, 150 reactions, 8 Pal requests, 200 Whispers, 1 Town Hall, 15 Town Hall invites
   (`NEW_ACCOUNT_RATE`). These are generous for a real person's first week and far too small for a spam run. They lift
   by themselves on day 8. Like every per-person limit, each one is spent **before** anything is looked up (lesson 5),
   so running out says nothing about whether a call sign exists. Tested with a made-up call sign.
2. **Link safety needed no new code.** Public text (Post Cards, replies, Porch text, names) has refused links since
   Phase 5 (`hasLink`). Whispers allow them, but a Whisper only ever goes between Pals, and nothing anywhere in the app
   is rendered as a clickable link (plain text only, no autolinking). So `javascript:` / `data:` links have nothing to
   run in. A first draft held link-bearing cards from new accounts, but links never get that far, so it was dead code
   and was removed. The tests now pin the existing refusal for new and old accounts alike.
3. **Many reports → held, not removed.** When at least 3 **different** people have open reports against someone, filed
   in the last 7 days, the cards and replies that person writes on **other people's** Fences are stored as `held`. The
   Fence owner approves or removes them, the same way as for someone they have restricted. `held` looks posted to its
   writer (ADR-011), so the reported person cannot tell, and it says nothing about who reported them. Their own Fence
   is unaffected, and so is anything they wrote before. A Fence with Review on still says "waiting" honestly (`pending`
   wins).
4. **Decided at write time, no stored flag.** The count is taken when the card is written. So the hold lifts **at
   once** when a moderator closes enough of the reports, and by itself once the reports are a week old. There is no
   state to get stuck. Migration `0020` adds a partial index `reports(target_user_id, created_at) where status = 'open'`
   to keep the check cheap. One reporter cannot count twice: the check counts distinct reporters (ADR-025 lets one person have an open report per kind of thing).
5. **Moderators can see it.** Queue items carry `targetHeld`, and the card shows "Writing held for review" while it
   applies.
6. **Module boundaries.** The checks live in `moderation/anti-spam.ts`. `fence`, `relationships` and `whispers` may now
   import `moderation`, which still depends on nothing, so no cycle is possible (the lint-boundaries test says so).
   Test files that exercise everyone's general limits use `settledUser` (an account backdated a month), so the
   first-week budget does not trip first.

## Not in this slice

A behaviour score of any kind (§32: do not rely on one); CAPTCHA or phone checks at sign-up; per-network (IP) signals
beyond the existing sign-up limits; automatic suspension (a person always decides, §31).

## Verification

`tests/security/anti-spam.test.ts` (13 tests). Mutation run `.dev/mutate14.mjs`: 15 protections removed one at a time,
and all 15 were caught.
