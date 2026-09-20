# ADR-014 — Tracks (profile visits) and Shadow Walk

Status: accepted (Phase 8). Resolves the open items in ADR-006 (Tracks storage) and PRODUCT_DISCOVERY (C3, C6).

## Context

"Who stopped by" is the most sensitive thing Howdy records: it says who looked at whom, and a leak is a stalking tool. The master
prompt asks for privacy to be designed first, deduplication and retention limits, and nothing that identifies a device or place.

## Decisions

1. **Postgres, not Redis** (ADR-006 default kept). One row per (owner, visitor) holding **only the UTC date** of the latest visit — a
   `date` column, so the database cannot hold a time of day, and there is no counter, address, device or place. The upsert only
   changes the row when the date moves forward, so a person refreshing all day writes once (tested by row version).
2. **Recorded after the response, from a domain event** (`ranch.visited`, emitted by `profiles` only after the policy allowed the
   view). The visitor's response can never depend on it, and a failing listener changes nothing. Only a signed-in person opening
   *someone else's* Ranch counts: not signed-out visitors, not yourself, not lists, headers or Posse pages (checked in a browser).
3. **Nothing recorded for**: a visitor on Shadow Walk, an inactive account, or a person in a block with the owner (defence in depth:
   a blocked person cannot open the Ranch anyway).
4. **Who is named is decided when the list is read**, from today's relationships: only people in a mutual Posse, and only while it
   lasts. Everyone else collapses into a **count per coarse bucket** with no clues (k-anonymity needs cohorts that do not exist; no
   location or demographic clues, C6). Muted or blocked people (either direction) and inactive accounts are not shown or even
   counted — so a block "removes them from past Tracks" without deleting anything.
5. **Only ever Today / Yesterday / This week** (UTC days). Same-day visitors are ordered by call sign, never by arrival, so the order
   leaks nothing. Newest first, at most 50 named.
6. **Shadow Walk** (a private profile flag, never returned to anyone else): while on, your visits leave no Track — indistinguishable
   from not visiting — and, reciprocally, **your own Tracks are frozen** (an empty, explained page). Visits to you keep being
   recorded for their week, so turning it off shows them; that keeps the trade honest (no peeking for free) without losing data.
7. **Retention: 7 days** (`pnpm jobs:purge`); reads ignore older rows immediately. Deleted with either person.
8. Read limit 120/minute per person, fails closed. There is **no endpoint that says where anyone has been**: only *my* incoming Tracks.
9. **No Tracks Chime or push in this phase.** A per-visit notification would be a live signal of who visited, and a digest needs a
   scheduler that does not exist yet (deferred, together with "Guess Who" and reveal tokens).

## Consequences

- Posse members always see each other's visits unless the visitor chose Shadow Walk. This is disclosed on the Tracks page.
- A person with few non-Posse visitors can guess who a "hidden" one was from what they know; coarse buckets, dedup and 7 days limit
  the value, and Shadow Walk is the answer.
- The header has a seventh item; it wraps on phones.

## Not in this phase

Digest notifications, Guess Who / Daily Spark Token, cohort or location clues, per-visitor history beyond a week, "who I visited".
