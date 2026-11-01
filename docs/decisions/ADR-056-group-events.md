# ADR-056 — Events with RSVP in a group

Status: accepted (2026-11-01). The second circle extension planned in ADR-054 (after the pinned notice, ADR-055;
polls come next).

## Why

Getting people together is what circles are for: the batch's reunion, a family puja, the society's AGM, a team lunch,
a weekend trek. A plain post can announce it, but nobody knows who is coming, and the date and place get lost in the
replies.

## Decisions taken with you (2026-11-01, the defaults you chose with "start")

- **Any member** may post an event.
- **Everyone sees the counts**; **only the organiser** sees who answered what.
- **No reminders** for now.

## Decisions

1. **An event is a post.** It has a name (3–80), a start (an instant, entered and shown in Howdy's calendar,
   Asia/Kolkata), an optional place (up to 80) and optional details (the post's words; the name stands in when there
   are none). Stored in `town_hall_events` keyed by the post (migration 0046). Replies, reactions, photos rules,
   holding, rate limits, removal and reports are all the post's. Deleting the post deletes the event and its answers.
   It must start in the future and within a year, and its words get the same screening as a post (no links, no
   disguising characters).
2. **Answers:** going, maybe or can't go (`no`), one per person, changeable or taken back (`town_hall_rsvps`;
   `POST /api/hall-posts/:id/rsvp`). Active members who may see the post only. Anyone else, or a post that is not an
   event, gets the same 404. They **close when it starts**.
3. **What counts is decided now.** Only answers from current active members are counted. Someone who leaves stops
   counting, and their name leaves the organiser's list.
4. **The organiser's list** ("Who answered") leaves out accounts that are no longer active and anyone the organiser
   has hidden (muted or blocked). They are still counted, because the count is about the event, not the list.
5. **Quiet:** answering tells nobody. The organiser sees it next time they look.
6. **Your data:** "Download my data" includes the events you posted (name, start, place) and your own answers. The
   Privacy Policy (1.25.0) says who sees answers. The same update also removes passages for features retired today
   (group Time Capsules, neighbours) and replaces badges with the words friends pick.

## Not done (yet)

- Reminders (for example, the day before), and editing an event (delete and post again for now).
- A pinned notice that expires when its event has passed.
