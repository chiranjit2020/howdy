# ADR-057 — Polls in a group

Status: accepted (2026-11-01). The third and last circle extension planned in ADR-054 (after the pinned notice,
ADR-055, and events, ADR-056).

## Why

Circles decide things together: which date for the reunion, where the family meets, whether the society repaints the
gate, which slot suits the team. A post asking for replies scatters the answers; a poll counts them.

## Decisions (your "polls", with the defaults described when it started)

1. **A poll is a post.** Its words are the question (3–140), with **two to four different options** (each up to 60;
   blank boxes are dropped). Stored as `town_hall_polls` (keyed by the post), `town_hall_poll_options` and
   `town_hall_poll_votes` (migration 0047). Replies, reactions, holding, rate limits, removal and reports are all the
   post's. Deleting the post deletes the poll, its options and its votes. Every part gets a post's screening (no links,
   no disguising characters).
2. **Any member** may ask one (`POST /api/town-halls/:id/polls`).
3. **One vote per person**, changeable or taken back (`POST /api/hall-posts/:id/vote`). Only one of **that** poll's own
   options. Anyone else, a post that is not a poll, or an option of another poll, gets the same 404.
4. **Counts for everyone, names for nobody.** Members see how many chose each option (with a share bar) at any time.
   Nobody, not even the person who asked, is ever shown who voted for what, so votes stay honest. Only votes from
   current active members are counted (decided now).
5. **Closing:** whoever asked it, or the Owner or a Deputy, may close it (`POST /api/hall-posts/:id/close-poll`). It
   then shows **final results**, and voting is refused. Closing twice is a harmless repeat.
6. **Quiet:** voting tells nobody.
7. **Your data:** "Download my data" includes the polls you asked (their options) and your own votes. The Privacy
   Policy (1.25.0) says nobody sees who voted for what.

## Not done (yet)

- A closing date set in advance, more than one choice per person, and editing a poll.
