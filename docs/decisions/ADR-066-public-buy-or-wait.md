# ADR-066 — "Buy or wait?" for friends and everyone, and groups up front

Status: accepted (2026-11-14). Extends ADR-065 (group questions).

## Why

Groups are almost silent. A question that only a quiet group can see has little chance of getting answers. The user
asked for it to go public, and for groups themselves to be easier to find.

## Decisions

1. **The asker picks the audience every time:** *My friends*, *Everyone on Howdy*, or *one of my groups*. Group
   questions stay group posts (ADR-065). Friends and Everyone questions live in their own `asks` and `ask_answers`
   tables and have their own page, `/buy-or-wait`.
2. **Who sees a question is decided every time it is read.** The asker always does. Nobody else sees a held one. A
   viewer never sees questions from someone hidden from them (block or mute, either way) or from an inactive account.
   *Everyone* questions are open to anyone signed in. *Friends* questions are open to current friends only: someone who
   stops being a friend stops seeing it. Anyone who may not see a question gets the same 404 as one that does not exist.
3. **Share link.** `/buy-or-wait/[id]` opens an *Everyone* question for anyone, signed out too. There the Buy and Wait
   buttons lead to sign-up, with "Help {name} decide" and Join / Log in. The page is `noindex`, because names and
   answers are on it. People who answer are told who will see their name ("Anyone who opens this question sees your
   name and answer").
4. **Notifications.** A new question (either audience) notifies the asker's friends (`ask_created`, at most 300). A
   first answer notifies the asker (`ask_answered`). Both go through the usual read-time filter, so they vanish if the
   question is no longer visible. They use the existing Wall posts / Replies notification switches.
5. **Limits and safety.** Each person can ask 3 questions a day, counting group and public questions together. New
   accounts have the same limits as for a post. The post hold rule (ADR-024) applies: a held question looks asked to its
   asker, notifies nobody, and is deleted after 30 days. Questions can be flagged (report subject `ask`), and moderators
   get "Remove question" (`remove_ask`). Links are refused in every field. **Photos (added 2026-11-14, the user's ask):**
   one photo per public question too (`media.ask_id`, migration 0062), the asker's own fresh upload only. It goes
   through the photo check like any card photo (a held one is shown to its asker only), is served by
   `/api/asks/{id}/photo` to exactly who may see the question (signed out too for `everyone`), and is cleaned up when
   the question goes. v1 left photos out because strangers' photos are more moderation work; the photo check covers it.
6. **Big icon buttons for the answers.** Buy is a cart and Wait is a countdown clock (Phosphor icons; the hourglass
   is already Time Capsules'). They are two half-width 56 px pills with their counts, like upvote and downvote. Icons
   are outlined until chosen and filled after; a chosen Buy fills sunflower and a chosen Wait navy, matching the tally
   bar, and the unchosen ones have a black outline. The chosen one jumps when tapped (`animate-ask-pop`), and its count
   ticks into place (`animate-ask-tick`). The global reduce-motion rule turns both off. A reason is still required.
   The first version used emoji; the user turned that down the same day ("not emoji, more prominent").
7. **Groups promoted.** Home has a "Your groups" card: your groups, or "Start or find a group" if you have none. It sits
   above the feed on narrow screens and in the right panel on wide ones. The phone tab bar is now **Home, Groups,
   Friends, Messages, Me** (your photo; the sheet it opens is titled "Me", was "Profile"), and Buy or wait moved into the Profile sheet in Groups' old place. Home also has a
   "Buy or wait?" card with the newest questions you can answer and an Ask button, and the sidebar lists "Buy or wait?".

## Consequences

- Migration `0061_public_asks`. It adds `asks` and `ask_answers`, `notifications.ask_id` (with its own check and
  unique index; the person-shaped unique index now also needs `ask_id is null`, and the bump upsert matches it), and
  `reports.ask_id` plus subject `ask`.
- "Download my data" adds `buyOrWait` (my questions and answers) and, per group, `myBuyOrWaitQuestions` and
  `myBuyOrWaitAnswers`.
- The daily clean-up job also deletes stale held questions.
- Signed-out answering after sign-up does not return you to the question yet: sign-up has no "next" parameter.
- Tests: `tests/security/public-asks.test.ts` (with a mutation check on the friends-only rule), and the e2e specs.
