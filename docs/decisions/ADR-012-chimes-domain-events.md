# ADR-012 — Chimes (notifications) and domain events

Status: accepted (Phase 6)

## Context

Phases 4 and 5 gave people ways to protect themselves (Block, Mute, Restrict, Review). A notification system is where those
protections are most easily undone: a "your card was approved" message can reveal a restriction, a badge count can reveal
activity from someone blocked, a slow response can reveal who was told. The master prompt also asks for Domain Events to be kept
separate from Notifications so future channels (push, email) can be added.

## Decisions

1. **Domain events** (`src/platform/events.ts`): `relationships` and `fence` emit events stated in ids only. Handlers run **after
   the response** (`runAfterResponse`), errors are logged and never reach the caller. So the response to the person who acted can
   never depend on who was told, and a failing listener cannot fail an action.
2. **A `notifications` module** (`authz`, `profiles`, `relationships` → `notifications`; nothing depends on it) turns events into
   rows. The only place that knows both sides is `src/app/_lib/wire-events.ts`, loaded by `src/instrumentation.ts` at server start
   (and by the test setup). No module imports another to notify.
3. **Rows store who did what to which card — never text, never anyone's words.** What a Chime says, where it links and whether it
   is shown at all is decided **when it is read**. A later block or mute, a suspended account, a removed card or a Fence the
   recipient can no longer read makes it vanish immediately. The **unread count uses the same filter as the list**, so a badge
   can never reveal hidden activity.
4. **Who is told** (write time): both people active; nothing for a block in either direction or a mute by the recipient; someone
   the recipient restricted rings only for things the recipient must act on (a card or reply waiting for approval); the
   recipient's per-kind preferences (posse / fence / replies / yo) apply.
5. **Nothing that reveals a restriction.** A held card (writer Restricted) and a pending card (Review) give the owner the same
   "waiting" Chime. Approving a *pending* card tells its writer; approving a *held* card tells them nothing.
6. **Declines are silent**: declining, and re-asking during the cooldown, ring nobody.
7. **One bell per thing.** Unique per (recipient, actor, type, card): switching a Yo off and on, or a second reply, cannot ring
   again. Only a fresh Posse ask/accept between the same two people re-rings (bounded by the existing 20/day ask budget).
8. **Retention:** read Chimes 30 days, unread 90 days (`pnpm jobs:purge`). Deleted with either person or the card.
9. Marking read only ever touches the caller's own rows; another person's id behaves exactly like an unknown id.
10. Keyset paging (shared `platform/cursor.ts`, moved out of `fence`), hidden people cannot stall paging, unread count capped at 99.

## Consequences

- The header runs an unread count on every page render (a handful of indexed queries); it is best-effort and never fails a page.
- Events live in process memory: with several server instances each handles its own requests' events (fine, they only write
  rows). A queue (and delivery retries) is a later decision when a second channel exists.
- No email or push delivery yet; the channel seam is the event subscription.
- Chimes carry display names (escaped as text). They do not quote card or reply text.

## Not in this phase

Email / push channels, digests, aggregation ("3 people gave your card a Yo"), realtime delivery (Phase 7), notifications for Tracks,
Whispers and Town Halls (they arrive with those features).
