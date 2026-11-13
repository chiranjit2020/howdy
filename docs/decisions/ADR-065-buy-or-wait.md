# ADR-065 — "Buy or wait?" in groups

Status: accepted (2026-11-14).

## Why

Groups are quiet. Most group posts ask nobody anything, so nobody has a reason to open the app. People in India already
ask family and friends "should I buy this?" on WhatsApp (a photo and a price), and the answers get lost in the chat.
The idea comes from walletwait.app (a second opinion before you buy). We took only its core and left out its public
square (strangers have no context, and it brings moderation work), its "flowers" reaction (another reaction system, just
after we slimmed those down) and its price-guessing game (nothing to do with groups).

## Decisions

1. **A group post type, next to events and polls.** The post's words are *why* the asker wants it. A
   `town_hall_asks` row adds the item (2–80 characters), the price in whole rupees (1 to 1 crore), an optional
   alternative ("Or I could…", up to 140) and an optional photo (the normal post photo pipeline).
2. **Answers are Buy or Wait plus a reason (2–140 characters), and the reason is required.** A bare vote helps
   nobody, and the reason is what makes the answers worth reading. Answers are stored in `town_hall_ask_answers`, one per
   person per question. You can change your answer or take it back; the asker cannot answer their own question.
3. **Members see who answered what.** This differs from polls, which are anonymous. Here the answer is advice among
   people who know each other, and a name makes it count. The usual read-time rules apply: only current active members
   are counted, and a viewer never sees names of people they blocked or muted (or who blocked them).
4. **The asker gets ONE update, not a chat.** Its job is to answer what the group asked. A second update is a 409.
5. **The asker says what they decided:** bought it, still waiting, or skipped it. Saying it closes answers. They can
   change it later (waiting, then bought).
6. **It is the one group post that rings every member** (`hall_ask_created`), because it asks them something. A
   normal post rings nobody. To stop that becoming spam, a person may ask **3 a day**, the ring goes to at most 300
   members, and each delivery passes every normal check (block, mute, notification settings, still a member). A held
   post rings nobody. Only a **first** answer rings the asker (`hall_ask_answered`); a changed answer is not news.
7. **No money moves and there are no shop links.** The price is only for the discussion. Links are refused in every
   field (the normal post screening), so it cannot turn into ads.

## Consequences

- Migration `0060_group_asks`: two tables plus two new notification types in the three `notifications` check
  constraints. The app login gets rights on the new tables through its default privileges, so no grant is needed.
- "Download my data" includes my questions (item, price, alternative, update, outcome) and my answers to others.
- Deleting the post deletes the question and its answers (cascade).
- Tests: `tests/security/hall-asks.test.ts` (rules, privacy, notifications, cascade, export) and
  `tests/e2e/hall-asks.spec.ts` (the whole flow, axe, a 360 px phone).
