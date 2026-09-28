# ADR-022 — Installing Howdy, and notifications while it is closed (Web Push)

Status: accepted (2026-09-28). Decided with the product owner the same day ("build it next"). Closes the "push
notifications" item that ADR-013 listed as not in that phase.

## Context

Two reports from phones: no dot on the Howdy icon when something happens while the app is closed, and some mobile Chrome
browsers never offer to install Howdy. Both need a service worker, which Howdy did not have; the dot also needs Web Push
(Android draws it for any notification the app leaves in the tray).

## Decisions

1. **A minimal service worker** (`public/sw.js`): shows pushes and opens the right page on tap. It caches nothing and does not
   handle `fetch`, so it can never serve a stale page or one person's page to another. Tap targets are forced to same-site
   paths. CSP gains `worker-src 'self'` (under `'strict-dynamic'`, `script-src` ignores `'self'`) and `manifest-src 'self'`.
2. **Installing:** the manifest gains `id`, `scope` and a maskable icon. `PwaBoot` (in every page's shell) registers the worker
   and keeps Chrome's `beforeinstallprompt` for our own **Install Howdy** button (Chimes page, "Howdy on your phone"). Where no
   browser offer exists (iPhone, many Android browsers) the card shows the menu steps instead of nothing.
3. **Push is a module (`push`)** that owns devices and sending and depends on no other module. **What** is worth a push is
   decided by `notifications`: a push goes out only when `deliver()` stored (or re-rang) a Chime, after every existing filter
   (block, mute, Restrict, switched-off kinds), and its words are produced by the same read-time `visible()` + `describe()`
   as the Chimes list. So a push can never say more than the bell, and never carries anyone's words (a Whisper push says
   "Sneha whispered to you."). Tags collapse repeats (one per thread / per card).
4. **Devices are bound to the session that subscribed** (`push_subscriptions.session_id`, migration 0018). Pushes go only to
   devices whose session is live, so logout / "log out everywhere" / expiry silence the phone at once, and a shared phone
   never shows the previous person's Chimes. Every app start re-sends the subscription, which re-binds it to whoever is
   signed in now; the same endpoint always has one row. At most 10 devices per person; 404/410 from a push service forgets
   the device; the daily purge forgets devices of dead sessions.
5. **SSRF:** the server POSTs to a browser-supplied URL, so endpoints must be https on an allowlisted push-service host (FCM,
   Mozilla, WNS, Apple), no port, no credentials, ≤ 1024 chars — checked before anything is stored.
6. **Keys:** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (both or neither; unset = push is off and the switch is hidden) and
   `VAPID_SUBJECT` (defaults to the privacy contact). The private key lives only in server env.
7. **Badge:** the push carries the unread Chime count; the worker calls `setAppBadge` where supported. Opening Howdy closes
   the notifications it left and resets the badge.

## Consequences

- Push services (Google, Mozilla, Apple, Microsoft) carry each notification, end-to-end encrypted (RFC 8291); they see that a
  push happened, not what it says. Worth a line in the Privacy Policy.
- iPhone: notifications only after "Add to Home Screen" (iOS 16.4+); the card says so.
- `beforeinstallprompt` is captured after hydration; if a browser fires it earlier on that page load, the card shows the
  menu steps instead of the button.

## Tests

`tests/security/push.test.ts` — session + same-origin, SSRF allowlist, device cap, own-device-only unsubscribe, Chime text
without words or ids, nothing pushed for Restrict / mute / switched-off kinds, logout silences, handed-over phone, 410 and
purge. Mutation-checked: dropping the live-session filter and disabling the host allowlist each fail a test.
