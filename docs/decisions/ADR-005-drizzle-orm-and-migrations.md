# ADR-005 — Drizzle ORM + SQL migrations

**Context.** Need typed access to Postgres, constraints/indexes expressed explicitly, reviewable migrations, and a
driver that works with Neon (HTTP/WebSocket) and plain `pg` in tests.

**Decision.** Drizzle ORM with `drizzle-kit generate` producing committed SQL migrations in `db/migrations/`.
Schema in `db/schema/*.ts` grouped by module. Production applies migrations with `drizzle-kit migrate` from CI/deploy,
never by hand. Check constraints, FKs and partial/unique indexes are written in the schema, or in hand-edited
migration SQL where the ORM can't express them (still committed).

**Alternatives.** Prisma (heavier engine, less direct control over constraints/raw SQL); Kysely + node-pg-migrate
(more assembly); raw SQL only (no types).

**Reason.** SQL-first, thin, good Neon support, keeps schema transparent.

**Consequences.** Team must read generated SQL in review. Row-level details Drizzle cannot express go in migration SQL.
