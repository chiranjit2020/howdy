# ADR-052 — Friends describe you in words; the Trusted tick is a safety signal

Status: accepted (2026-11-01). Supersedes the Marks part of ADR-016 (counted Badges, 30-day wait) and the Mark rules of ADR-020
(Trusted tick).
Asked for by you: "Slim both Badges and Trust Ticks. Rather we need to re-architect their purpose."

## Why

Badges counted how many of each kind someone had been given, with a 30-day wait between gifts. Counts invite
comparison and farming, and the Trusted tick leaned on them, so popularity fed what should be a safety signal. Neither
told a visitor anything useful.

## Decisions taken with you (2026-11-01)

- **Words, not numbers.** Each friend (or group neighbour, ADR-044) holds one word for you, which they can change or take
  back. Your profile shows "Friends say: Chill · Sharp", with no counts, and only once 3 people have picked.
- **Safety signal, no badges.** The Trusted tick means "this looks like a real, settled account in good standing". It
  does not mean "popular". Your progress lives in Settings, not on your profile.

## Decisions

1. **One current word per pair.** `marks` has a unique index on (rater, target) (`marks_one_per_pair_idx`, migration
   0043). Picking again replaces the word, so there is no wait. Taking it back deletes the row. Migration 0043 first
   keeps only each pair's newest Mark.
2. **What a visitor learns.** `getDescription` returns at most the top 2 words, and only once 3 or more people describe
   the person. Ties break in catalogue order. It never returns counts, who picked what, or anything below the threshold.
   Below 3, nothing shows, so a single picker cannot be identified.
3. **Where you pick.** Picking happens in the "You and …" card on someone's profile ("Describe {name}" chips). The
   Badges side card is gone. The owner and anyone who may not give see no picker. The same read-time rules as before
   decide who may give: friend or neighbour, profile visible, no block.
4. **The notification** says "X described you on Howdy." It never names the word. It fires on a first pick only: a
   changed word is not news, and a repeat from the same person merges into the earlier notification.
5. **The Trusted tick checks** are: email confirmed; account 30+ days old; a profile photo; 3+ friends whose own accounts
   are active and 14+ days old ("settled friends"); seen within 30 days; no upheld report in 180 days. Words play no
   part, and a picked word re-checks nobody. A friendship still re-checks both people.
6. **Visitors see only the tick**, never the checklist. The checklist with progress is in Settings (hidden for the team
   account, which carries Verified instead).

## Consequences

- The code depends on the unique index (the upsert uses `on conflict (rater_id, target_id)`), so migration 0043 must be
  applied before this ships.
- The data export still lists the Marks you gave and received (now at most one per person).
