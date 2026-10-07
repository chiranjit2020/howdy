# CSAM Detection & Reporting Runbook

> **Status: NOT YET IMPLEMENTED.** This is the plan. Nothing in here is live. Items marked **[you]** are account/legal
> actions only you can take; items marked **[code]** are engineering work we can do together once you've decided on a
> provider. **This document needs review by a lawyer familiar with Indian law (POCSO Act 2012, IT Act 2000 and the IT
> Rules 2021) and, if you take US users or use US providers, US reporting law (18 U.S.C. §2258A).**

## 1. What this is and why it matters

CSAM = Child Sexual Abuse Material. The moment Howdy lets people upload photos — Portraits, Post Card photos, Town Hall
post photos, and now **Stories** — it can be used to store or pass around this material. Every serious platform must be
able to **detect known CSAM, stop it, preserve the evidence, and report it** to the proper authority.

This is not optional and it is not only an ethical duty — it is a legal one:

- **India (where most of your users are):** the **POCSO Act** criminalises storing/transmitting child sexual abuse
  material; the **IT Act** and **IT Rules 2021** place due-diligence and takedown duties on intermediaries. An
  intermediary that takes no reasonable measures risks losing safe-harbour protection.
- **United States (if you have any US users, or because your providers are US-based):** US law requires providers to
  report apparent CSAM to **NCMEC's CyberTipline** once they obtain actual knowledge. US providers (Cloudflare, Vercel,
  OpenAI) have their own obligations too.

> **Howdy is run by you as an individual.** That makes getting this right personally important. The goal of this runbook
> is that you are never the person who "knew and did nothing."

## 2. Why your current photo check is NOT this

Your pipeline already runs an **AI content check** (ADR-039, `src/platform/photo-check.ts`, backed by OpenAI's
moderation) that looks at a 512px copy of each processed photo for **sexual / violent / self-harm** content in general,
and holds or refuses it. That is good and worth keeping — but it is **not CSAM detection**, for two reasons:

1. It is a *general-content classifier*, not a match against **known-CSAM hash databases**. CSAM detection works by
   comparing a robust fingerprint (hash) of each image against lists of already-identified material maintained by
   NCMEC, the Internet Watch Foundation, Project Arachnid, etc.
2. It produces **no legal report trail**. CSAM handling has strict rules about preservation and reporting (below) that a
   "hold for a moderator" flow does not satisfy.

So this is a **new, parallel layer**, not a tweak to the existing check.

## 3. Where it has to live in Howdy — and why not "just turn on Cloudflare"

A natural first thought is "enable Cloudflare's CSAM Scanning Tool." **That tool scans images served *through
Cloudflare's CDN/cache* as public assets.** Howdy does not serve photos that way:

- Uploads land in **R2** under a random key (`incoming/<uuid>`), then the processed WebP is stored under another random
  key (`src/modules/media/service.ts`).
- Photos are served **privately, through your own Next.js routes** (`/api/stories/:id/photo`, `/api/hall-posts/:id/photo`,
  the Portrait/card routes) which check "may this viewer see it?" on every request and read the bytes from R2. They are
  **never** exposed as public, Cloudflare-cached image URLs.

Because of that, Cloudflare's CDN-based tool would **never see** your images. The reliable place to detect CSAM in
Howdy is **server-side, at the same point as the existing content check** — one hook, run once per upload, before the
photo is ever shown to anyone.

```
upload → sharp re-encode (strips EXIF/hidden data) → [ existing AI content check ]
                                                     → [ NEW: CSAM hash-match ]  ← add here
   match? → block + quarantine + preserve + report   (never "hold for a moderator")
   clean? → continue as today (ok / hold / refuse)
```

The integration point is `checkPhoto()` in `src/modules/media/service.ts` (it already receives the processed bytes and
can short-circuit the upload). **[code]**

## 4. Choosing a detection provider **[you + code]**

You need access to known-CSAM hash matching. Realistic options for a small platform:

| Option | What it is | Notes |
| --- | --- | --- |
| **Thorn Safer** | Hosted CSAM classifier + hash-matching API built for platforms | Purpose-built, API fits our server-side hook; paid; apply for access. |
| **Microsoft PhotoDNA** | The long-standing CSAM hash-matching service | Free for qualifying platforms; requires an application and agreement. |
| **Project Arachnid (C3P)** | Canadian hash-matching service/API | Non-profit; worth contacting. |
| **Cloudflare CSAM Scanning Tool** | CDN-based scanning | **Only** useful if you later serve some images as public Cloudflare-cached assets; does not cover today's private R2-served photos. |

> I **cannot** sign you up for any of these — each requires an application, identity/eligibility checks and a legal
> agreement that only you (as the operator) can enter into. Pick one, apply, and get the API credentials. Then the code
> integration is small and we do it together.

Treat the provider's API key like your most sensitive secret: it lives only in Vercel's environment variables, never in
Git (your `.env` files are already gitignored, verified 2026-10-08).

## 5. What happens on a match — the operational rules

These rules matter as much as the detection. **Get legal review on the specifics**, but the shape is standard:

1. **Block immediately.** The upload never becomes visible to anyone. In Howdy terms: the `media` row never reaches
   `ready`/visible; return the same generic "we could not use that photo" error — **do not tell the uploader why** (it
   tips off offenders and can impede investigation). **[code]**
2. **Quarantine, do not delete.** **Do not delete the file** on a match. Deleting evidence of a crime can itself be an
   offence and destroys what authorities need. Move/lock it to a restricted quarantine location with access limited to
   you. Your normal `purgeDetachedCardPhotos` / retention jobs must **skip** quarantined objects. **[code]**
3. **Do not view, copy, download or forward it** beyond what the automated system did. Never put it in a Whisper, email,
   screenshot or chat (including to me). Handling it further can create new legal exposure.
4. **Preserve a record** (not the image): the detection event, timestamps, the matching provider's response/identifier,
   the uploader's account id, IP, and the object key — in an access-controlled audit entry. Your audit-log mechanism
   (`auditModAction`, append-only) is the right home for the *metadata*. **[code]**
5. **Report promptly** to the proper authority:
   - **NCMEC CyberTipline** (`report.cybertip.org`) if US law applies to you or your providers.
   - In **India**, report to the **National Cyber Crime Reporting Portal** (`cybercrime.gov.in`) and preserve for law
     enforcement; your lawyer will confirm the exact obligation and timeline under POCSO/IT Rules.
   - Many providers (incl. Thorn/PhotoDNA partners) have a defined reporting path — follow it.
   **[you]** — reporting is a legal act you make as the operator.
6. **Preserve for the legally required period**, then follow the authority's instructions on disposal. Put a **legal
   hold** on that account's data so routine deletion (including the user's own "delete my account") does not erase it
   prematurely. **[code to support, you to decide the period with counsel]**
7. **Act on the account** per your Campfire Rules / Terms — typically immediate suspension — but **coordinate with the
   reporting duty** so you don't tip off the user before preservation/reporting is done.

## 6. Who does what

- **You (operator):** choose and apply to a provider; enter the legal agreements; be the named reporter to the
  authority; decide retention periods with a lawyer; hold the quarantine access.
- **Engineering (us, when you're ready):** wire the hash-match into `checkPhoto()`; add the quarantine bucket/prefix and
  make retention jobs skip it; add the audit event and the legal-hold flag; make the block path silent to the uploader;
  write a security test that a *known test fixture* (providers supply benign test hashes/vectors — never real material)
  is blocked, quarantined and recorded.
- **Nobody** ever handles suspected material manually beyond the automated flow.

## 7. What to do **right now** vs. later

**Now (no code, high value):**
1. **[you]** Apply to Thorn Safer and/or PhotoDNA for hash-matching access. This is the long-pole item (applications take
   time), so start it today.
2. **[you]** Have a lawyer confirm your POCSO/IT-Rules obligations and the India reporting path, and the retention period.
3. **[you]** Confirm your Terms/Campfire Rules already prohibit this material and state that you report it (they should).

**When you have provider access (small code effort):**
4. **[code]** Integrate the hash-match at `checkPhoto()`, add quarantine + legal-hold + audit, make the block silent,
   and add the test. Then this document's status changes from *planned* to *live*, recorded in `BUILD_STATUS.md`.

## 8. Honest limitations

- **Hash-matching catches *known* material**, not novel images. The general AI check is a partial complement for novel
  content; neither is perfect. That is expected and is why the reporting/preservation discipline exists.
- **I am not a lawyer.** Every legal statement here is a pointer, not advice — your counsel has the final word on
  obligations, timelines and the exact reporting channel for India.
- **I cannot enrol you with any provider, file any report, or handle any suspected material.** Those are yours by law
  and by design.

---

_Drafted 2026-10-08. Owner: the Howdy operator. Revisit when a provider is chosen and after legal review._
