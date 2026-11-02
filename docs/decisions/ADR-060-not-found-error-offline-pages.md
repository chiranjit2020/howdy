# ADR-060 — Page not found, Something went wrong, You're offline

Status: accepted (2026-11-02). Asked for by you: 404 / 500 / offline pages (plan agreed 2026-11-01).

## Decisions

1. **One look for all three.** `StatusMessage` (src/ui/howdy/status-page.tsx): an Octicon in a sunflower circle, the
   page's h1, one or two plain sentences, a sunflower button for the main way out and a link button for the other.
   `StatusPage` frames it like the sign-in pages (wordmark card, Terms · Privacy · Help), always Daylight.
2. **Page not found** (`app/not-found.tsx`): "This page doesn't exist, or it isn't shared with you." It stays the same
   page for a missing address and for a profile, message thread or group the viewer may not see, so it never reveals
   that something hidden exists. "Go to Home" goes to `/` (Home when signed in, the welcome page otherwise). Still a
   real 404 status (tests/e2e/not-found.spec.ts).
3. **Something went wrong**, three error boundaries (Next 16 passes `retry()`, which re-fetches; `reset()` does not):
   - `app/(app)/error.tsx`: inside the signed-in shell, so the menu stays; the message sits in Home's frame.
   - `app/error.tsx`: every other page (profile, settings, welcome, legal, sign-in), as a page of its own.
   - `app/global-error.tsx`: the root layout itself failed; its own `<html>`, styles and font, and "Go to Home" is a
     plain link (full page load) in case the app's navigation is what broke.
   Only `error.digest` is shown ("Ref: …", matches the server log). Never the message: in production it is generic
   for server errors anyway, and a client error's message could hold anything.
4. **You're offline**: `public/offline.html` + `offline.css`, no script (the app's scripts are not there offline, and
   CSP allows only `'self'` styles, so no inline styles either). "Try again" is a link to the same address.
5. **The service worker keeps only that page** (amends ADR-022, which had it cache nothing). On install it stores the
   offline page, its stylesheet, the wordmark and the icon in `howdy-offline-v1`; on activate it deletes any other
   cache. It answers a page load only when `fetch` rejects (no connection at all); any answer from the site, a 404 or a
   500 included, is shown as sent, and it never stores a response from the site. So it still cannot show a stale page
   or one person's page to another. Non-GET requests, API calls and assets go straight to the network. Navigation
   preload is on, so watching page loads costs no time.
