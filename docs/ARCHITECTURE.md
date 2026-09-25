# Howdy — Architecture

Status: initial (Phase 0). Update when decisions change; record significant changes as ADRs in `docs/decisions/`.

## 1. Shape

Modular monolith, TypeScript end to end.

```text
Browser (Next.js / React, PWA-capable)
   │  HTTPS (cookies)            │  WSS (Phase 7)
   ▼                             ▼
Next.js app (route handlers, server actions)     WS server (separate Node process, same codebase)
   │                                                   │
   └───────────── application services ────────────────┘
                     │  policies (authorization)
                     │  domain rules
                     ▼
                repositories ──► PostgreSQL (Neon)  = source of truth
                     └────────► Redis               = rate limits, pub/sub, ephemeral state
```

A WebSocket server needs a long-lived process and cannot run on serverless route handlers, so it ships as a second
entrypoint sharing the same `src/modules/*` code. That is the only "second deployable"; it arrives in Phase 7.

## 2. Repository layout (target)

```text
src/
  app/                 Next.js routes (thin: parse → call use case → render/respond)
  modules/
    <module>/          auth, users, profiles, relationships, fence, tracks, whispers, ...
      domain/          pure rules and types (no I/O)
      application/     use cases / services (orchestration, transactions)
      infrastructure/  repositories (Drizzle), external adapters
      http/            request schemas (zod), handlers
      index.ts         public surface of the module; other modules import ONLY from here
  platform/            cross-cutting: config/env, db, redis, logger, errors, rate-limit, mailer, storage (object store: local folder or R2), http helpers
  ui/                  design system: tokens, primitives, howdy components
db/
  migrations/          generated SQL migrations (committed)
  schema/              Drizzle schema, grouped per module
docs/                  BUILD_STATUS, ARCHITECTURE, PRODUCT_DISCOVERY, decisions/
tests/                 unit/, integration/, security/, e2e/
```

Rules:
- Modules talk to each other through `index.ts` only. **Enforced by ESLint** (`eslint.config.mjs`, tested in
  `tests/unit/lint-boundaries.test.ts`): `app → modules → platform/shared`; `ui` imports only `shared`; `platform`/`shared` never
  import upward; and modules depend on each other one way only — `auth → profiles → (authz, relationships)`. HTTP routes that
  need two modules (e.g. `/api/me/*`: auth for *who*, profiles for *what*) live in the app layer. See ADR-009.
- Modules today: `auth`, `profiles` (the Ranch), `authz` (the single `can()` policy), `relationships` (Posse / Scouting / Block / Mute / Restrict, ids only), `moderation` (reports), `fence` (Post Cards, replies, Yo), `whispers` (private threads; ADR-013), `tracks` (profile visits, Shadow Walk; listens to `ranch.visited`, ADR-014), `media` (Portraits / profile photos: signed upload, decode + re-encode, object storage; who may SEE a photo is decided in the app layer with `mayViewRanch`, ADR-015), `notifications` (Chimes; listens to domain events from `relationships`, `fence`, `tributes`, `marks` and `town-halls`, wired in `src/app/_lib/wire-events.ts`, ADR-012), `tributes` (testimonials, owner approval always required, at most one pinned), `marks` (Chill/Pure/Cinema/Sigma/Gem deep-vibe awards, an append-only log with a 30-day per-pair cooldown; ADR-016) and `town-halls` (communities: directory + membership only, no feed yet; ADR-017). Dependency chain `auth → profiles → relationships → authz`, with `fence`, `notifications`, `whispers`, `tributes` and `marks` → `(profiles, relationships, authz)`, `tracks` → `(profiles, relationships)` and `town-halls` → `(profiles)` only (no relationship/authz gate — membership is its own gate); `moderation` and `media` stand alone; the app layer composes them (`src/app/_lib/social.ts`). See ADR-009, ADR-010, ADR-011, ADR-012, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017.
- No business logic in route handlers or React components.
- Layers only depend downward: `http → application → domain`, `application → infrastructure` via interfaces where a
  test seam is genuinely useful (not for everything).
- Naming: UI vocabulary (Ranch, Fence, Tracks) appears in routes, copy and component names only; domain code uses
  conventional names (Profile, PostCard, ProfileVisit).

## 3. Security foundation (Phase 0/2)

_Status: implemented and tested in Phases 0 and 2 — see ADR-008 for the concrete decisions, limits and known gaps. Module:
`src/modules/auth` (public surface `@/modules/auth`); shared pure validation in `src/shared/validation/auth.ts`._

- **Passwords:** Argon2id (`@node-rs/argon2`), OWASP-baseline parameters, optional server-side pepper from env.
- **Sessions:** opaque random 256-bit tokens; only a SHA-256 hash is stored; `HttpOnly; Secure; SameSite=Lax` cookie
  (`__Host-` prefix in production); sliding idle expiry + absolute max age; rotation on login and privilege change;
  per-device rows enabling "logout here" and "logout everywhere" (ADR-004).
- **CSRF:** SameSite=Lax + mandatory `Origin`/`Sec-Fetch-Site` check on all state-changing requests + no state
  change on GET. Server actions/route handlers share one guard.
- **Headers:** strict CSP with per-request nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `frame-ancestors 'none'`.
- **Validation:** zod at every boundary (HTTP, WS frames, env). Output encoded by React; no `dangerouslySetInnerHTML`.
- **SQL:** parameterised queries only (Drizzle); no string-built SQL.
- **Rate limiting:** one `RateLimiter` interface; Redis implementation for real use, in-memory for dev/tests.
  Limits keyed by IP *and* account/handle for login, signup, reset, verification resend.
- **Enumeration:** signup/login/reset return uniform responses and comparable timing; existence is never revealed.
- **Email tokens** (verify / reset): random, hashed at rest, single-use, short expiry.
- **Authorization:** central policy layer (`can(actor, action, resource)`), evaluated in application services — never in
  controllers or the UI. Inputs: authentication, resource existence, relationship state, privacy settings, account
  status, rate limit. Block overrides everything. Missing/forbidden resources return the same 404 where existence
  would leak information.
- **Errors:** one `AppError` model with stable public codes; unknown errors → generic 500 with request ID, details only
  in logs.
- **Logging:** structured JSON (pino) with request ID, user ID, event, duration, error class; redaction list for
  passwords, tokens, cookies, message bodies.
- **Secrets:** `.env.local` (git-ignored) + `.env.example`; env validated at boot by zod; app refuses to start with
  missing/weak `AUTH_SECRET` in production.

## 4. Data

PostgreSQL (Neon) is the only durable store. Drizzle ORM with generated SQL migrations checked into git; schema
changes never applied by hand. Conventions: UUIDv7 or `uuid` primary keys (non-enumerable), `timestamptz`,
foreign keys with intentional `ON DELETE`, check constraints for enums/limits, indexes for every access path,
soft-delete only where product needs it (account deletion is a staged process, see below).

Account deletion is designed, not `DELETE FROM users`: mark pending → revoke sessions → anonymise authored content or
remove per policy → purge derived/ephemeral data → hard-delete after grace period. Dependency graph is written down
in Phase 3 before the profile tables ship.

Pagination: cursor-based (keyset) everywhere a list can grow. No unbounded queries.

## 5. Redis (introduced Phase 2 for rate limiting; more in 7/8)

Rate limits, pub/sub for WebSocket fan-out, presence/typing, ephemeral counters. Never the system of record.
Dev: Docker Redis. The app must degrade safely (fail closed for auth rate limiting) if Redis is unreachable.

## 6. Realtime (Phase 7 — built, ADR-013)

Versioned `WsFrame` envelope from master prompt §29 (`v`, `op`, `type`, `requestId`, `seq`, `serverTime`, `d`).
Flow: authenticate on connect (Origin + session cookie) → authorise per action → validate (zod) → persist in Postgres →
publish a hint via Redis → the realtime process re-authorises and delivers. Run it with `pnpm ws` (`src/realtime/server.ts`, `scripts/ws.ts`). Client message IDs give idempotency; server sequence numbers plus a `since` cursor give
resync after reconnect.

## 7. Frontend / design system (Phase 1)

Decisions and rationale: **ADR-007**. Layout:

```text
src/ui/styles/tokens.css   ONLY place with raw colours. light-dark(Daylight, Dusk) per semantic token, type/radius/shadow/motion tokens
src/ui/primitives/         Button, IconButton, Input/Textarea/Select, Checkbox/Radio/Switch, Avatar, Badge/Chip, Card/ClayCard,
                           Modal/Drawer/Dialog/ConfirmationDialog (native <dialog>), Popover, Tooltip, Dropdown (menu), Toast,
                           Tabs, Navigation/BottomNavigation, Skeleton/EmptyState/ErrorState/LoadingState
src/ui/howdy/              RanchHeader, Signal, PostCard(+Reply,+Composer), YoButton, TipHatButton, TrackItem, TributeCard,
                           VibeMatrix, Fence, WhisperBubble, PosseBadge, TownHallCard, ChimeItem
src/shared/                content limits (LIMITS) and relationship states shared by UI and, later, server validation
src/app/workshop/kit/      dev-only component gallery (404 in production unless ENABLE_DESIGN_KIT=1, used by e2e)
```

Rules: components use semantic utilities only (`bg-surface`, `text-text-primary`, `shadow-clay-sm`) — no hex, no arbitrary font
sizes, no inline `style` (CSP). Interactive primitives implement the relevant WAI-ARIA pattern themselves and are behaviour-tested.
Theme is a cookie read by the root layout (no inline script). Tracks are shown only with coarse time buckets (privacy rule
encoded in `TrackItem`), and Post Card / reply / Whisper limits come from `src/shared/limits.ts`.

## 7b. Testing

- `pnpm test` (Vitest): `tests/unit` (tokens, contrast, compiled Tailwind output, env, errors, logger, rate limiter),
  `tests/security` (CSRF, route wrapper, CSP), `tests/ui` (jsdom + Testing Library + axe: keyboard behaviour, ARIA, privacy
  rules in components), `tests/integration` (real Postgres/Redis via `pnpm infra:up`).
- `pnpm e2e` (Playwright + locally installed Edge, **production build**): real CSP violations/console errors, fonts, theme
  persistence, keyboard flows, 320px overflow, ≥44px touch targets, reduced motion, screenshots.
- Auth/authorisation abuse suites (master prompt §33) land with Phase 2 under `tests/security/`.
- CI order: format, lint, typecheck, `pnpm test`, build, `pnpm e2e`.

## 8. Deferred (explicitly not now)

Neo4j, Elasticsearch, Kafka, microservices, event sourcing, CQRS, ML recommendations, video, livestreaming,
passkeys/MFA (schema stays open for them). (Object storage was decided in Phase 9: Cloudflare R2 through the S3
protocol, ADR-015. Still deferred: photos on Post Cards, image moderation, a CDN.)
