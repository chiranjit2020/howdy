# ADR-054 — Groups are circles of people who know each other

Status: accepted (2026-11-01). Supersedes the directory part of ADR-017, ADR-043 (group Time Capsules) and ADR-044
(group neighbours).

## Why

Groups were a public directory of "communities" anyone could find and join. That works against Howdy's promise ("Not
the whole internet. Just the people who matter.") and against how people in India actually use groups: the college
batch, the family, the housing society, the office team or class, today on WhatsApp. In production on this day: 7
active people, 1 group, 2 members, 0 group capsules, 0 descriptions from neighbours.

## Decisions taken with you (2026-11-01)

- **Groups are "your circles".** Invite-first, quiet, no public directory of strangers.
- **Retire "Members only"**: it behaved exactly like "Open to all" under another label.
- **Retire group Time Capsules** (ADR-043): niche, and a whole management card on every group.
- **Retire neighbours** (ADR-044): testimonials and describing someone are between friends again.
- **Plan real-life extensions** (pinned notice, events with RSVP, polls): see "Next" below.

## Decisions

1. **Two kinds of circle.** `invite` is **Private**: never shown, and only an accepted invite admits someone (as
   before). `open` is **Friends can find it**: shown to friends of its members, and anyone with its link may join (or
   ask, under the approval rule, ADR-041). Internal names stay; the screen uses the new words. A new group is Private
   unless you choose otherwise.
2. **"Groups your friends are in" replaces the directory.** `listDirectory` returns findable circles with at least one
   of my friends as an active member, that I am not in yet, newest first, each with **how many** of my friends are
   there (`friendsHere`), never who: the roster stays members-only (ADR-017). No friends, nothing listed.
3. **"Members only" is retired.** Migration 0044 moves any `members` group to `open` and narrows the check to
   `('open', 'invite')`; creating one is refused (422).
4. **Group Time Capsules are gone**: the table (`town_hall_capsules`, dropped by 0044), the API, the opening job and
   the card. Posts that came from an opened capsule keep their "sealed on" note. Personal Time Capsules (ADR-028) stay.
5. **Neighbours are gone.** The policy's `tribute:give` and `mark:give` need a mutual Posse again; sharing a group,
   however long, grants nothing. Testimonials and words given earlier stay where they are.
6. **The pages.** `/groups` is invites for you, your groups (one row each, with requests waiting for staff), and
   "Groups your friends are in" in the right panel; Start a group is a dialog that lands you on the new group. A group's
   page is in Home's frame: its header card, requests (staff), then tabs: **Posts**, **Members**, and **Manage** for the
   Owner and Deputies (invite, joining rule, bans, and for the Owner deleting it). "About this group" in the right
   panel says who can join and offers **Share group link** for findable circles.

## Next (planned with you, in this order)

1. **Pinned notice**: the Owner or a Deputy pins one post to the top (reunion details, a water cut, an exam date).
2. **Events with RSVP**: a date, time and place, then Going / Maybe / Can't (reunion, puja, AGM, team lunch, a trip).
3. **Polls**: one question, up to four options, one vote each (pick a date, a place, a repair).

Not planned: group chat (Messages exists) and albums (photos already live in posts).
