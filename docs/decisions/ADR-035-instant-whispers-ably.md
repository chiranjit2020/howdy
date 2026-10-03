# ADR-035 — Instant Whispers through Ably (a doorbell, not a mailbox)

Status: accepted (2026-10-02). You chose Ably over running our own WebSocket server (ADR-013's `pnpm ws`), which would
need an always-on host outside Vercel and, because the session cookie is `__Host-`, the same hostname as the site.

## Context

Without a live connection an open Whisper thread checks for new messages every 8 seconds. Firebase/Firestore could make
them instant by storing Whispers there, but that would put private words with a third party and force the block /
Restrict / 7-day rules to be rebuilt in its rule language. OneSignal only sends notifications (which Howdy already does).

## Decision

1. **Ably carries only a ring.** After a Whisper is stored (`whisper.sent`), the server POSTs `{ "name": "ring" }` to
   Ably's REST API on the person's channel. No words, names, handles or ids. The browser, on a ring, fetches what is new
   from Howdy's own API (`GET /api/whispers/:handle?after=` or a list redraw), with every check as before.
2. **Who is rung:** the recipient (unless the words are held because the recipient Restricted the sender — then the
   recipient hears nothing, as with Chimes) and the sender, for their other devices.
3. **Channels say nothing:** `u:` + a keyed HMAC of the account id (key = the Ably secret), so a channel cannot be
   guessed or tied back to a person. Ably is never given a clientId.
4. **Browsers can only listen to their own channel.** `GET /api/live/token` (session required, 60/hour) returns an Ably
   token request signed on the server: capability `{ "<own channel>": ["subscribe"] }`, 1-hour TTL. The key's secret
   never leaves the server. No server SDK — plain fetch and Ably's documented token-request MAC (as with Resend).
5. **Only Whispers pages connect** (the thread and the list), and Ably's library is loaded only there — this keeps
   connections well inside the free plan (200 concurrent) and the rest of the app light. Back from a gap (sleep, lost
   signal), the page asks once in case a ring was missed.
6. **Everything degrades to today.** No `ABLY_API_KEY`, or Ably unreachable: no connection; the thread keeps checking
   every 8 s. While the bell is connected it stops routine checking (it still checks while waiting for "Seen", which is
   not rung — a ring on read could tell a restricted sender when they were read).
7. **CSP** allows Ably's hosts (`*.ably.net`, `*.ably-realtime.com`, https + wss) only when a key is set.
8. **Privacy Policy 1.8.0** lists Ably as a provider and what it sees (a browser's connection, never who or what).

## Setting it up

Create an Ably app, copy its Root key (`appId.keyId:secret`), and set `ABLY_API_KEY` in `.env.local` and on Vercel
(Production). Redeploy. Nothing else.

## Consequences

- The self-hosted `pnpm ws` path stays in the code (unused in production) and works alongside.
- Free-plan limits (≈6 M messages/month, 200 concurrent connections) are far above current use; a ring is 2 messages
  per Whisper at most.
