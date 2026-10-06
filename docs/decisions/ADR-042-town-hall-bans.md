# ADR-042 — Banning someone from a Town Hall

**Context.** ADR-041 left a known gap: removing someone from an "anyone can join" Town Hall did not stop them joining
again with one tap. Switching the whole Town Hall to "Ask to join" was the only answer, and that burdens everyone else
to keep one person out.

**Decisions (the user's, 2026-10-06).**
1. **The owner and Deputies can ban**, by the same rule as removal (`outranks`): a Deputy bans ordinary members and
   people who are not members at all; never the owner or another Deputy. The owner must stand a Deputy down before
   banning them (no one-step "ban a Deputy").
2. **A ban is silent.** The banned person is never told. To them, the Town Hall looks like one that needs approval:
   "Ask to join" works, shows "Requested", and is never answered — exactly what a quiet "no" looks like (ADR-041).
3. **A ban lasts until lifted** (by the owner or any Deputy), or until the Town Hall or the banned account is deleted.

## How it works
- New table `town_hall_bans (town_hall_id, user_id, banned_by, asked_at, created_at)`, separate from
  `town_hall_members` on purpose: any membership row makes an invite-only Town Hall visible to its person, and a ban
  must not.
- Banning (one transaction) adds the ban and deletes any membership, invite or request. A repeat ban changes nothing
  (who set it and when are kept). Staff cannot invite a banned person: the invite says so (409), since staff can see the
  ban list anyway.
- **Joining races banning safely:** joining, asking and being invited take a per-(Town Hall, person) advisory lock and
  re-check the ban inside it; banning takes the same lock. Without it, a join could check "not banned", the ban could
  land, and the join's insert would then put a banned person inside.
- The banned person's view (`toDetail` with a ban): `joinRule: 'approval'`, `canJoin: false`; the directory shows
  "approval" too. "Asking" spends the same daily ask budget as a real request and stamps `asked_at`, which drives
  "Requested" for 30 days, then "Ask to join" again — the same lifetime as a real request. Nothing reaches staff's
  queue and nobody is rung. "Leave" during a live ask gives the same "cannot be taken back" as a real request.
- An invite-only Town Hall simply disappears for a banned member (their row is gone), as with removal.
- Staff see a "Banned" card: who, when, by whom, a "Lift ban" button and "Ban by call sign" for people who are not
  members. Members' Options menus gain "Ban…" (ordinary members only). Accounts that are not active (suspended, closing)
  are left out of the list until they are active again; their ban stays.
- `GET/POST /api/town-halls/:id/bans`, `DELETE /api/town-halls/:id/bans/:handle`. Everyone but staff gets the same 404
  as for any staff tool. Lifting does not re-admit anyone.
- Retention: the daily purge clears `asked_at` older than 30 days. If the banning account is deleted, the ban stays
  with `banned_by` empty. Privacy Policy 1.13.0 (no re-acceptance).

## Alternatives considered
- **Tell the person plainly** ("You can't join this Town Hall") — clearer, but confirms the ban and invites arguments or
  a new account; it also differs from how a "no" works everywhere else in Howdy.
- **Hide the Town Hall entirely** from a banned person — also tells them (a listed hall vanishing is noticeable when a
  friend can still see it), and breaks shared links in a confusing way.
- **A `banned` status on `town_hall_members`** — fewer tables, but every existing check that treats "any row" as
  visibility for invite-only halls would have to learn about it; a missed one leaks the hall.
- **Timed bans** — not asked for; "until lifted" is simpler and the list makes lifting easy.

## Consequences / known limits
- Migration `0034_town_hall_bans`.
- A banned person can still find a listed Town Hall and read its name and description (public to every member anyway);
  they cannot read the feed or roster, which were members-only already.
- Their old posts and replies stay, as after removal; staff can take them down.
- A friend comparing screens could notice the Town Hall shows "Anyone can join" to them and "Ask to join" to the banned
  person. Accepted: it is the same signal as a quiet "no" on an approval Town Hall that later opened up.
- Bans are not in "Download my data", for either side: the banned person would learn of the ban (the export shows
  nothing the app would not show now, ADR-037), and staff's list is a Town Hall record, not their own content.
- The ban list shows at most the 200 newest bans.
