# ADR-030 — Performance at 20,000 people: measure first, then cut round trips

Status: accepted (Phase 13, 2026-09-30). Master prompt §51: "optimize after measuring".

## How it was measured

- `.dev/perf/seed.sql` builds a local `howdy_perf` database at the scale chosen with you (~20k people): 98k Pal links,
  300k Post Cards, 150k replies, 500k reactions, 298k Chimes (90 days), 200k Whispers in 34k threads, 49k Tracks, 20k
  Tributes, 39k Marks, 500 Town Halls, 4.8k Time Capsules. Clustered in communities of ~200, so friends-of-friends is
  realistic. Never run against dev or prod.
- `.dev/perf/bench.ts` calls the real service functions for a typical and a busy person, counts SQL statements, records
  any statement over 20 ms, and with `RTT_MS=10` adds a delay to every statement to simulate the network between the
  app (Vercel `iad1`, Washington) and the database (Neon `us-east-2`, Ohio).

## What it showed

- **No slow query.** At this size every statement ran under 20 ms; the indexes that exist are the ones needed. No new
  index was added (the partial indexes from Phase 11/12 already cover the new paths).
- **Round trips are the cost.** Locally a query takes ~0.1 ms; in production each is a network round trip. The bell
  (unread Chimes, on EVERY page) made 25–35 queries — one Fence lookup and one relationship lookup per Fence owner
  mentioned — and the Chimes page 86–91.
- **Sequential chains.** The Fence, Tributes and Vibe Matrix awaited independent lookups one after another.

## Changes

1. **Batched lookups** for the Chimes filter: `getFenceResources` (one query for many owners) and `fenceStandings`
   (three queries for many owners). `tests/security/batch-equivalence.test.ts` proves every batched answer equals the
   single-owner original, across all nine relationship states plus inactive, official and private owners.
2. **Independent lookups in parallel**: Fence access (Fence + standing), card authors + hidden people, reply authors +
   hidden people; the same for Tributes and Marks access; the Vibe Matrix counts + cooldown.

| With a 10 ms round trip | before | after |
| --- | --- | --- |
| Bell count, every page | 93 ms, 35 queries | 31 ms, 9 queries |
| Chimes page | 231 ms, 91 queries | 93 ms, 19 queries |
| Porch Fence, a Pal looking | 139 ms | 108 ms |
| Porch Tributes | 93 ms | 79 ms |
| Porch Vibe Matrix | 78 ms | 47 ms |

## The biggest remaining win is not code

Most people are in India; every request crosses to Washington and every query goes on to Ohio (the health report
measured ~250 ms for one query from India). `docs/RUNBOOK-move-to-singapore.md` moves both to Singapore (~30–60 ms from
India). It needs your Vercel and Neon accounts, so it is yours to schedule.

## Not done (not needed at this size)

Caching (Redis) for reads, read replicas, a search engine, a graph database, splitting services: nothing measured
needs them (master prompt §8, §43, §44, §50). Revisit with real traffic numbers.
