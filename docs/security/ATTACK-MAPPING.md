# Howdy — MITRE ATT&CK Mapping

Howdy is a web/PWA social app (Next.js/TypeScript on Vercel, Postgres on Neon, Redis, Cloudflare R2 for photos, Resend
for mail, Ably for realtime Whispers). It is **not** a Windows/AD/endpoint environment, so most Enterprise ATT&CK
techniques don't apply. This table lists only techniques with a **real attack path into Howdy**, the control that
reduces the risk, how we'd detect it, and the test that proves the control works.

Legend — **Status:** ✅ implemented & tested · 🟡 partial / in progress · ⬜ planned. "Test" points at the proof.

| ATT&CK | Technique | How it applies to Howdy | Control | Detection | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Reconnaissance** | T1595 Active Scanning; T1592 Victim host info | Attacker scans endpoints, reads error bodies/headers for stack/tech leaks | Generic error shape (`{code,message,requestId}`, no stack); minimal headers; rate limits | `RATE_LIMIT_TRIGGERED` (Redis counters); request logs | `tests/security/route-wrapper.test.ts`; live header check (BUILD_STATUS 2026-10-07) | ✅ |
| | T1589 Gather identity info (account enumeration) | Signup/login/reset reveal whether an email exists | Uniform responses; password hash runs even for unknown users (constant-time-ish); generic auth errors | `login_failed` audit events | `tests/security/auth-enumeration.test.ts`, `signup-email.test.ts` | ✅ |
| **Initial Access** | T1190 Exploit public-facing app | Vuln in Next.js / a dependency (e.g. the `next/og` RCE) | `pnpm audit`; prompt patching (next 16.3.8, sharp 0.35.5 on 2026-10-08); strict input validation | audit in CI (planned); dependency advisories | full suite + e2e gate before deploy | 🟡 (CI gate pending) |
| | T1566 Phishing | Attacker phishes a user's password | Passkeys (phishing-resistant), TOTP 2-step, generic errors | `login_success` from new context (telemetry exists, alerting ⬜) | `tests/security/two-step.test.ts`, `auth-flow.test.ts` | 🟡 |
| | T1078 Valid Accounts | Attacker uses stolen/legit credentials | 2-step sign-in; session TTLs (14d idle / 60d absolute); per-request authz | `login_success`, `session_revoked` audit | `tests/security/auth-sessions.test.ts` | ✅ (detection 🟡) |
| | Malicious upload (T1204-style) | Hostile image / polyglot / pixel-bomb via photo upload | sharp decode→re-encode (only pixels survive, EXIF dropped), format allowlist by bytes, pixel cap, AI content check | `photo_check.*` logs | `tests/security/media.test.ts`, `photo-check.test.ts`, `card-photos.test.ts` | ✅ (CSAM hash-match ⬜ — see CSAM_RUNBOOK.md) |
| **Credential Access** | T1110 Brute Force / password spraying / credential stuffing | Automated guessing at login/reset | Argon2id hashing; layered rate limits (IP+account+action); new-account budgets | `login_failed` rate; `RATE_LIMIT_TRIGGERED` | `tests/security/auth-abuse.test.ts`, `anti-spam.test.ts` | ✅ (alerting 🟡) |
| | T1539 Steal web session cookie | XSS or interception steals the session | `__Host-` cookie: HttpOnly + Secure + Path=/; SameSite=Lax; strict CSP (nonce+strict-dynamic); HSTS 2y | `session_revoked` | `tests/security/auth-sessions.test.ts`, `csp.test.ts`, `csrf.test.ts` | ✅ |
| | T1552 Unsecured credentials (secrets in repo) | Leaked API key / DB URL from Git | env files gitignored; clean history (verified 2026-10-08); secrets only in Vercel env | secret scanning (planned) | manual history check | ✅ (CI secret-scan ⬜) |
| **Privilege Escalation** | T1068 / T1548 abuse of elevation; mass-assignment to role | User sets `role=admin`/`verified=true` via a crafted payload | Server-side `can()`; role lives in `users.role`, set only in DB (no self-service); zod schemas never accept role/verified/trustScore | `grant` / `ROLE_CHANGED` audit | `tests/security/ranch-edit.test.ts`, `report-subjects.test.ts`, `trust.test.ts` | ✅ |
| **Defense Evasion / impersonation** | protective-feature abuse as a signal | Block/restrict/decline leak the protected fact | "protective features must not become signals" design rule enforced server-side | — | `tests/security/relationships-block.test.ts`, `lights.test.ts`, `stories.test.ts` | ✅ |
| **Discovery** | T1087 Account discovery (IDOR/BOLA) | Guessing ids to read others' Stories/Whispers/cards | Per-request authorization decided server-side; made-up/forbidden id = same 404; never trust client ids | audit on moderation reads | `tests/security/stories.test.ts`, `whispers.test.ts`, `fence-policy.test.ts`, `page-gates.test.ts` | ✅ |
| **Collection / Exfiltration** | T1213 Data from information repositories; T1530 Data from cloud storage | Reading another user's private data or pulling photos straight from R2 | Output DTOs (never raw rows); photos served only via auth'd app routes; R2 private (400 unsigned) | moderation/audit reads | `tests/security/data-export.test.ts`, `portraits-in-lists.test.ts`; live R2 check | ✅ |
| **Impact / Abuse** | Endpoint & resource abuse; reputation gaming (Vibe Matrix / Trusted tick) | Spam, mass-marking, Sybil farming of Marks/ticks | Rate limits; new-account budgets; no self-mark; server-controlled tick with thresholds | `RATE_LIMIT_TRIGGERED`; report volume | `tests/security/marks.test.ts`, `trust.test.ts`, `suggestions.test.ts`, `anti-spam.test.ts` | ✅ |
| **Application layer** | CSRF (request forgery) | Cross-site POST rides a logged-in cookie | `assertSameOrigin` runs before auth (no/foreign Origin → 403; verified live) | — | `tests/security/csrf.test.ts`; live three-way origin check | ✅ |
| | SSRF (T1190-adjacent) | A feature fetches an attacker URL and hits internal metadata | Howdy fetches no user-supplied URLs server-side; photos are uploaded bytes, not fetched | — | n/a (no fetch surface) | ✅ (by design) |
| | Realtime (Whispers) unauthorized channel join | Valid socket ≠ access to any conversation | Per-join authorization at the Ably/Whisper layer | join failures | `tests/security/realtime.test.ts`, `live-ping.test.ts`; `docs/WHISPERS_THREAT_MODEL.md` | ✅ |
| **Supply chain** | T1195 Compromise software dependencies | Malicious/vulnerable npm package | Lockfile; `pnpm audit`; pinned overrides; test+build gate before deploy | advisory monitoring | 2026-10-08 patch; see SECURITY_SCORECARD | 🟡 (automated CI audit ⬜) |

## Gaps this mapping makes explicit
- **Detection & alerting (🟡):** the *telemetry* exists (audit log + rate-limit counters), but there are no automated
  **alerts** yet (e.g. "spike in `login_failed`", "mass actions from one account"). See INCIDENT_RESPONSE.md §Detection.
- **CI security gate (⬜):** `pnpm audit` + secret scanning should fail the pipeline. Today the gate is the local
  test+build run before a push.
- **CSAM hash-matching (⬜):** general AI check only; see `CSAM_RUNBOOK.md`.

_Last updated 2026-10-08. Keep in step with SECURITY_SCORECARD.md and new ADRs._
