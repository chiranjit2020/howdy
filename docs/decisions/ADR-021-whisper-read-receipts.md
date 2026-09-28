# ADR-021 — "Seen" on Whispers (read receipts)

Status: accepted (2026-09-28). Amends ADR-013 decision 4 ("no read receipts"). Decision taken with the product owner the
same day: the Instagram/WhatsApp model — Seen, with a reciprocal switch.

## Context

People asked to see whether a Pal has read their Whisper. ADR-013 left receipts out because a receipt is exactly the signal
that exposes a Restrict: a restricted sender's words are held and never shown, so they would never turn "Seen". Both sides'
read positions were already stored (`conversations.low_read_seq` / `high_read_seq`); only showing them was ruled out.

## Decisions

1. **A switch, on by default:** `profiles.read_receipts` (migration 0017), changed on the Whispers list, sent as
   `readReceipts` in `PATCH /api/me/porch`. Only the owner ever sees its value; another person's Porch never carries it.
2. **Reciprocal:** a thread shows "Seen" only when **both** people have receipts on. Turning them off also hides everyone
   else's "Seen" from you.
3. **A restricted sender never gets "Seen"** — the answer has no `seenUpTo`, exactly as when the other person has receipts
   off. This matters beyond appearances: the reader's mark moves past held words whenever they read or reply, so a naive
   receipt would say "Seen" for words the reader was never shown. The person who restricted still sees how far the
   restricted person has read *their* words (that reveals nothing to the restricted person).
4. **What goes over the wire:** `GET /api/whispers/:handle` (every form, including `?after=` catch-up) adds
   `seenUpTo` — the other person's read position — only under 2 and 3. Nothing else about reading is exposed.
5. **Display:** only the newest Whisper I sent carries a status: `11:00 AM · Sent` or `11:00 AM · Seen`.
6. **Freshness:** "Seen" is not pushed over the socket. While my newest Whisper is not yet seen the thread asks
   (`?after=`) every 8 s, even when the live connection is up; once it is seen, a live thread stops asking.

## Consequences

- A restricted person who sees no "Seen" cannot tell a Restrict from receipts being off. While most people leave receipts on,
  the cover is thinner than ADR-013's "no receipts at all": the product owner accepted this, as Instagram does.
- Reading a thread (or replying in it) is now visible to the other person when both have receipts on.

## Tests

`tests/security/whispers.test.ts` → "Seen (read receipts, ADR-021)". Mutation-checked: dropping the Restrict guard, and
weakening "both on" to "either on", each make those tests fail.
