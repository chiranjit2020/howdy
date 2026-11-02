# ADR-061 — Friends you may know, where people will see it; one flat colour on panel cards

Status: accepted (2026-11-02). Your choice (option 1 of three) after seeing the card on the local server.

## Why

"Friends you may know" (ADR-029) was only on the Friends page, in the right panel. On a phone that panel comes after
the whole friends list: about 1.2 screens down with 11 friends, roughly 8 with 100, so most people would never see it.
Who is suggested, and the minimum of two friends in common, do not change. Neo4j or any other graph store was
considered and turned down: the one Postgres query is 12 ms at 20k people (ADR-029), and a second copy of who knows whom
would have to be kept in step with blocks, mutes and deletions.

## Decisions

1. **Home's right panel** (wide screens) gets a "Friends you may know" card after Messages and Friend requests: the top
   three, and "See all" (to Friends) when there are more. Not now or Ask works from the card; a dismissed person's place
   goes to the next one. Fetched with the rest of Home, best-effort (no card rather than no Home).
2. **Friends page on a phone:** the card comes right under the heading, above the list, three at a time with
   "Show N more". On wide screens it stays at the top of the right panel, all of them (up to ten). Only one of the two
   copies is ever displayed (each has its own heading id).
3. **Home on a phone** has no right panel, and so no card: Friends is one tap away in the bottom bar.
4. **Panel cards (RailCard) lose the violet and sunflower diagonal stripes:** a solid 6 px sunflower bar instead. The
   stripes read as "still loading" on a phone.
