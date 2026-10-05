# Whispers — threat model

Written 2026-10-05, from the list in `master-prompt-chat-service.md` §61 (ADR-036 asked for it whether or not a
Phoenix service is ever built). It covers Whispers as they run in production today: the HTTP API in the Next app,
Postgres (Neon, Singapore) as the only store, Ably as a word-free doorbell (ADR-035), Chimes + Web Push for people who
are away. The self-hosted socket server (`pnpm ws`, ADR-013) is in the code but not deployed; it is covered where it
differs.

**What we protect, in order:** (1) the words; (2) who talks to whom, and when; (3) protections staying invisible to the
person they are used on (block, Restrict, mute, receipts off); (4) the service staying up.

Each row says what stops it, where, and what is left over. "Tested" names the test that fails if the protection goes.

## Account and session

| Threat | Mitigation | Left over |
| --- | --- | --- |
| **Account takeover** (guessing, stuffing, reset abuse) | Passwords hashed (`auth/crypto.ts`); sign-in limited per address AND per account (30 / 15 min, 10 / 15 min); reset links 1 hour, single use; verification links 24 h. Tested: `tests/security/auth*.test.ts`. | **No MFA or passkeys** (deferred). A stolen password reads up to 7 days of Whispers. "Sign out other devices" exists. |
| **Token theft** — session cookie | `__Host-` cookie, `HttpOnly`, `Secure`, `SameSite=Lax`; only a hash is stored server-side; idle 14 days, absolute 60 days; logout / "sign out everywhere" / suspension revoke at once. | Malware on the device beats any cookie. |
| **Token theft** — Ably token | Signed per person, **subscribe-only to their own channel**, 1 hour, no clientId (`platform/live-ping.ts`). The channel name is a keyed HMAC of the account id, so it cannot be guessed or tied back to a person. | A stolen token keeps hearing *rings* (no words, no sender) for up to an hour after logout: the thief learns *when* Whispers arrive. Accepted: short, content-free, and it needs the token in the first place. |
| **Token theft** — push subscription | Bound to the session that made it; dropped when that session ends; endpoint host allow-list (no SSRF). Payload is a Chime ("@x whispered to you"), never words, and Web Push encrypts it end to end to the browser. Tested: `push.test.ts`. | The push service (Google/Apple/Mozilla) sees that *a* push was sent, not what it says. |

## Reaching a conversation

| Threat | Mitigation | Left over |
| --- | --- | --- |
| **Unauthorised channel join / IDOR** | There is no conversation id in any URL or answer: a thread is addressed by the other person's handle, and `whisper:exchange` (mutual Pals, no block, both active) is decided on **every** request (`whispers/service.ts` `access`). Strangers, pending requests, blocks, suspended accounts and made-up handles are the same 404. Ably channels can only be subscribed with a token we signed for that one channel. Tested: "who may whisper", "limits reveal nothing". | — |
| **WebSocket hijacking (cross-site)** | Ably: the token comes from `GET /api/live/token`, which needs the session cookie and returns JSON (no CORS), so another site cannot read it. Self-hosted `pnpm ws`: exact Origin check + live session before upgrade, session re-checked every 60 s. CSP `connect-src` names Ably only when it is configured. | — |
| **Message spoofing** | The sender is always the session's user; a body has no `from`. Ably's tokens cannot publish, so nobody can ring someone else's bell (and a ring carries nothing to forge). | — |
| **Replay / duplicate messages** | Per-sender `client_id` (unique per thread) makes a send idempotent: a replay returns the first message (200) and rings nothing. Per-thread `seq` under a row lock. Tested: "numbering and safe retries". | — |
| **CSRF** | Every non-GET route checks `Origin` (or `Sec-Fetch-Site`) against the site (`platform/http/csrf.ts`), plus `SameSite=Lax`. | — |
| **Internal service impersonation** | There is no internal service: the rules run in one process. The only outbound call is Howdy → Ably REST with the server-held key (Basic auth over TLS). | Whoever holds `ABLY_API_KEY` can ring any bell — but a ring makes the page ask Howdy, which checks everything. Worst case: pointless fetches. |

## Abuse

| Threat | Mitigation | Left over |
| --- | --- | --- |
| **Spam / message flooding** | 3 per 3 s and 120 / hour per person (spent *before* the target is looked up, so they reveal nothing), 60 / hour per thread; first-week budgets and auto-hold for new accounts (ADR-024); Restrict, Mute, Block, reports with evidence kept 1 year (ADR-025/026). Only Pals can Whisper at all. | Limits live in Upstash Redis and fail closed: a Redis outage stops sending, rather than letting floods through. |
| **Connection exhaustion** | Only the two Whispers pages open an Ably connection; Ably carries the load, not our servers. Free plan: 200 connections at once. | Beyond 200, new connections fail and those pages fall back to checking every 8 s. Measured in `scripts/loadtest` (see BUILD_STATUS). Revisit trigger in ADR-036. |
| **Resource exhaustion** | Bodies ≤ 280 characters, JSON bodies size-capped, pages ≤ 50 messages, the list ≤ 100 threads, held tray ≤ 200, token endpoint 60 / hour, all reads 240 / min. | — |
| **Malicious attachments** | Whispers carry no files. Links are plain text (React escapes it; no auto-linking, no previews). | — |
| **XSS** | Rendered as React text only, never HTML; strict CSP (no inline script); bidi overrides, zero-width and control characters refused (`whisperBodySchema`). | — |
| **Evidence destruction** *(found by this review)* | Was: either person could Burn a Thread, deleting it for both, even someone who had been **blocked or restricted** — wiping the held tray ADR-026 calls "where the evidence is". **Fixed by ADR-038**: their burn only clears it for themselves, indistinguishably. Tested: "Burn for me (ADR-038)", mutation-checked. | An abuser who is *not yet* blocked or restricted can still burn before the other person reports. That is Burn Thread working as designed; the other person can block first, then report. |

## Data

| Threat | Mitigation | Left over |
| --- | --- | --- |
| **Database compromise** | Neon: TLS, its own encryption at rest, the production role's password only on Vercel; the dev branch is schema-only with its own role (no member data). Whispers are deleted after 7 days. | Words are **not end-to-end encrypted** (said plainly in the Privacy Policy). Someone with the database sees up to 7 days of words. Deleted words also stay in **Neon's 6-hour restore window**. |
| **Information leakage — content** | Words never go to Ably, push, Chimes, logs (`body` is redacted in the logger) or analytics; moderators see only a reported Whisper. Data export follows the same visibility rules (ADR-037). | — |
| **Information leakage — metadata** | Ably sees a hashed channel, an IP and timing — never who. Restrict is invisible: held words look sent, ring nobody, never count as unread, never give "Seen", and (ADR-038) a restricted burn looks like a real one. Unread counts and the badge use the same filters as the list. Tested across "Restrict…", "Seen…", "limits reveal nothing". | "Seen" makes Restrict harder to hide than ADR-013's "no receipts" (accepted in ADR-021). |
| **Information leakage — protections** | Every error is the same 404 for a hidden and a missing person; limits are spent before lookups. | Timing differences between paths were not measured. |

## Not covered

Device compromise, a malicious browser extension, a compromised Vercel/Neon/Ably/Upstash account (protect those with
2FA on each dashboard), and legal requests (see the Privacy Policy).

## Follow-ups

1. MFA / passkeys (already deferred) — the biggest single gain against takeover.
2. Measure the Ably ring path against ADR-036's triggers — done with `scripts/loadtest/ably-ring.mjs`, see BUILD_STATUS.
