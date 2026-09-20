# ADR-013 — Whispers and the realtime process

Status: accepted (Phase 7). Builds on ADR-006 (Postgres is the truth; Redis only relays; 7-day retention; no E2E claim).

## Context

Whispers are the first feature where a connection lives for hours, words are private, and a mistake is unrecoverable. The risks
are: someone reaching a thread they should not (a stranger, a blocked person, a cross-site page riding your cookies), a
protection that is silently lost once a socket is open (block, session end), and protections that reveal themselves (a read
receipt or a "delivered" state is exactly the signal that would expose a Restrict).

## Decisions

1. **The rules live in a transport-agnostic `whispers` module** (`authz`, `profiles`, `relationships` → `whispers`). The HTTP API and
   the WebSocket process both call it, so authorisation, validation and limits are identical whichever way a Whisper arrives.
   HTTP is a complete path on its own; the socket only adds liveness.
2. **Who may whisper:** a mutual Posse and no block, decided in the single policy (`whisper:exchange`, verified against an
   independent oracle). Strangers, pending requests, scouting, blocks, suspended accounts and made-up call signs are all the
   same 404 (hidden ≡ missing). Mute and Restrict do not close a thread. Leaving the Posse or a block closes it for both people;
   the history returns if they become Posse again (until the 7-day retention removes it). The "request / accept for non-Posse"
   flow from the source discussion (C9) is **deferred**.
3. **Restrict is invisible to the restricted sender.** Their words are stored `held`: they look sent to the sender (same response,
   own devices still get live copies), and are never shown to, counted for, rung for or pushed to the recipient. The recipient
   currently has no way to view held words (a "held" tray is a later moderation decision — see Known issues).
4. **No read receipts, no "delivered/seen".** Each side stores how far *they* have read, private to them. Any receipt would also
   distinguish a restricted sender (never read) from everyone else. Statuses shown are only *Sending / Sent / Not sent*.
5. **Numbering and idempotency:** every message has a per-thread `seq` assigned under a row lock (concurrent sends are ordered and
   never collide) and a device-chosen `client_id`, unique per sender per thread. Retrying returns the first message (200, not a
   second 201), stores nothing new and rings nothing. This is what makes reconnects and double taps safe.
6. **Limits reveal nothing.** Per-person limits (3 per 3 s, 120/hour) are spent before the person is looked up; the per-thread
   limit (60/hour) only after access is confirmed. A blocked person, a stranger and a made-up call sign trip the same limits at
   the same moment (tested with 65 attempts).
7. **The realtime process** (`pnpm ws`, `src/realtime/server.ts`; a second entry point sharing the module code) checks, before a
   socket exists: the path, the **Origin** (exactly the site's own — a page on another origin cannot open a socket with your
   cookies), a **live session cookie**, and caps per person (5) and per address (20). After that: frames are ≤ 4 KB, text only,
   validated against one zod schema (versioned envelope `v/op/type/requestId/seq/serverTime/d`, master prompt §29), rate limited
   per connection (then disconnected), answered in order with a bounded queue; dead peers are dropped by heartbeat; slow readers
   are cut off. The session is **re-checked every `WS_REVALIDATE_SECONDS`** (60 by default): logout, "log out everywhere" and
   suspension close the socket (code 4408).
8. **Redis carries hints, not words.** After a Whisper is stored a domain event (`whisper.sent`) publishes `{conversationId, seq}`
   to the recipient's and the sender's channel. The realtime process then asks the module for that message *with a fresh
   authorisation check*, so someone blocked after their socket opened receives nothing (tested by publishing the hint for an
   existing message after a block). Redis never holds message content.
9. **CSP** allows exactly one socket origin, `WS_PUBLIC_URL` (previously `connect-src` allowed any `wss:`); unset = no sockets.
   `WS_PUBLIC_URL` must be `wss` in production and share the site's *host* (the session cookie is `__Host-`, host-only).
10. **Client:** works without the socket (sends over HTTP with the same client id; polls `?after=` every 8 s when not live),
    reconnects with exponential backoff and jitter, and catches up with `whisper.sync` / `?after=` after every reconnect.
11. **Retention:** 7 days (`pnpm jobs:purge`), "Burn Thread" deletes the thread for both people at once (always allowed, same answer
    for a thread that never existed). Chimes: a "whispered to you" Chime (its own preference), hidden once the thread is closed.

## Consequences

- A person restricted by someone can find out only by asking the other person whether they got the message.
- The realtime process needs the same environment as the site plus Redis; without Redis nothing fans out (HTTP still works).
- Session re-validation touches the session like any request, so an open tab keeps a session "active" (the 60-day absolute limit
  still applies).
- Two processes and two connection pools: fine locally; use a pooled Neon connection string for both in production.

## Not in this phase

Non-Posse requests, group conversations (Town Halls), typing indicators and presence, attachments/media, message editing,
search, a held-words tray, push notifications, pinning a thread past 7 days.
