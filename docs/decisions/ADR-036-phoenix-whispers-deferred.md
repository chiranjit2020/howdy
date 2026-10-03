# ADR-036 — An Elixir/Phoenix Whisper service: considered, deferred

Status: accepted (2026-10-04). You chose to finish Ably (ADR-035) and record this instead of building the service
described in `master-prompt-chat-service.md`.

## Context

The master prompt proposes a separate Elixir + Phoenix + OTP service that owns WebSockets, presence, typing and realtime
delivery for Whispers, with Node keeping users, relationships and product rules, and Neon as the store. Its own §64 asks
for the architecture to be challenged if the service is premature, and §65 says scaling decisions come from measurement.

What Howdy already has (Phase 7, ADR-013, ADR-021, ADR-024, ADR-026, ADR-035):

| Master prompt asks for | Already in Howdy |
| --- | --- |
| Postgres as the source of truth, survives restarts | Every Whisper is stored before anyone is told (ADR-006/013) |
| `client_message_id` idempotency | `client_id` unique per sender per thread; a retry returns the first message |
| Explicit ordering | Per-thread `seq` under a row lock |
| Channel/join authorisation, blocks as a hard boundary | One `whisper:exchange` policy; strangers/blocks/suspended = 404; every live delivery re-authorised |
| No duplicated rules between services (§41) | Rules live in one transport-agnostic `whispers` module used by HTTP and sockets |
| Read receipts that mean something | "Seen", reciprocal and switchable; never shown to a restricted sender (ADR-021) |
| Rate limits, abuse controls, moderation | Per-person limits, first-week budgets, auto-hold, held tray, reports (ADR-024/025/026) |
| Reconnect + missed messages, cursor history | `?after=` catch-up after a gap; cursor pages |
| Offline users | Chimes + Web Push (ADR-012/022) |
| Instant delivery | Ably ring on a keyed-hash, listen-only channel (ADR-035); 8 s polling if Ably is down |

## Decision

1. **No Phoenix service now.** Realtime stays as ADR-035: Ably rings, Howdy's own API serves the words.
2. **Reasons:**
   - Vercel cannot host a long-lived BEAM process, so it would need a second always-on host (and a bill) near Singapore.
     The session cookie is `__Host-`, so the service would also need the site's own hostname or a new token handshake.
   - Planned scale (~20k people, the Phase 13 decision) is far below what Ably's free plan carries for a word-free ring.
     Nothing measured so far points at the realtime path; the slow part was database distance (fixed by the Singapore move).
   - Phoenix would either re-implement block / Restrict / Pals / held rules (forbidden by the prompt's §41) or call Node
     for each of them, adding a hop and a second place to get security wrong.
   - A second language, toolchain and test suite on a 7.8 GB development machine.
3. **Keep the door open.** The `whispers` module stays transport-agnostic and the browser only ever hears "something
   new"; a future Phoenix (or any) realtime service would replace the ring, not the rules.

## When to revisit

Reopen this decision when any of these is measured (Ably dashboard → app stats; our logs for `live.ring_failed`):

- Peak concurrent Ably connections above **150** (75 % of the free plan's 200) on more than a few days a month, or the
  plan would need upgrading and its monthly price is more than an always-on small server near Singapore.
- Ring-to-screen time from India regularly above **1 s** at the 95th percentile.
- A product need Ably's ring cannot meet without sending words or identities to a third party — e.g. typing indicators
  or presence for Whispers (Porch Light covers "free to talk" today), or Whispers between non-Pals (ADR-013 C9, deferred).
- `live.ring_failed` warnings showing Ably as unreliable for Indian networks.

If reopened, the master prompt's plan still applies, with these constraints from this repo: Node stays the authority for
every rule (Phoenix asks an internal, authenticated endpoint); a short-lived signed token from Node opens the socket;
the existing `seq` / `client_id` / held / Seen semantics are kept as-is; and a load test (100 → 10,000 connections)
comes before any claim about scale.

## Consequences

- `master-prompt-chat-service.md` is kept as a reference, not a plan of record.
- Worth doing anyway, independent of Phoenix: a whole-of-Whispers threat-model write-up (prompt §61) and a staged load
  test of the ring path. Both are listed under Deferred in BUILD_STATUS.
