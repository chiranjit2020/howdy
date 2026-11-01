# ADR-055 — A pinned notice for a group

Status: accepted (2026-11-01). The first of the circle extensions planned in ADR-054 (then events with RSVP, then
polls).

## Why

Circles share things that must not scroll away: the reunion's date and place, a water cut in the society, an exam
moved to Monday, the trip's meeting point. A pinned post keeps one such notice at the top, whatever is posted after it.

## Decisions

1. **One pinned post per group**, stored on the group (`town_halls.pinned_post_id`, migration 0045). Deleting the post
   clears it (`on delete set null`).
2. **The Owner or a Deputy** pins and unpins, from the post's ⋯ menu ("Pin to top" / "Unpin"). Pinning another
   replaces the one before. Only a **published** post of that group can be pinned. To anyone else, and for a held post,
   the answer is the same 404 as for a post that is not there (`POST`/`DELETE /api/hall-posts/:id/pin`). An unpin only
   clears the pin if that post is still the pinned one, so a stale tab never removes a newer notice.
3. **Where it shows:** at the top of Posts with a sunflower **Pinned** badge, on the first page only, and never
   repeated in the list below. It follows every rule any post does: a writer you muted or blocked, or an inactive
   account, means you don't see it. Reactions and replies work as on any post.
4. **Quiet:** pinning tells nobody. A notice is read where it is, not pushed.

## Not done

- Several pinned posts, or a pin that expires on a date. One notice is the common need; an expiring pin can come with
  events (ADR-054's next step).
