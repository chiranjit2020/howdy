# ADR-001 — PostgreSQL (Neon) as the source of truth

**Context.** Howdy's data is relational: users, relationships, permissions, posts, replies, conversations,
memberships, moderation. Integrity (FKs, uniqueness, checks) matters for security and privacy rules.

**Decision.** Neon PostgreSQL is the only durable store. Redis holds ephemeral/realtime state only.

**Alternatives.** MongoDB (weaker integrity for relational rules); Redis-primary for Whispers/Tracks as suggested in
the source discussion (loses durability, complicates moderation/audit and account deletion); Neo4j (see below).

**Reason.** Constraints and transactions enforce invariants that authorization depends on. Social graph needs are 1–2
hops for the foreseeable future, which Postgres handles well.

**Consequences.** Schema design and migrations are required up front. Neon serverless: use pooled connection string for
the app, direct connection for migrations. Reconsider Neo4j only if multi-hop/graph-recommendation needs appear.
