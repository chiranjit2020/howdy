# Howdy — Security Scorecard

A control is only **PASS** here if there is an actual test or documented live evidence behind it (per the master
prompt, §49). **PARTIAL** = the control exists but something named is missing. **TODO** = not built yet.

_Snapshot: 2026-10-08._

| Area | Status | Evidence |
| --- | --- | --- |
| **Authentication** | PASS | Argon2id (`memoryCost 19456, timeCost 2`, `src/modules/auth/crypto.ts`); email verification; secure password reset; `tests/security/auth-flow.test.ts`, `auth-tokens.test.ts` |
| **Two-step / phishing-resistant auth** | PASS | Passkeys (WebAuthn), TOTP, recovery codes; `tests/security/two-step.test.ts`, `passkey` helper, `auth` audit events |
| **Authorization (IDOR/BOLA, privesc, mass-assignment)** | PASS | Server-side `can()` policy; role only in `users.role`, set in DB; forbidden/made-up id = same 404; `tests/security/page-gates.test.ts`, `stories.test.ts`, `fence-policy.test.ts`, `ranch-edit.test.ts` |
| **Session security** | PASS | `__Host-` cookie, HttpOnly + Secure + SameSite=Lax (`src/modules/auth/request.ts`); 14d idle / 60d absolute, rotation, revocation, logout-all; `tests/security/auth-sessions.test.ts` |
| **CSRF** | PASS | `assertSameOrigin` before auth; live-verified three-way (no/foreign Origin→403, matching→401); `tests/security/csrf.test.ts` |
| **Input validation** | PASS | zod schemas on every route; byte-level image format check; link/disguise rejection on text; `tests/security/*` across features |
| **XSS protection** | PASS | React escaping; strict CSP (nonce + strict-dynamic, `object-src 'none'`, `frame-ancestors 'none'`); no raw HTML; `tests/security/csp.test.ts`; live header check |
| **SQL injection** | PASS | Drizzle parameterized queries throughout; no string-built SQL; `tests/security/*` exercise malicious input as data |
| **Upload security** | PASS (CSAM TODO) | sharp decode→re-encode, EXIF stripped, format allowlist by bytes, 24MP cap, AI content check, private serving; `tests/security/media.test.ts`, `photo-check.test.ts`. **CSAM hash-matching: TODO** (`CSAM_RUNBOOK.md`) |
| **Rate limiting** | PASS | Redis limiter (`src/platform/rate-limit`), layered by IP/account/action; new-account budgets; `tests/security/anti-spam.test.ts`, `redis-rate-limit.test.ts` |
| **Account enumeration** | PASS | Uniform signup/login/reset; `tests/security/auth-enumeration.test.ts` |
| **Abuse controls (spam, Sybil, reputation)** | PASS | Budgets, no self-mark, server-controlled Trusted tick, block/mute/restrict; `tests/security/marks.test.ts`, `trust.test.ts`, `suspensions.test.ts` |
| **Security headers** | PASS | CSP, HSTS (2y, includeSubDomains), X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP; live-verified 2026-10-07 |
| **Realtime / WebSocket (Whispers)** | PASS | Per-join authz; `tests/security/realtime.test.ts`, `live-ping.test.ts`; `docs/WHISPERS_THREAT_MODEL.md` |
| **Secrets** | PASS | env files gitignored, clean history (verified 2026-10-08); secrets in Vercel env only |
| **Dependency / supply chain** | PASS | `pnpm audit` clean (2026-10-08 patch); **CI gate** `.github/workflows/security.yml` fails push/PR on high/critical prod advisory, runs weekly |
| **Database security** | PARTIAL | Neon TLS-only, encrypted at rest, migration discipline; **restore test & least-priv app role: review** |
| **Redis security** | PASS | Upstash, authenticated, TLS, TTL'd; not durable storage; `tests/*/redis*.test.ts` |
| **Logging / audit** | PASS | Append-only `audit_log` with rich events (login_success/failed, session_revoked, password/2FA changes, moderation actions, account deletion); never logs secrets |
| **Detection / alerting** | PARTIAL | Security Center (`/admin/security`) + automated security alerts every 30 min (8 rules over `audit_log`, emailed to owner + admins, 6 h de-dupe). Gaps: no per-IP signals (by design), no error-rate alerts; runs only while the GitHub Health watch is authorised. See INCIDENT_RESPONSE.md §8 |
| **Incident response** | PARTIAL | `INCIDENT_RESPONSE.md` drafted 2026-10-08; not yet rehearsed |
| **CI/CD security gate** | PASS | `.github/workflows/security.yml`: dependency audit + gitleaks secret scan on every push/PR to main + weekly; local `pnpm check` + e2e before push |
| **CSAM detection & reporting** | TODO | Planned; `CSAM_RUNBOOK.md` |
| **Admin/operator account hardening** | PASS | 2FA on Vercel, Neon, Cloudflare, Resend, GitHub and the owner's Google account (owner-confirmed 2026-10-09; recovery codes kept offline) |
| **Infrastructure / cloud least-privilege** | PARTIAL | Vercel `sin1`, Neon SG, R2 private; **formal IAM/least-priv review: TODO** |

## Top priorities (ranked)
1. **[you + code]** CSAM hash-matching — start provider applications now (`CSAM_RUNBOOK.md`).
2. **[review]** DB least-privilege app role + a tested restore.

_Done 2026-10-08: CI security gate (dependency audit + secret scan) — `.github/workflows/security.yml`; automated
security alerts (`src/modules/admin/alerts.ts`, run by the health report every 30 min). Done 2026-10-09: 2FA on all
provider accounts; GitHub health watch fixed (matching `CRON_SECRET`)._

_Do not promote any row to PASS without a new test or documented evidence. Update alongside ATTACK-MAPPING.md._
