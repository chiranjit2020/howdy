# ADR-008 — Authentication implementation (Phase 2)

Implements ADR-003 (first-party auth) and ADR-004 (opaque sessions). Records the decisions made while building it.

## Decisions

**Enumeration defence.**
- Sign-up returns the same `202 {ok:true}` for a new and an already-registered email. An existing address instead receives an
  "already have an account" email (or a fresh verification link if it was never confirmed). Handles are public, so "call sign
  taken" is reported normally.
- Login: unknown account and wrong password give the same status and body, and unknown accounts still verify against a real
  Argon2id dummy hash (same cost) so timing does not separate them. `EMAIL_NOT_VERIFIED` / `ACCOUNT_UNAVAILABLE` are revealed
  only *after* the correct password.
- Forgot-password and resend always answer `202`; the lookup and the email happen after the response (`after()`), so response
  time does not depend on whether the account exists and a mail failure cannot change what the caller sees.
- Known limit: this makes timing *independent enough*, not provably constant-time.

**Tokens.** Sessions, email-verification and password-reset tokens are 256-bit random values; only their SHA-256 is stored. Email
tokens are single-use (atomic `UPDATE … WHERE used_at IS NULL … RETURNING`, safe under concurrent use), purpose-bound
(a verify token cannot reset a password), expire (24 h / 1 h), and a newer token replaces older ones. Confirming an email
requires an explicit button click (a POST), not merely opening the link, because mail scanners prefetch links and would burn the
token. Pages that carry a token set `referrer: no-referrer`.

**Password reset** revokes *every* session, verifies the email (the link proves mailbox control), does not sign the user in,
and emails a "your knock was changed" notice.

**Sessions.** 14-day idle / 60-day absolute expiry enforced server-side on every lookup; `last_seen` refreshes at most every 5
minutes. Login revokes any session presented with the request (fixation) and issues a new token. A suspended account's sessions
stop working immediately. Revoking a session by id is scoped to the owner in the SQL `WHERE`, so someone else's id and a
non-existent id are both a 404 (object-level authorisation without an oracle). No IP or raw User-Agent is stored; sessions keep
only a coarse label ("Edge on Windows") for the Open Gates list.

**Cookie.** `HttpOnly; SameSite=Lax; Path=/`, and in every production build `Secure` with the `__Host-` prefix (browsers then
refuse a Domain attribute). Plain unprefixed cookie only for a development server on http.

**Rate limits** (per source **and** per target; fail **closed**): sign-up 10/h per IP + 5/h per email; login 30/15 min per IP +
10/15 min per identifier; forgot / resend 10/h per IP + 3/h per email; token endpoints 20/h per IP. The per-identifier limit lets
an attacker temporarily throttle a victim's sign-in; that is accepted (throttle, not lockout). `X-Forwarded-For` is ignored unless
`TRUST_PROXY_HOPS > 0`, and then the entry appended by our own proxy (counted from the right) is used, never the spoofable
leftmost value. Keys hash the identifier/email; raw values never reach Redis or logs.

**Redis client.** The request-path client keeps ioredis' offline queue **enabled** (with 2 s connect/command timeouts). With it
disabled, the first request after a cold start raced the connection, failed, and — because the limiter fails closed — returned a
500. Found by the production-build e2e run; covered by `tests/integration/redis-client.test.ts`.

**Mail.** `Mailer` interface with console (dev), file (dev/e2e) and in-memory (tests) transports. **There is no production
provider yet:** a production build refuses to send unless `ENABLE_TEST_MAILER=1`, so verification/reset links are never silently
dropped or logged. Wiring a real provider is a deployment blocker (see BUILD_STATUS).

**Validation.** One set of pure Zod schemas (`src/shared/validation/auth.ts`) is used by the browser forms and re-run on the
server. Passwords: 10–128 chars, a small common-password denylist, no composition rules, must not contain the email local part or
handle (NIST 800-63B style). Control characters (NUL) are rejected in the login identifier. `z.config({ jitless: true })` because
Zod 4's `new Function` probe is reported as a CSP violation under our no-`unsafe-eval` policy.

**Audit log.** `audit_log` records signup, email_verified, login_success/failed, logout, logout_all, session_revoked,
password_reset_requested/completed. No IPs, tokens, passwords or message content (asserted by the table's exact column list).

## Alternatives considered
Auto-verify by opening the link (scanner problem); reveal "email already registered" (enumeration); JWT sessions (ADR-004);
lock accounts after N failures (DoS by an attacker); storing IPs for abuse handling (privacy; deferred until a concrete need).

## Consequences / known gaps
- No MFA, passkeys, trusted devices or "suspicious login" handling yet (schema leaves room: `credentials` is separate from `users`).
- Account deletion (`Burn the Deed`) is not implemented; `users.status = 'pending_deletion'` exists but has no flow.
- No email-change flow; no re-authentication step for sensitive actions.
- Argon2 parameters are the OWASP baseline (19 MiB); revisit against production hardware.
- The audit log has no retention job yet.
