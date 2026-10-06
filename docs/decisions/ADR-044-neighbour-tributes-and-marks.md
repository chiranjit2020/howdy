# ADR-044 — Tributes and Marks from Town Hall neighbours

**Context.** Tributes (ADR-016) and Marks were Pals-only, like Whispers. With Town Halls now real communities (feeds,
Deputies, bans), people who share one see each other's words for weeks without being Pals, and kind words between
them had nowhere to go. BUILD_STATUS listed "revisit whether Tribute/Mark giving should widen beyond Pals"; the welcome
page listed it as "Exploring".

**Decisions (the user's, 2026-10-06).**
1. **A neighbour** is someone who has been an **active member of the same Town Hall as you for 14+ days — both of
   you.** Joining a hall just to hand out or collect Marks does not work straight away.
2. **Neighbours may give both Marks and Tributes.** A Tribute still waits for the Porch owner's approval; a Mark still
   has the 30-day cooldown per pair.
3. **Neighbours' Marks do not count toward the Trusted tick** (ADR-020): only Pals' Marks do, so a group in a hall
   cannot farm ticks for each other.

## How it works
- **One rule, one place.** `PolicyContext.neighbour` (a fact the caller loads); `tribute:give` and `mark:give` allow
  Pals OR neighbours, with no block either way; `whisper:exchange` ignores it — Whispers stay Pals-only. Giving still
  needs the Porch to be visible to the giver (a Pals-only Porch has nothing to give on).
- **`areNeighbours(a, b)`** (`town-halls/neighbours.ts`): one query — both rows `active` in one Town Hall, each
  `coalesce(joined_at, created_at)` at least 14 days ago. `giveContext` runs it only when it could change the answer
  (not Pals, no block, signed in, not the owner).
- **`town_hall_members.joined_at`** (new): when someone became an active member, set on every path into `active` —
  creating a hall, one-tap join, accepting an invite, being let in. `created_at` keeps meaning "when the row was made",
  which for an invite or a request is when it was sent: without `joined_at` a request approved after 20 days would
  have counted as 20 days of membership. Existing active rows were backfilled from `created_at`.
- **`marks.from_pal`** (new, no default — every insert must say): true when the two were Pals when it was given. The
  Trusted tick counts `from_pal` Marks only. Existing Marks were all Pals-only, so they were backfilled `true`.
- Wording: the errors now say "Only Pals and Town Hall neighbours can…"; the glossary says where Tributes and Marks
  come from. Privacy Policy 1.15.0 (no re-acceptance). The welcome page moved it from "Exploring" to built.
- Migration `0036_neighbours`.

## Alternatives considered
- **Any shared Town Hall, at once** — simplest, but join-a-hall-to-farm-Marks works instantly.
- **Neighbour Marks count for the tick** — more generous; a group could tick each other up inside one hall.
- **Marks only** — the user chose both: Tributes are already gated by the owner's approval.
- **Re-check "were they Pals" at tick time** instead of storing `from_pal` — Pals change over time; the question is
  what the giver was when giving, which only the moment of giving knows.

## Consequences / known limits
- A neighbour stays able to give for as long as both stay in the hall; leaving or being banned ends it at once.
  Tributes and Marks already given stay, as when Pals part.
- `areNeighbours` adds one query to a Porch view by a non-Pal (the Vibe Matrix and the Tributes section each ask once).
- `joined_at` is not in "Download my data" (memberships there are listed without dates, as before).
