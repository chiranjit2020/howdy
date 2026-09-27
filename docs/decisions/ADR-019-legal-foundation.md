# ADR-019 — Legal foundation: documents, versions, acceptance

Status: accepted (2026-09-27). Decisions taken with you: Howdy is run by **Chiranjit Karmakar, an individual, in
India**. The public contact is **privacy@howdy.chiranjitkarmakar.com** (it must receive mail before launch). The minimum
age is **18**, because India's DPDP Act 2023 requires verifiable parental consent for under-18s, which Howdy cannot
collect. **Existing accounts are asked once**, on their next visit.

## Context

Sign-up said "By continuing, you agree to our Terms of Service and Privacy Policy", but neither document existed and
nothing was recorded. The legal-foundation brief asks for a Privacy Policy, Terms, Community Guidelines ("Campfire
Rules") and a Cookie Policy, all versioned, with recorded acceptance and a footer on every page. It also rules out
placeholder text and any claim the product does not honour.

## Decisions

1. **Words in files, facts in code.** Each document is `content/legal/<slug>.md`, written in a tiny Markdown subset
   (`src/shared/legal-markdown.ts`): `##`/`###` headings, paragraphs, one-level lists, `>` notes, bold, and links.
   Everything else is literal text. The parser outputs data that React renders as elements, so no HTML string is ever
   injected, and unsafe link targets (`javascript:`, `//host`, `http:`, `data:`) become plain text. Facts that appear in
   several places (operator, contact email, minimum age, country, site) are `{{placeholders}}` filled from
   `LEGAL_FACTS`, and an unknown placeholder is an error. The files are read at runtime (every page is dynamic because
   the root layout reads the theme cookie), so `next.config.ts` ships them via `outputFileTracingIncludes`.
2. **Two versions per document** (`src/shared/legal.ts`). `version` is the number shown on the page, bumped for any
   change. `acceptVersion` is the version people must have agreed to, raised only for a material change. A typo fix
   therefore asks nobody again, while a real change asks everyone exactly once. Only Terms and Privacy carry an
   `acceptVersion`; Campfire Rules and Cookies are read, not agreed to.
3. **Acceptance is append-only history** (`legal_acceptances`, migration `0013`): one row per user, document and
   version, with a timestamp. The database refuses other document names and non-semver versions, and cascades with the
   account. Sign-up records the current versions inside the account-creation transaction. The client sends only
   `acceptTerms: true` (a Zod literal) and never a version; the server always records the current one.
4. **Asking again.** `AppFrame`, the shell of every signed-in page, runs `pendingAcceptances` alongside its other
   lookups (no extra round trip) and redirects to `/agree` while anything is pending. The legal pages and `/agree` opt
   out (`askToAgree={false}`), so the documents can always be read before agreeing. If the check itself fails, the
   person is let in rather than every page failing. APIs are not gated: this is consent to terms, not an authorisation
   rule, and a stale tab must not break mid-action.
5. **The promises had to become true.** The Privacy Policy states the retention periods (Whispers and Tracks 7 days,
   Chimes 30/90 days, etc.), but `pnpm jobs:purge` had never been scheduled, so expired rows were hidden, not deleted.
   It is now a daily Vercel Cron (`/api/jobs/purge`, 04:00 UTC, `CRON_SECRET` bearer as for the health report). A unit
   test fails if the policy's numbers drift from the code's constants, and another fails if the Cookie Policy names a
   cookie other than the two the code sets.
6. **Reading experience.** Each section is its own clay card. There is a sticky "On this page" list from `xl` up and a
   fold-out list below that; the current section is marked with `aria-current="location"`. Choosing a section scrolls
   smoothly (instantly with reduced motion), updates the URL hash and moves focus to the heading. A decorative native
   `<progress>` shows reading position (no inline styles, per the CSP). The footer ("Legal" nav) is in `AppShell`, so
   it appears on every page, signed in or out. Pages are indexable, with a canonical URL, Open Graph and Twitter
   metadata.
7. **Honest about what is not built.** There is no self-service account deletion or data export yet. Both are offered
   by email, with a 30-day promise, and the gap is flagged for legal review. Anything a lawyer must confirm is a
   visible "Needs legal review" note, which is not placeholder text: the surrounding text is complete and accurate.

## Before launch (owner's to-do)

- Make privacy@howdy.chiranjitkarmakar.com receive mail (for example, Cloudflare Email Routing to your inbox).
- Have a lawyer review every "Needs legal review" note, and fill in the court city in the Terms.
- Apply migration `0013` to production before deploying (sign-up writes to the new table).

## Verification

`tests/unit/legal.test.ts` (parser, registry, links, cookie list, retention figures),
`tests/security/legal.test.ts` (sign-up refusal and recording, re-acceptance, versions, cascade, DB checks, purge
cron auth), `tests/e2e/legal.spec.ts` (routes, metadata, headings, keyboard, 320/768 px, axe light and dark, the
sign-up checkbox, the `/agree` gate). Mutation run `.dev/mutate-legal.mjs`: 7 of 7 caught.
