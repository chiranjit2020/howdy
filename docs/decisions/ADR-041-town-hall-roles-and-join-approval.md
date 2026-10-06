# ADR-041 — Town Hall Deputies, "ask to join", and handing a Town Hall over

**Context.** ADR-017 gave a Town Hall one owner who could never change, and two ways in: one tap (`open`/`members`) or
an owner's invite (`invite`). It noted that `members` behaved exactly like `open`, and that an approval-gated join
should be "a new value or a new field, not a repurposing of `members`". With feeds live (ADR-033), one owner had to do
all the keeping of order alone, and a Town Hall died with its owner's account.

**Decisions (the user's, 2026-10-05).**
1. **A Deputy role** (the Howdy word, alongside Porch and Pals). A Deputy keeps order among ordinary members: takes down
   their posts and replies, clears the held tray, answers join requests, invites, and removes ordinary members. Only the
   owner edits or deletes the Town Hall, switches how it is joined, appoints or stands down Deputies, and hands it over.
   A Deputy never acts on the owner or another Deputy.
2. **"Ask to join" is a separate switch** (`town_halls.join_rule`: `instant` | `approval`) on listed Town Halls.
   Existing Town Halls stay `instant`; `members` keeps its meaning. Invite-only Town Halls ignore it.
3. **A "no" is never announced.** Declining only sets `declined_at`: the asker keeps seeing "Requested" — exactly what an
   unanswered request shows — until the request runs out 30 days after it was made; then they may ask again. A request
   cannot be withdrawn (withdrawing and re-asking would turn a quiet "no" into a fresh request in the staff's queue).
4. **The owner can hand the Town Hall to a Deputy** (confirmation step); the old owner becomes a Deputy.

## How it works
- `town_hall_members.role` gains `deputy`; `status` gains `requested`. Checks: only an `active` row holds a role other
  than `member`; `declined_at` only on a request. The one-owner partial unique index stays: a handover demotes the old
  owner before promoting the new one, inside one transaction with the Town Hall row locked, and moves
  `town_halls.owner_id` with it.
- The rule "who may act on whom" is one function, `outranks` (`roles.ts`), used by member removal and by every feed
  take-down (the feed also uses it to decide which posts show a Remove button).
- Staff tools answer everyone else with the same 404 as before roles existed. A Deputy who tries to remove a Deputy or
  the owner gets a 403 that says why (they can see the roster, so there is nothing to hide).
- Asking rings every member of the staff (`townhall_join_requested`), so asks are limited to 10 a day per person on top
  of the general action budget. Letting someone in rings them (`townhall_request_approved`); a "no" rings nobody.
  Appointment and handover ring the person concerned. All four Chimes are person-shaped, like invites (the Town Halls
  page says which one), under the existing `townhalls` preference. Staff see "N asking to join" on their own list.
- Inviting someone who has asked lets them in. Switching back to "anyone can join" lets a waiting asker join with one
  tap. Staff's own words are never held (they could only let themselves through).
- **When an owner's account is finally deleted** (ADR-027's daily job), each Town Hall it owns first passes to its
  longest-serving Deputy (`handOverTownHalls`); one with no Deputy is deleted with the account, as before. No Chime: the
  old owner's account is already closed, so there is no sender to name.
- The daily purge deletes requests older than 30 days. Privacy Policy 1.12.0 (no re-acceptance): what staff see of an
  asker, the quiet "no", the 30-day retention, the Deputy who inherits.

## Alternatives considered
- **Repurpose `members` as approval** — fewer settings, but it would silently change existing Town Halls; ADR-017 said not to.
- **Tell the asker "not accepted"** — honest, but a visible rejection invites arguments and repeated asks; the quiet
  expiry matches how Pal requests are declined.
- **Deputies may also edit, or remove other Deputies** — more power spread more thinly; one owner remains accountable.

## Consequences / known limits
- Migration `0033_town_hall_roles`.
- **Removing someone from an `open`/instant Town Hall does not stop them rejoining** (pre-existing, ADR-017): there is no
  ban list. Switching the Town Hall to "Ask to join" is today's answer; a real ban is a separate decision (since
  built: ADR-042).
- Pending requests are not in "Download my data" (they last at most 30 days); memberships there now show `deputy`.
- No request message ("why I want to join"): it would be another free-text surface to screen and moderate.
