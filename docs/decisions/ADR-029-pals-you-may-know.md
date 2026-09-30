# ADR-029 — "Pals you may know"

Status: accepted (Phase 13, 2026-09-30). The "Advanced Intelligence" part of Phase 13, as chosen with you: suggestions
from the Pal graph, computed in Postgres — no machine learning, no graph database (master prompt §44, §50).

## Decisions

1. **Who:** people who are Pals with **at least two** of my Pals, most shared Pals first, up to 10, with up to two of
   those shared Pals named ("Pals with Asha and Ravi"). One shared Pal is not enough: it would turn every Pal's list into
   a directory.
2. **Never suggested**, each exclusion indistinguishable from "not enough shared Pals":
   - me, my Pals, and anyone with any Pal link with me at all — an ask either way, or one ever declined (a decline is
     never revealed, so a declined person must not reappear as a suggestion);
   - anyone with a block, mute or restrict between us, in either direction;
   - anyone not active, anyone whose Porch I could not open (the same `profile:view` policy as the Porch, as a
     passer-by), anyone who switched suggestions off, anyone I dismissed.
3. **Opt-out:** `profiles.discoverable` (default on), the Workshop switch "Suggest me to Pals of my Pals". **Not now**
   stores a private dismissal (`suggestion_dismissals`) and answers the same for any call sign.
4. **Computed on read, one query** plus two batched lookups: 12 ms locally at 20k people, ~47 ms with a simulated
   10 ms database round trip. Nothing is precomputed or stored about anyone's graph.
5. **Asking** from a suggestion is the ordinary Pal request (same daily budget, same first-week budget, ADR-024).

## Verification

`tests/security/suggestions.test.ts` (10). Mutation run `.dev/mutate19.mjs`: every exclusion removed one at a time is
caught (the SQL "active" filter is a second guard behind the name lookup, expected to escape). Migration `0024`.
