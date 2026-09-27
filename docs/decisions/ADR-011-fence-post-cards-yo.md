# ADR-011 — The Fence: Post Cards, replies and Yo

Status: accepted (Phase 5)

## Context

The Fence is the one place where other people's words appear on your Ranch. Phase 4 recorded Mute and Restrict but they did
nothing until there was content to act on. The design rule carried over from Phase 4: protective features must not become
signals that reveal the protected fact.

## Decisions

1. **A `fence` module** (`authz`, `profiles`, `relationships` → `fence`; nothing depends on it). Every access decision is a pure
   function in `authz` (`canFence`, `holdFor`), verified against an independent oracle over every combination.
2. **Three settings on the Ranch** (`profiles`): who may read the Fence (never broader than the Ranch), who may write on it
   (`members` | `posse` | `nobody`, default **posse**), and whether cards wait for approval (`fenceReview`, default off).
3. **Restrict is invisible to the restricted person.** Their cards and replies get status `held`: they look posted to their
   writer, are visible to nobody else, and wait in the owner's queue. **Review** is the honest counterpart: status `pending`,
   and the writer is told "waiting for approval". Review wins over Restrict, so a restricted person under Review sees exactly
   what everyone else sees.
4. **Mute and Block change what the viewer sees**, on every Fence: cards and replies from muted people and from anyone in a
   block (either direction) are left out for that viewer only. Inactive accounts' words disappear.
5. **Limits leak nothing.** Per-person limits are spent before the handle is looked up (this fixed a real leak found in
   testing: with the lookup first, a blocked target tripped a 429 after enough tries while a made-up handle never did). Per-Fence
   limits (3 cards/hour/person/Fence, 120/hour into one Fence, 12 replies/hour) are spent only after access is confirmed.
   A full card (20 replies) answers everyone alike; held replies do not use up places.
6. **Keyset paging** on `(created_at, id)`. Timestamps are always written by the app with millisecond precision so the cursor
   compares exactly. Cursors are strictly parsed, carry no privilege, and hidden authors cannot stall paging (bounded rounds).
7. **Removal**: a writer can always take their own card back (even after being blocked); the Fence owner can remove anything
   ("Scrape clean"); nobody else can, and every other case is the same 404 as a missing card. Taking back a Yo always works.
8. **Reports on a card** go against its writer with a snapshot of the words (`reports.evidence_text`) so the evidence outlives
   the card. Approving a waiting card moves it to "now" so readers already past that spot still see it.
9. Cards and replies refuse links and disguising characters (same screening as Signals).

## Consequences

- A restricted person can work out they are restricted only by asking someone else whether their card is visible. Accepted: the
  alternative (telling them) defeats the feature.
- Muted/blocked authors are filtered after fetching a page, so a page can be shorter than requested; paging still terminates.
- Yo counts include Yos from people the viewer muted or blocked (not a protected fact; revisit if it bothers people).
- Waiting cards older than 30 days are deleted by `pnpm jobs:purge` (scheduling is still a deployment task).

## Not in this phase

Notifications for new cards / approvals (Phase 6), Tips, anonymous notes, media on cards, editing a card after posting.

## Amendment, 2026-09-27 — Post Card reactions

Yo is now the default of five reactions: **Yo, Laugh, Fire, Popcorn, Love**. They are momentary ("that post"), unlike
Marks, which describe a person (ADR-016 amendment).

- **Storage:** the `yos` table keeps its name and its one-row-per-person-per-card key, and gains `kind` (default `'yo'`,
  checked, migration `0015`). Existing Yos are Yos. Switching kind updates the row, so a person still has at most one
  reaction on a card.
- **API:** `POST /api/cards/:id/yo` takes `{ on, kind? }` (Yo when no kind) and answers `{ yoByMe, myReaction }`. A card
  view adds `reactions` (count per kind) and `myReaction`. `yoCount`/`yoByMe` stay as the total and "reacted at all".
- **Privacy:** only counts per kind are shown, never who reacted with what, as before.
- **Chimes:** one `yo_given` Chime per new reaction ("X reacted to your card."), with no kind in it. Switching kind or
  re-giving never rings the bell again. The preference is shown as "Reactions".
- **UI:** one tap gives a Yo (or takes yours back), a face button opens the other four, and a summary shows the top
  three kinds with the total. A double-click on the card still only gives a Yo.
