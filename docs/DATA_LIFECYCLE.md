# Howdy — Data lifecycle: dependencies, retention, deletion

Written in Phase 3 (before more tables ship) as required by master prompt §55: "Delete account" is not `DELETE FROM users`.
Update this file whenever a table is added.

## 1. Dependency graph (foreign keys today)

```text
users ──┬─< credentials      ON DELETE CASCADE   (1:1, password hash)
        ├─< sessions         ON DELETE CASCADE   (token hashes)
        ├─< email_tokens     ON DELETE CASCADE
        ├─< profiles         ON DELETE CASCADE   (1:1, the Ranch)
        ├─< posse_links      ON DELETE CASCADE   (both user_low and user_high)
        ├─< scouts           ON DELETE CASCADE   (scout and scoutee)
        ├─< user_controls    ON DELETE CASCADE   (block / mute / restrict, actor and target)
        ├─< post_cards       ON DELETE CASCADE   (both fence_owner_id and author_id)
        │     ├─< card_replies  ON DELETE CASCADE   (with the card; also with the reply's author)
        │     └─< yos           ON DELETE CASCADE   (with the card; also with the person who gave it)
        ├─< notifications    ON DELETE CASCADE   (recipient and actor; also with the post card it is about)
        ├─< notification_prefs ON DELETE CASCADE (1:1, which kinds of Chime)
        ├─< tracks           ON DELETE CASCADE   (both owner_id and visitor_id; one row per pair, a UTC date only)
        ├─< media            ON DELETE CASCADE   (the row only: the FILE is not removed by the database, see below)
        ├─< conversations    ON DELETE CASCADE   (both user_low and user_high; one row per pair)
        │     └─< messages   ON DELETE CASCADE   (with the thread; also with the sender)
        ├─< tributes         ON DELETE CASCADE   (both owner_id and author_id)
        ├─< marks            ON DELETE CASCADE   (both rater_id and target_id; an append-only log)
        ├─< town_halls       ON DELETE CASCADE   (owner_id only — deleting the owner deletes the whole Town Hall)
        ├─< town_hall_members ON DELETE CASCADE  (user_id; also cascades from town_halls.id)
        ├─< legal_acceptances ON DELETE CASCADE  (which Terms / Privacy versions were agreed to, and when; append-only)
        ├─< suggestion_dismissals ON DELETE CASCADE (both user_id and dismissed_id — Phase 13, ADR-029)
        ├─< time_capsules    ON DELETE CASCADE   (both author_id and recipient_id — Phase 12, ADR-028)
        ├─< porch_lights     ON DELETE CASCADE   (user_id; at most one row, only while the light is on — ADR-032)
        ├─< suspensions      ON DELETE CASCADE   (user_id; created_by / lifted_by / appeal_reviewed_by SET NULL — ADR-023)
        ├─< audit_log        ON DELETE SET NULL  (trail survives, anonymised)
        └─< reports          ON DELETE SET NULL  (reporter and target; evidence survives, identifiers go; card_id,
                                                  media_id, message_id, town_hall_id also SET NULL — ADR-025)
```

Everything a user owns hangs off `users` by cascade, so removing the `users` row cannot leave orphans. **Two deliberate exceptions keep
their rows and lose the link (`… → NULL`): the audit log and reports** (evidence must outlive either account). Tested: deleting a user
removes every link, scout and control involving them, and leaves their reports with the identifier cleared.

**Post Cards (Phase 5): deleted with either account.** A card is removed when its writer is deleted *and* when the owner of the
Fence it hangs on is deleted; its replies and Yos go with it, and a deleted person's own replies and Yos vanish from other people's
cards. (The earlier plan to anonymise cards others replied to was dropped: a card whose writer has gone is simply gone, which is the
privacy-preserving default and avoids "Former neighbour" placeholders.) Reports keep `evidence_text`, a snapshot of a reported card's
words, after the card is gone. Tested: deleting a user removes their cards, replies and Yos and the cards left on their Fence.

**Tributes and Marks (Phase 9): both delete when either side is deleted.** A Tribute (testimonial) is removed with its
author or the Ranch it was on; a Mark (deep-vibe award) is removed with the rater or the target. Neither anonymises —
there is no reason to keep a testimonial or an award once one of the two people involved is gone.

**Town Halls (Phase 10): the Town Hall belongs to its owner, not to any one member.** Deleting the *owner's* account
cascades to `town_halls` and removes the whole Town Hall (and, from there, every `town_hall_members` row in it — there
is no ownership transfer, ADR-017). Deleting a *regular member's* account only removes their own membership row; the
Town Hall and everyone else in it are unaffected.

Planned (each must declare its deletion behaviour when created):

| Future table | Owner link | On account deletion |
| --- | --- | --- |
| `tips` | giver | delete |
| `moderation_actions` (Phase 11) | subject / moderator | keep for safety with identifiers removed; never cascade-delete evidence |

**Media (Phase 9): rows cascade, files do not.** A `media` row (a Portrait) points at a file in object storage; deleting the `users`
row removes the row but the database cannot remove the file. **Account deletion must therefore call `deleteAllMediaFor(userId)`
(objects first, then rows) BEFORE it deletes the `users` row**, or the files are orphaned with nothing left to find them. The deletion
flow itself is not built yet; this is the step it must include (tested: the function removes a person's objects and rows and nobody else's).
A Portrait has three states: `pending` (a signed upload URL was issued, nothing is trusted), `ready` (decoded, cropped, re-encoded, served;
at most one per person, enforced by the database) and `retired` (replaced or removed, its file being deleted). The raw upload is
recorded as a `retired` row in the same transaction that makes the new photo live, so even a failed delete leaves a row to retry from.

## 2. Account deletion ("Burn the Deed") — built (ADR-027, 2026-09-30)

1. **Ask** — Workshop → "Burn the Deed" (password re-checked, rate limited), or the sign-in page for a suspended
   account (identifier + password, the same checks and limits as signing in). `status = 'pending_deletion'`,
   `deletion_requested_at = now`, every session revoked. Effect is immediate: every gate admits only `active`.
   An email gives the date.
2. **Grace period: 14 days.** Signing in answers `403 ACCOUNT_CLOSING` (only after the password is proven) and offers
   "Keep my account", which puts the account back exactly as it was — `suspended` if a suspension is still in force —
   without reviving any old session.
3. **Purge** (daily job, `purgeDeletedAccounts` in `pnpm jobs:purge`): for each account past its grace period, the
   photo files are deleted from storage FIRST (`deleteAllMediaFor`); only when no `media` row is left is the account
   deleted (`eraseAccount`), otherwise it waits for the next run, so nothing is orphaned. Deleting the `users` row
   cascades everything in §1; the audit log and reports keep their rows with the link cleared.
4. **Call sign held back 90 days** in `retired_handles`, as an HMAC (keyed with `AUTH_SECRET`) — never the name.
   Sign-up answers exactly as for a taken call sign. The daily job forgets freed ones (`purgeFreedHandles`).
   Rotating `AUTH_SECRET` releases every held call sign early.
5. A second email once it is deleted.

## 2b. Export ("Download my data") — built (ADR-037, 2026-10-04)

A ZIP built on the spot from the Workshop (password again; 10 attempts/hour, 3 exports/day). It holds what the person
gave Howdy plus what the app already shows them, in the state they see it, and names another person only if that
account is active and not hidden from them (block either way, or their own mute). Nothing is stored: the file is
streamed and never kept on the server. See ADR-037 for exactly what is and is not in it.

## 3. Retention (master prompt §54) — what is kept, how long, who removes it

| Data | Kept | Removed by |
| --- | --- | --- |
| **Signal** (`profiles.signal*`) | 12 hours from being set. Reads ignore an expired Signal immediately | `clearExpiredSignals()` physically clears it |
| Session (`sessions`) | idle 14 d / absolute 60 d; dead rows kept 30 d after revoke/expiry for support | `purgeExpiredAuthData()` |
| Push devices (`push_subscriptions`, ADR-022) | while the session that subscribed is live; a push service's 404/410 forgets it at once | session delete cascades; `purgeDeadSubscriptions()` (in `pnpm jobs:purge`) for revoked/expired sessions; unsubscribing |
| Email tokens (`email_tokens`) | verify 24 h, reset 1 h; spent/expired rows kept 7 d | `purgeExpiredAuthData()` |
| Audit log (`audit_log`) | **12 months**, then deleted (kept that long after an account is deleted, anonymised) | `purgeOldAuditLog()` (in `pnpm jobs:purge`) |
| Rate-limit counters (Redis) | ≤ 1 hour, expire on their own | Redis TTL |
| **Tracks** (`tracks`) | **7 days**: a row holds only the UTC date of the latest visit; reads ignore older rows at once | `purgeOldTracks()` (in `pnpm jobs:purge`); also deleted with either person |
| **Whispers** (`messages`) | **7 days** from being sent, or at once by "Burn Thread" (either person, both sides — except a burner who was blocked or restricted only clears their own view, ADR-038) | `purgeOldWhispers()` (in `pnpm jobs:purge`); threads left empty are dropped with them |
| Chimes (`notifications`) | read: 30 days after being read; unread: 90 days after being rung | `purgeOldChimes()` (in `pnpm jobs:purge`) |
| **Portrait files** (`media`) | a live Portrait until replaced/removed or the account is deleted; an **unfinished upload 60 minutes**; a replaced/removed file is deleted at once and, if storage failed, retried by the job | `purgeStaleMedia()` (in `pnpm jobs:purge`); removal deletes the object first, then the row |
| Post Card photos (`media` kind `card_photo`, ADR-031) | with their card; never served once the card is gone (its `card_id` goes to null) and the file is deleted by the job; a photo never nailed: 60 minutes | `purgeDetachedCardPhotos()` (in `pnpm jobs:purge`); `deleteAllMediaFor` on account deletion |
| Waiting cards / replies (`status` pending or held) | 30 days from being written, then dropped if the owner never answered | `purgeStaleWaiting()` (in `pnpm jobs:purge`) |
| Published cards, replies, Yos | until removed by their writer / the Fence owner, or an account is deleted | people; account deletion |
| Waiting Tributes (`status` pending) | 30 days from being written, then dropped if the owner never answered | `purgeStaleTributes()` (in `pnpm jobs:purge`) |
| Published Tributes | until removed by their author or the Ranch owner, or an account is deleted | people; account deletion |
| Marks (`marks`) | **kept indefinitely** — the row is two ids, a kind and a date, and is the aggregate itself | people (deleted with either side); no retention job |
| Held Town Hall posts / replies (ADR-033) | 30 days from being written, then dropped if the owner never answered | `purgeStaleHeld()` (in `pnpm jobs:purge`) |
| Published Town Hall posts, replies, reactions | until removed by their writer / the Town Hall's owner / a moderator, or the Town Hall or the writer's account is deleted (leaving keeps them) | people; cascades |
| Town Halls and memberships (incl. unanswered invites) | **kept indefinitely** — no sensitive detail to expire (two ids, a role, a status) | people (owner deletion cascades the whole Town Hall); no retention job |
| Report evidence snapshot (`reports.evidence_text`, ≤ 600 chars: a card, ONE reported Whisper, a Town Hall's name + description) | open reports: kept; closed reports: **deleted 1 year after closing** (row, words, reporter/target) — outlives the thing, including a Whisper past its 7 days (disclosed in the Privacy Policy) | `purgeClosedReports()` (in `pnpm jobs:purge`) |
| Suspensions and appeals (`suspensions`) | for the life of the account (disclosed in the Privacy Policy) | account deletion (CASCADE) |
| Time Capsules (`time_capsules`) | sealed: until the day (then opened, or deleted if the two are no longer Pals / there is a block) or taken back by the writer; opened: until the recipient deletes it | people; `openDue()` (in `pnpm jobs:purge`); deleted with either account |
| Memories | nothing stored — worked out when read | — |
| Porch Light (`porch_lights`: audience, ≤ 60-char note, lit/until times) | only while on (≤ 2 hours); switching off deletes it; one that went out is deleted within a day — no history of when someone was around | the person; `purgeExpiredLights()` (in `pnpm jobs:purge`); account deletion |
| Closing accounts (`users.status = 'pending_deletion'`) | 14 days from the request, then deleted for good | `purgeDeletedAccounts()` (in `pnpm jobs:purge`) |
| Held-back call signs (`retired_handles`, a keyed hash only) | 90 days after the account is deleted | `purgeFreedHandles()` (in `pnpm jobs:purge`) |
| Tracks / typing / presence (future) | seconds → days, per ADR-006 | their own jobs |
| Logs | no passwords, tokens, cookies or message/Signal bodies (redacted) | log platform retention |

**Running the jobs:** `pnpm jobs:purge` runs every purge and prints a JSON summary; it is idempotent. **In production it runs daily** as a Vercel Cron (`/api/jobs/purge`, 04:00 UTC, authorised by `CRON_SECRET`; ADR-019). The Privacy Policy states these periods, and `tests/unit/legal.test.ts` fails if its figures drift from the constants here.

## 4. Relationship privacy rules (Phase 4)

- Close Posse, Scouting, Mute, Restrict and Block are private to the person who set them; the other side is never told and cannot see them.
- A block hides both people from each other, ends Posse / requests / scouting, and is undetectable to the blocked person (see ADR-010).
- Posse links, scouts and controls are deleted with either account (cascade). Reports keep their rows with the identifiers set to NULL.
- Suspending an account hides it from lists and lookups immediately; its links are removed only when the account is deleted (open question for Phase 11).

## 4b. Fence privacy rules (Phase 5)

- Restrict and Review hold words for the owner. A held card looks posted to a restricted writer; a pending (Review) card tells its
  writer it is waiting. Only the writer and the Fence owner can ever see a waiting card.
- Mute and Block hide words from the muter/blocker only; nobody is told. Words of inactive accounts are not shown.
- A writer can always delete their own card; the Fence owner can delete anything on their Fence.
- Fence responses never contain ids of people, email addresses or privacy settings.

## 4c. Chime privacy rules (Phase 6)

- A Chime row holds ids and a type only — no names, no text, no copy of a card. Names and links are built when it is read.
- Whether a Chime is visible is decided at read time from the current relationships and Fence access (block either way, mute,
  inactive account, Fence no longer readable, card no longer public). The unread badge uses the same filter as the list.
- Nothing rings for a block or mute; a restricted person rings only for cards/replies waiting on the owner. Approving a card held
  for a Restricted writer never rings the writer. Declines ring nobody.
- Deleting a person removes every Chime they received or caused; removing a card removes the Chimes about it.

## 4d. Whisper privacy rules (Phase 7)

- A thread exists between exactly two people who are in each other's Posse; a block or leaving the Posse closes it for both
  (nothing is deleted by that — retention or Burn Thread does that).
- Held words (sender restricted by the recipient) are stored, visible only to their sender, never delivered, counted or rung.
- Read receipts (ADR-021): each person stores their own read position; the other person sees it as "Seen" only when both
  have `profiles.read_receipts` on and they are not restricted by the reader. The setting itself is never shown to anyone else.
- Redis pub/sub carries `{conversationId, seq}` only. Message text is stored only in Postgres.
- Deleting a person removes every thread they are in and every Whisper in them, for both sides (cascade).
- Logs never contain message bodies; the realtime process logs no addresses.

## 4e. Tracks privacy rules (Phase 8)

- A Track is two ids and a UTC date: no time of day, no count, no IP, device, location or "how" (a `date` column cannot hold them).
- At most one write per pair per day; the same date is a no-op.
- Recorded only for a signed-in person opening someone else's Ranch after the policy allowed it; never for a visitor on Shadow Walk,
  an inactive account or a blocked pair. Recorded after the response, so the visitor's page is identical either way.
- Who is named is decided at read time (mutual Posse only); everyone else is only a per-bucket count; muted / blocked people are
  not even counted; times are Today / Yesterday / This week; same-day order is by call sign.
- Shadow Walk is private to its owner and freezes their own Tracks; nobody else can see whether it is on.
- No endpoint reveals where a person has been. Logs never contain visits.

## 5. Privacy defaults

- New Ranches are **members-only**; the Signal and the Fence are members-only to read, and only the **Posse** may write on a Fence. The owner widens or narrows both in the Workshop (Boundary Lines).
- A Signal's effective visibility is the intersection of the two settings.
- Ranch pages are `noindex`; nothing about a Ranch is exposed to signed-out visitors unless the owner chose "everyone".
- A hidden Ranch is indistinguishable from a missing one (API 404; signed-out page shows the same prompt for both).
- Opening Ranches is rate limited per viewer to make bulk scraping expensive.

## 4f. Portrait privacy rules (Phase 9)

- A photo is stored only as our own re-encoded 512×512 WebP: no EXIF (location, camera, copyright), nothing the upload claimed to be.
  The object key is random and says nothing about the owner. The bucket is private; photos are read back and served by the app.
- Who may see a photo is decided **when it is requested**, with the same rule as opening that Ranch (`mayViewRanch`): a block, a
  Posse-only Ranch, a suspended account or being signed out removes it at once, even from a browser that cached it (`no-cache` + ETag;
  a 304 is only answered after access is re-checked). Missing person, hidden Ranch, blocked visitor and "no photo" are the same 404.
- Portraits are shown only to signed-in people. Lists, Post Cards, Chimes and Whispers still show the coloured initials.

## 4g. Tribute and Mark privacy rules (Phase 9, ADR-016)

- Both are Posse-only to give: a mutual Posse and no block either way, checked by the same authorisation policy as
  Whispers (`tribute:give` / `mark:give`). Viewing follows the Ranch's own visibility, same as the Fence.
- A Tribute always waits for the owner's approval — there is no fast path, so approving one can never leak how the owner
  regards its author (contrast the Fence's `held` vs `pending`, which exists only because Post Cards have a fast path).
  Non-published Tributes are visible only to their author and the Ranch owner.
- At most one pinned Tribute per owner, enforced by the database; pinning a new one unpins the old one in one transaction.
- Marks are an append-only log with no retention: the point of the row is the aggregate ("Vibe Matrix"), and it holds
  nothing sensitive (two ids, a kind, a date). A rater may give one target only one Mark, any kind, every 30 days —
  checked at write time (a rolling window cannot be a database constraint) with a single atomic statement so two racing
  requests cannot both slip through.
- **Who gave a Mark, and which kind, is never shown beyond the target.** The Ranch shows only the aggregate count per
  kind — no per-Mark rows, no leaderboard, no cross-person comparison. The target does get a Chime naming the giver
  (consistent with a Yo), but never the kind.
- Muting or blocking a Tribute's author hides it from the owner's list and waiting queue at once (decided at read time,
  like a Chime or a Fence card) without deleting anything; giving still works (mute limits what the owner is shown, not
  who may act).

## 4h. Town Hall privacy rules (Phase 10, ADR-017)

- An `invite`-visibility Town Hall is hidden ≡ missing for anyone without a membership row (active or still-pending) —
  the same 404 as a private Ranch. `open`/`members` are visible (name, description, visibility) to any active,
  signed-in person; neither ever shows a member count.
- **The roster is member-only**, independent of the Town Hall's own visibility: only a current active member (owner
  included) may read who else is in it. Everyone else gets the same 404 whether the Town Hall exists, is private, or
  they simply are not a member of a perfectly public one.
- An invite is a membership row with `status = 'invited'`; only the owner may create one, and only the invitee's own
  `accept`/`decline` changes it. Nobody else — not even other members — can see someone's pending invite to a Town
  Hall they have not joined.
- Deleting the owner's account deletes the whole Town Hall (and every membership in it); deleting anyone else's
  account only ever removes their own membership row (and their posts, replies and reactions in its feed).
- **The feed is member-only (ADR-033):** posts, replies and reactions are readable only by current active members;
  everyone else gets the same 404. Blocks and mutes hide posts as on the Fence; held posts are seen only by their
  writer (as if posted) and the owner. Feed Chimes vanish once the recipient is no longer a member.
