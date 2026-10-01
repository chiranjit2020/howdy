# ADR-033 — Town Hall feed

Status: accepted (2026-10-01). Decisions taken with you: any member posts (the owner can take anything down), replies +
reactions like Post Cards, words only (no photos while there are no image checks), and Chimes only for replies and
reactions to *my* post — never one per new post.

## Context

ADR-017 shipped Town Halls as a directory + membership only, deferring a shared feed "until the need is real". With
real Town Halls on the site, a Town Hall had nothing inside it to read.

## Decisions

1. **Members only.** Only ACTIVE members read or write the feed (`town_hall_posts`, `town_hall_replies`,
   `town_hall_reactions`). Everyone else — a non-member of an open Town Hall, an invitee who has not accepted, a former
   member, a made-up id — gets the same 404. The Town Hall page shows the feed only to members.
2. **Shape = a Post Card.** Posts ≤ 280 characters (`LIMITS.TOWNHALL_POST_MAX`), screened like every public text (no
   links, no disguising characters). Replies reuse the Post Card reply rules (80 chars, at most 20 per post, row lock
   against the race). Reactions are the same five kinds, one per person per post, counts only, never on your own post.
3. **Who removes what.** The writer can always take back their post or reply (even after leaving); the Town Hall's
   owner can take down anything in it. Leaving or being removed keeps what you posted. Deleting the Town Hall or the
   author's account deletes the posts (cascade).
4. **Same protections as the Fence.** Blocks (both ways) and mutes hide that person's posts and replies, and a hidden
   post cannot be replied to, reacted to or reported. Inactive accounts drop out. Rate limits fail closed and the
   per-person ones are spent before anything is looked up (post 20/h, plus 10/h per Town Hall once membership is
   known; reply 60/h; react 200/h); the first-week budgets are shared with Post Cards (`card`, `reply`, `reaction`).
5. **Auto-hold (ADR-024).** A writer with open reports from ≥3 people in the last week has new posts and replies
   `held`: they look posted to the writer, nobody else sees them, nothing rings, and the owner sees them in a "Waiting
   for you" tray to let through or remove. The owner is never held in their own Town Hall. Held items nobody answers
   are purged after 30 days (daily job, `purgeStaleHeld`). There is no owner-level Restrict here — that is a Fence
   concept.
6. **Reports (ADR-025).** New subject `hall_post` (`reports.hall_post_id`, SET NULL; evidence = the words). Only a
   member who can see the post may report it, never their own. Moderators get `remove_hall_post`
   (audit: `hall_post_removed`).
7. **Chimes.** `hall_reply_created` and `hall_reaction_given`, to the post's writer only, under the existing `townhalls`
   preference. They point at the post (`notifications.hall_post_id`, CASCADE) and are re-checked when read: shown only
   while the post is published and the recipient is still an active member. Linking to `/town-halls/:id` there is safe
   because the recipient is a member.

## Consequences

- Notifications gained a second "thing" pointer, so `notifications_once_per_person` is now partial on
  `card_id is null and hall_post_id is null` (and `deliver`'s ON CONFLICT names the same predicate).
- Moderators who are not members cannot open a Town Hall's feed; the report's evidence snapshot is what they judge.

## Not in this phase

Photos on posts; pinned posts; Chimes for new posts; roles beyond owner/member; realtime updates (the feed loads on
open, "Older posts" pages back).
