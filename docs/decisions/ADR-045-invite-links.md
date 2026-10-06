# ADR-045 — Invite links

**Context.** The welcome page (2026-10-06) is the link the owner shares on social media, and its roadmap promised
"more circles". Sign-up was open but anonymous: nothing connected a newcomer to the friend who brought them, so they
arrived to an empty Pals list and had to find that friend by call sign.

**Decisions (the user's, 2026-10-07).**
1. **Signing up through my link sends a Pal request to me** — I accept or decline. Nothing is granted automatically,
   so a link that travels further than meant (a public story, a forwarded message) cannot make strangers my Pals.
2. **One personal link per member, reusable, resettable.** Post it in a bio or a story. "Reset link" makes a new code
   and the old link stops working at once. A weekly cap per link (20 sign-ups) stops abuse.
3. **The link says "<Name> invited you to Howdy"** on the welcome page and on its preview card — the display name
   only: no call sign, portrait or anything else from the Porch.

## How it works
- New module `invites` (depends on profiles and relationships). Tables `invite_links (user_id, code)` and
  `invitations (invitee_id, inviter_id, created_at, redeemed_at)`. Migration `0037_invites`. Codes are 10 characters
  from an alphabet without look-alikes (no 0/O, 1/l/I), drawn with `crypto.randomInt`.
- **The page** `/i/<code>` renders the welcome story (now `WelcomeStory`, shared with `/welcome`) with the inviter's
  name in the line above the headline; every way in links to `/stake-a-claim?invite=<code>`. A made-up, reset or dead
  link (or a suspended inviter's) shows the plain welcome page — it never says the link is wrong. `noindex`. Its preview
  card is drawn per link (`share-card.tsx`, shared with /welcome); a name the Latin-only card font cannot draw (another
  script, emoji) becomes "You're invited to Howdy", and long names are shortened.
- **Sign-up** sends the code along (a loose optional field: a broken link must never stop anyone signing up). The
  sign-up form says plainly what will happen: "<Name> invited you. Once you confirm your email, they get a Pal request
  from you."
- **Auth stays ignorant of invites.** It emits two new domain events — `account.created` (only for a brand-new account,
  never for an address already registered; carries the code unchecked) and `account.verified` — and `invites`
  listens (wired in `wire-events.ts`). Both run after the response, so the sign-up answer is identical with a working
  link, a dead link or none (tested).
- **Recording** checks the code belongs to an active account, is not the newcomer's own, and that the link is under
  its weekly cap; otherwise nothing happens, silently. **Redeeming** (on email confirmation) claims the invitation
  atomically (`redeemed_at`), skips an inviter who is no longer active, and calls the ordinary `act(…, 'request')`, so
  blocks, budgets and the `posse_requested` Chime behave exactly as if the newcomer had tapped "Ask".
- **Where members find it:** an "Invite friends to Howdy" card on the Pals page (reachable from the phone tab bar):
  the link, "Share my link" (the phone's share sheet, or copy), "Reset link…", and "N joined with it this week".
- Retention: invitations are deleted 30 days after sign-up (the daily purge). Privacy Policy 1.16.0 (no re-acceptance).

## Alternatives considered
- **Pals straight away** — smoother, but anyone holding the link becomes a Pal who can Whisper and see Pals-only things.
- **Single-use links** — tighter, but cannot go in a bio or a story, which is how the owner is marketing Howdy.
- **A cookie set by the invite page** — survives wandering around the site, but needs a route handler or the proxy to
  set it; a query parameter on every way in is simpler and visible. Someone who leaves and comes back via /welcome
  joins without the invite (acceptable).

## Consequences / known limits
- The inviter's display name is visible to anyone who has the link (their choice to share it).
- Invitations are not in "Download my data" (they last 30 days and say only who joined through your link).
- A newcomer in their first week has the first-week request budget (ADR-024); the invite's request spends one.
