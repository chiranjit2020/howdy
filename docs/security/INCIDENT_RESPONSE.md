# Howdy — Incident Response

Howdy is operated by one person. This plan is written for that reality: short, concrete, do-able alone under stress.
The guiding assumption (master prompt §56): **an attacker will eventually get something right — the questions are how
far they get, what they reach, how fast you notice, and how fast you contain it.**

> **Status:** drafted 2026-10-08, **not yet rehearsed**. Do a tabletop walkthrough of §3 (account takeover) once.

## 1. Roles & contacts

- **You** are the incident lead, operator and (where required) the reporter to authorities.
- **Keep handy** (store securely, NOT in this repo): logins + 2FA recovery for Vercel, Neon, Cloudflare, Resend, GitHub,
  Ably, Upstash; the Neon connection strings; a lawyer contact for data-protection/POCSO questions.

## 2. Severity

| Sev | Meaning | Examples |
| --- | --- | --- |
| **SEV-1** | Active compromise or data exposure | DB breach, operator/admin account takeover, secret leaked publicly, CSAM found, RCE being exploited |
| **SEV-2** | Serious but contained/limited | One user account takeover, a high-sev vuln reachable but no known exploitation, targeted abuse |
| **SEV-3** | Minor / suspected | Rate-limit spikes, isolated spam, a vuln not yet reachable |

First action for any SEV: **write down the time and what you saw.** A running timeline is the single most useful
artifact later.

## 3. Playbook — Account takeover (user or operator)

```
Detect → Contain → Eradicate → Recover → Review
```

1. **Detect.** Signals: `login_success` from an odd context, a burst of `login_failed` then a success, unexpected
   `password_reset_completed` / `two_step_off` / `passkey_added` in the audit log, user report.
2. **Contain.**
   - Revoke the account's sessions (logout-all path / delete its `sessions` rows). This is the fastest kill switch.
   - If **operator/provider** account: rotate that credential immediately and sign out all sessions there; this is SEV-1.
3. **Eradicate.** Force a password reset; if 2-step was turned off or an unknown passkey/app was added, remove it and
   re-enrol. Check the audit log for what the attacker did while in.
4. **Recover.** Restore any changed profile/content. Confirm 2-step is back on.
5. **Review.** How did they get in (phish? reused password? no 2FA?) and what one change prevents a repeat.

## 4. Playbook — Data exposure / suspected breach (SEV-1)

1. **Detect & record scope** — which data, how many users, via what path.
2. **Contain** — close the path: pull the leaked secret and **rotate it** (DB URL, R2 keys, AUTH_SECRET, VAPID, Ably,
   Resend); if a bad deploy, roll back on Vercel; if a query/endpoint, hotfix or disable it.
3. **Preserve evidence** — snapshot logs/audit entries **before** cleanup; keep the timeline.
4. **Assess notification duty** — India's DPDP Act and the IT Rules may require notifying affected users and/or the
   authority. **Call your lawyer** — don't guess the obligation or the deadline.
5. **Remediate & review** — fix root cause, add a test that would have caught it, update ATTACK-MAPPING / SCORECARD.

## 5. Playbook — Leaked secret

Most likely real incident. If a key is exposed (pushed to Git, pasted somewhere public, in a screenshot):
1. **Rotate it now** in the provider dashboard; update Vercel env; redeploy.
2. If it reached Git history, rotating is what matters (history rewrite is secondary — assume it was seen).
3. Check provider logs for use during the exposure window.
4. Record it in the security backlog.

> Prevention already in place: `.env*` gitignored, clean history (2026-10-08). A CI secret-scan (SCORECARD TODO) would
> add a safety net.

## 6. Playbook — Vulnerable dependency / RCE (e.g. the 2026-10-08 `next/og` case)

1. Confirm reachability (is the vulnerable code actually used? — as we did: `next/og` powers the share card).
2. Patch to the fixed version; **run full suite + build + e2e** before deploying (don't ship an untested bump).
3. Deploy; verify the affected feature live; record in BUILD_STATUS + SCORECARD.
4. If exploitation may have occurred, treat as SEV-1 data-exposure.

## 7. Playbook — CSAM discovered

Follow **`CSAM_RUNBOOK.md`** exactly: **block, quarantine (do NOT delete), do not view/forward, preserve metadata,
report to the authority, legal hold, then suspend**. This is SEV-1 and has legal obligations — your lawyer and the
runbook govern, not improvisation.

## 8. Detection (what to build — SCORECARD: TODO)

Telemetry exists today (append-only `audit_log`, Redis rate-limit counters). Turn it into alerts:
- `login_failed` spike per account or per IP → possible brute force/stuffing.
- `two_step_off` / `password_reset_completed` / `passkey_added` → confirm it was the real user.
- Sudden **mass actions** from one account (many cards/whispers/marks) → abuse or takeover.
- `RATE_LIMIT_TRIGGERED` volume → scanning/abuse.
- Deploy health + error-rate spike → bad release or attack.

Even a daily digest email of these counts would be a large step up from nothing.

## 9. After every incident
- Keep the timeline.
- Add a test or control that would have prevented or caught it.
- Update `ATTACK-MAPPING.md`, `SECURITY_SCORECARD.md`, and the security backlog.
- If it was close, run the §3 tabletop again.

_Last updated 2026-10-08. Review quarterly or after any incident._
