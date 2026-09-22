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
        ├─< audit_log        ON DELETE SET NULL  (trail survives, anonymised)
        └─< reports          ON DELETE SET NULL  (reporter and target; evidence survives, identifiers go)
```

Everything a user owns hangs off `users` by cascade, so removing the `users` row cannot leave orphans. **Two deliberate exceptions keep
their rows and lose the link (`… → NULL`): the audit log and reports** (evidence must outlive either account). Tested: deleting a user
removes every link, scout and control involving them, and leaves their reports with the identifier cleared.

**Post Cards (Phase 5): deleted with either account.** A card is removed when its writer is deleted *and* when the owner of the
Fence it hangs on is deleted; its replies and Yos go with it, and a deleted person's own replies and Yos vanish from other people's
cards. (The earlier plan to anonymise cards others replied to was dropped: a card whose writer has gone is simply gone, which is the
privacy-preserving default and avoids "Former neighbour" placeholders.) Reports keep `evidence_text`, a snapshot of a reported card's
words, after the card is gone. Tested: deleting a user removes their cards, replies and Yos and the cards left on their Fence.

Planned (each must declare its deletion behaviour when created):

| Future table | Owner link | On account deletion |
| --- | --- | --- |
| `tips` | giver | delete |
| `tributes` | author + recipient | delete when either side is deleted |
| `moderation_actions` (Phase 11) | subject / moderator | keep for safety with identifiers removed; never cascade-delete evidence |

**Media (Phase 9): rows cascade, files do not.** A `media` row (a Portrait) points at a file in object storage; deleting the `users`
row removes the row but the database cannot remove the file. **Account deletion must therefore call `deleteAllMediaFor(userId)`
(objects first, then rows) BEFORE it deletes the `users` row**, or the files are orphaned with nothing left to find them. The deletion
flow itself is not built yet; this is the step it must include (tested: the function removes a person's objects and rows and nobody else's).
A Portrait has three states: `pending` (a signed upload URL was issued, nothing is trusted), `ready` (decoded, cropped, re-encoded, served;
at most one per person, enforced by the database) and `retired` (replaced or removed, its file being deleted). The raw upload is
recorded as a `retired` row in the same transaction that makes the new photo live, so even a failed delete leaves a row to retry from.

## 2. Account deletion ("Burn the Deed") — design, not yet built

`users.status` already allows `pending_deletion`. The process, to be implemented as its own use case with a test per step:

1. **Re-authenticate** (password), then set `status = 'pending_deletion'`. Effect is immediate: `validateSession` and the
   authorisation policy both deny non-`active` accounts, so every session dies and the Ranch disappears.
2. **Grace period** (proposed 14 days): the owner can sign in only to cancel. A daily job finds expired grace periods.
3. **Purge**, in one transaction per user, in this order: revoke/delete sessions and tokens → remove authored content per the table
   above (anonymise vs delete) → delete `profiles`, `credentials` → delete the `users` row (audit rows keep `user_id = NULL`).
4. **Objects** in storage (Portraits, via `deleteAllMediaFor`) are deleted *before* the rows that reference them, so a failure leaves rows to retry from.
5. Confirmation email; the handle becomes available again after a cooling-off period (proposed 90 days) to prevent impersonation.

## 3. Retention (master prompt §54) — what is kept, how long, who removes it

| Data | Kept | Removed by |
| --- | --- | --- |
| **Signal** (`profiles.signal*`) | 12 hours from being set. Reads ignore an expired Signal immediately | `clearExpiredSignals()` physically clears it |
| Session (`sessions`) | idle 14 d / absolute 60 d; dead rows kept 30 d after revoke/expiry for support | `purgeExpiredAuthData()` |
| Email tokens (`email_tokens`) | verify 24 h, reset 1 h; spent/expired rows kept 7 d | `purgeExpiredAuthData()` |
| Audit log (`audit_log`) | **not yet limited** — needs a retention period decided (proposed 12 months) | — (gap) |
| Rate-limit counters (Redis) | ≤ 1 hour, expire on their own | Redis TTL |
| **Tracks** (`tracks`) | **7 days**: a row holds only the UTC date of the latest visit; reads ignore older rows at once | `purgeOldTracks()` (in `pnpm jobs:purge`); also deleted with either person |
| **Whispers** (`messages`) | **7 days** from being sent, or at once by "Burn Thread" (either person, both sides) | `purgeOldWhispers()` (in `pnpm jobs:purge`); threads left empty are dropped with them |
| Chimes (`notifications`) | read: 30 days after being read; unread: 90 days after being rung | `purgeOldChimes()` (in `pnpm jobs:purge`) |
| **Portrait files** (`media`) | a live Portrait until replaced/removed or the account is deleted; an **unfinished upload 60 minutes**; a replaced/removed file is deleted at once and, if storage failed, retried by the job | `purgeStaleMedia()` (in `pnpm jobs:purge`); removal deletes the object first, then the row |
| Waiting cards / replies (`status` pending or held) | 30 days from being written, then dropped if the owner never answered | `purgeStaleWaiting()` (in `pnpm jobs:purge`) |
| Published cards, replies, Yos | until removed by their writer / the Fence owner, or an account is deleted | people; account deletion |
| Report evidence snapshot (`reports.evidence_text`) | with the report (Phase 11 decides the period) | — |
| Tracks / typing / presence (future) | seconds → days, per ADR-006 | their own jobs |
| Logs | no passwords, tokens, cookies or message/Signal bodies (redacted) | log platform retention |

**Running the jobs:** `pnpm jobs:purge` runs every purge and prints a JSON summary; it is idempotent. **Scheduling it is a
deployment task that is not done** — choose cron / the platform scheduler / a worker before going live, otherwise expired rows
accumulate (reads are already correct without it; this is about not keeping data forever).

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
- No read receipts: each person stores only their own read position; it is never sent to the other person.
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
