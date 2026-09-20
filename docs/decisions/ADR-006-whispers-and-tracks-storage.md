# ADR-006 — Storage of Whispers and Tracks (resolving conflict with source doc)

**Context.** The source discussion stores Whispers in Redis Streams (7-day TTL) and Tracks in Redis ZSETs, "never in a
relational table". The master prompt makes PostgreSQL the durable source of truth and Redis realtime/ephemeral only,
while still wanting Tracks to be short-retention events.

**Decision.**
- **Whispers:** Postgres `conversation` / `conversation_member` / `message`. Redis pub/sub only relays live delivery.
  Retention (default 7 days unless pinned by both parties) is enforced by a scheduled purge job; "Burn Thread" is a
  hard delete. We make no end-to-end-encryption claim.
- **Tracks:** decided at Phase 8. Default is a Postgres table with a hard TTL purge (7 days) plus a Redis dedup key
  (24h) for ingest. Move to Redis-only storage only if measurements show the write volume needs it. No IP, device
  fingerprint or location is ever stored.

**Alternatives.** Redis-primary for both (loses durability, complicates reports/moderation/deletion, cache eviction
could silently drop user data).

**Reason.** Moderation, abuse investigation, account deletion and reconnect-sync all need durable, queryable,
authorised data. Ephemerality is achieved by explicit retention jobs, not by hoping the cache holds.

**Consequences.** Needs a retention worker (Phase 7/8). Postgres write volume for Tracks must be watched; dedup at
ingest keeps it bounded.
