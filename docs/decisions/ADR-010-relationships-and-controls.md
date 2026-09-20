# ADR-010 — Relationships, private controls and reports (Phase 4)

## Context
Master prompt §24 wants relationships modelled explicitly ("not every relationship is a follow"), §31 wants Block / Mute /
Report / Restrict early, and Phase 3 left `relationshipOf()` as a stub. The hard part is not storing edges; it is that every
protective feature (block, decline, limits) can itself become a signal that tells the *wrong* person something.

## Decisions

**Separate concepts, separate tables** (`db/schema/relationships.ts`):
- **Posse** (`posse_links`): mutual. One row per pair, stored with the smaller user id in `user_low` (a CHECK enforces the order, so
  a pair can exist only once). Starts as a request; `requested → accepted | declined`. Each side may privately mark the other
  **Close** (per-side flags, only valid on an accepted link).
- **Scouting** (`scouts`): one-way, grants nothing; requires the right to view the target's Ranch.
- **Block / Mute / Restrict** (`user_controls`): private, directed. The target is never told.
- **Reports** (`reports`, new `moderation` module): foundation for the Phase 11 queue.

**One state for the policy, richer flags for people.** `relationshipOf(owner, viewer)` reduces to a single `RelationshipState`
with precedence BLOCKED > CLOSE_POSSE > POSSE > RESTRICTED > MUTED > REQUESTED > SCOUTING > PASSERBY. BLOCKED means *either* side
blocked. A muted or restricted Posse member is still POSSE (those controls limit interaction, not who may look). Person-facing
views (`RelationshipView`) carry only *my own* choices and never the other side's.

**Block is silent and two-way.** Neither person can open the other's Ranch (overriding "everyone"). Blocking ends the Posse,
pending requests and scouting in both directions in one transaction. Unblocking restores visibility, not the Posse.

**Nothing may reveal a block, a decline, or who exists.**
- The blocked person's read of the relationship is the same 404 as for a missing person.
- Asking to join a Posse of someone who blocked you returns an ordinary-looking success and stores nothing.
- A declined request looks pending to the asker and cannot be re-sent for 30 days (also silent); cancelling it does not clear the cooldown.
- **Limits are spent uniformly.** Every ask that could create a link — including ones that reach nobody (unknown call sign, suspended
  account, block, cooldown) — first spends the same daily budget (20 new asks/day) and pending cap (50 waiting). Otherwise an
  asker at their limit would see 429 for an ordinary target but success for a blocker or decliner. Found by reasoning about the
  design, then locked in by tests and three mutations that reintroduce the leak.

**Ask by call sign.** A posse-only Ranch is hidden, so a stranger has no button; a "limited card" would break *hidden ≡ missing*.
`/api/posse/ask` (the form on `/posse`) always answers the same 202, whatever the target.

**Module boundaries.** `relationships` works on user ids only and depends on `authz` alone; it never reads `users` or
`profiles`. `profiles` provides `resolveHandle`, `getCards`, `mayViewRanch`; the app layer (`src/app/_lib/social.ts`, `/api/*`)
composes them. `moderation` stands alone. `auth → profiles → relationships → authz`; enforced by lint, tested.

**Policy.** New action `user:interact` (deny if anonymous, self, a block either way, or a non-active account). Undoing (leave,
decline, unblock, unmute…) is never gated. The service also enforces it on its own, so a race between a block and a request
cannot slip through (defence in depth, tested by simulating the race).

**Reports.** Repeating a report while one is open is a silent no-op (unique partial index on open reports); 10 a day; details
may contain links (evidence) but never bidi / invisible characters; a blocked person can still report the blocker; rows use
`SET NULL` so evidence outlives either account.

**Bounds.** Lists are capped at 100 per kind (`truncated` flag); cursor paging arrives with the Fence. Actions are idempotent.

## Alternatives considered
A single "follow" table (loses the product's point); one row per direction for Posse (two rows can disagree); telling a blocked
person "you cannot do that" (detectable); reporting through the relationships module (couples moderation to it); a limited card for
private Ranches (breaks hidden ≡ missing); rate-limiting only real targets (leaks blocks at the limit).

## Consequences / gaps
- A blocked person sees "Requested" for a request that was never stored. This is deliberate deception in service of safety.
- A declined request also lingers as "Requested" for the asker indefinitely (30-day cooldown, then they may ask again).
- Mute and Restrict are recorded and shown to their owner but have no effect yet (nothing to mute until the Fence and Whispers).
- The 20/day budget is per account; determined harassers can use several accounts (moderation, Phase 11).
- Not yet: Posse size cap, request expiry, "people you may know", notifications (Phase 6), suspension/deletion clean-up of links.
