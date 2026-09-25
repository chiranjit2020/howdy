# ADR-017 — Town Halls (directory and membership)

Status: accepted (Phase 10). Decisions taken with you: directory + membership only this phase (no shared post feed
yet), any active member may create one, `open`/`members` both self-serve instantly and are both listed in the
directory, `invite` is never listed and needs the owner's invite plus the invitee's acceptance (2026-09-23).

## Context

Master prompt §61 Phase 10 is "Town Halls" (PRODUCT_DISCOVERY: `Town Hall → Community`), specified only as a name,
description and visibility (`open` / `members` / `invite`) with "deliberately no member counts or rankings"
(`TownHallCard`, already in the design kit from an earlier phase). There is no spec for a content model, who may
create one, or how discovery works — those were open product decisions, resolved with you before building.

## Decisions

1. **Directory + membership only.** No shared post feed in this phase (avoids building a second Fence-shaped
   moderation surface ahead of a proven need — master prompt §50). A feed can follow once real Town Halls exist.
2. **Any active, signed-in member may create one** (rate-limited: 5/day) — the same bar as posting a Post Card, no
   special role. The creator becomes its owner in the same transaction a Town Hall is ever visible.
3. **Visibility governs discovery, not the join rule**: `open` and `members` both let anyone active join with one tap
   and are both listed in the directory (`GET /api/town-halls`) — the distinct label is for the owner's own
   messaging. `invite` is never listed (hidden ≡ missing, the same pattern as a private Ranch) and reachable only
   through the owner inviting a call sign; the invitee must accept (mirrors the Posse request/accept shape) before
   they are a member. Declining, or never answering, leaves no trace the invitee can find later — there is no
   retention job for invites (no sensitive detail to expire: two ids, a role, a status).
4. **One owner, never transferred.** A partial unique index enforces at most one `owner` row per Town Hall. The owner
   cannot leave (must delete the Town Hall instead — `act('leave')` refuses with `BAD_REQUEST`); deleting the owner's
   account cascades and removes the whole Town Hall, not just their membership. Ownership transfer is not built.
5. **The roster is member-only, not public.** Anyone active may see a Town Hall's name/description/visibility badge
   (`open`/`members`) or, for `invite`, only once they have a membership row; but the list of *who* is in it
   (`GET /api/town-halls/:id/members`) is restricted to current active members — the same "hidden ≡ missing" 404 for
   everyone else. No response anywhere includes a member count (the directory card and detail both omit it on
   purpose, matching the Vibe Matrix's "no popularity ranking" principle, C11).
6. **Chimes**: `townhall_invited` (to the invitee) and `townhall_invite_accepted` (back to the owner), sharing one new
   preference category, `townhalls`. Neither Chime can name the specific Town Hall — `notifications.card_id` is
   `card`-shaped (FK'd to Post Cards only), so a generic person-scoped row is used instead (`card_id IS NULL`, same
   choice as Tributes/Marks, ADR-016); the Chime links to `/town-halls` generally, and the invites list there is
   authoritative for which one.
7. **Rate limits fail closed**, all per-action: reading matches the Fence (240/min); creating 5/day; joining, leaving,
   accepting and declining together 60/hour (spent even on an idempotent repeat, so hammering a no-op still costs
   budget); inviting 30/hour per person **and** 20/hour per Town Hall — the per-Town-Hall limit is deliberately
   *stricter* than the per-person one, otherwise an owner of several Town Halls could spend their whole per-person
   budget concentrated on just one of them.

## A bug this caught

`act()` originally re-read the Town Hall through `getTownHall()` (the same visibility-gated read the directory and
detail page use) to build its response. For `leave` and `decline` on an `invite`-only Town Hall, that re-read now
correctly finds no membership row and returns "not found" — which the action handler then mistook for a server error
and answered 500. Fixed by building the response from what the action already knows (the action just performed,
deterministically, so there is nothing left to look up) instead of re-querying through a gate the action itself just
closed. Caught by a mutation-adjacent test (`decline` on a real pending invite), not the mutation script itself.

## Consequences

- No calendar, no events, no roles beyond owner/member (`FUTURE FEATURES` explicitly defers community events, §49).
- `members` visibility is, today, identical in effect to `open` — only the label differs. If a real need for
  approval-gated joining appears, it is a new value or a new field, not a repurposing of `members`.
- A Town Hall's name/description are screened exactly like a Tribute (no links, no disguising characters) since they
  are shown to every signed-in member, unauthenticated or not yet a member.

## Not in this phase

A shared post feed; roles beyond owner/member; ownership transfer; a retention/purge job (nothing here is ephemeral
enough to need one); discovery by search or category; community events.
