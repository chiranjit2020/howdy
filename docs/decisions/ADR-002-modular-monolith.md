# ADR-002 — Modular monolith, single TypeScript codebase

**Context.** Small team, early product, but clear domain boundaries (auth, profiles, relationships, fence, whispers, …)
and one component (WebSockets) that needs a long-lived process.

**Decision.** One repository and one Next.js application organised into `src/modules/*` with enforced public
surfaces. The WebSocket server is a second entrypoint of the same codebase (Phase 7). No microservices, no
monorepo tooling until a second package is genuinely needed.

**Alternatives.** Microservices (operational cost, no benefit at this scale); pnpm workspace monorepo now
(premature); separate backend repo (duplicated types/validation).

**Reason.** Simplest structure that keeps boundaries clean and stays extractable.

**Consequences.** Boundary discipline is enforced by lint rules and review, not by the network. Modules must not
reach into each other's tables/repositories.
