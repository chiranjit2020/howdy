# Howdy

A small, friendly social network for staying close to the people you actually know: friends, profiles, posts,
messages and groups, without an algorithmic feed or follower counts to chase. Built mainly for people in India.

**Live:** https://howdy.chiranjitkarmakar.com · **Status:** in production, actively developed (last updated 2026-11-10)

## What it does

- **Friends** – send and accept friend requests, suggestions on Home, block and report.
- **Profile** – photo, cover, details, a Wall of posts with a pinned post, testimonials from friends, profile visitors
  (with private browsing).
- **Posts** – text and photo posts, replies, waves; long posts fold behind "Read more".
- **Messages** – real-time one-to-one chat with optional "Seen", held messages from strangers, phone notifications.
- **Groups** – roles, pinned posts, polls, events, photos and bans.
- **Notifications**, **search**, **stories**, **time capsules and memories**, **"Free to talk"** status.
- **Safety** – reporting, a moderation queue, suspensions with in-app appeals, first-week spam limits, a Trusted tick
  for established accounts and a Verified badge for the Howdy team.
- **Your data** – data export by email, account deletion with a 14-day grace period, Privacy Policy, Terms and
  Community Guidelines.
- **Admin** – Mission Console: alerts, sign-in pressure, open reports, activity chart, social pulse, system health.
- Installable as an app (PWA) with offline, 404 and error pages.

## Tech stack

| Area      | Choice                                                                    |
| --------- | ------------------------------------------------------------------------- |
| App       | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS               |
| Database  | PostgreSQL on Neon (Singapore) with Drizzle ORM and SQL migrations        |
| Cache     | Redis (Upstash in production) for rate limits and sessions                |
| Real-time | WebSockets (`pnpm ws`) / Ably                                             |
| Auth      | Own sessions, Argon2 passwords, passkeys (WebAuthn), two-step sign-in     |
| Photos    | Cloudflare R2 (S3 protocol), resized with sharp                           |
| Mail      | Resend                                                                    |
| Hosting   | Vercel, region `sin1`; a push to `main` deploys production                |
| Icons     | Phosphor (Regular)                                                        |
| Tests     | Vitest (unit, integration, security) and Playwright + axe (end-to-end)    |

## Project layout

```
src/app/        routes: (app) signed-in pages, (auth) log in/sign up, (welcome) landing, (legal), admin, api
src/modules/    features, one folder each (auth, authz, fence, whispers, town-halls, moderation, trust, …)
db/             Drizzle schema, migrations, database roles
tests/          unit, integration, security, ui and e2e suites
scripts/        local infra, WebSocket server, purge job, role tools, seed data
docs/           architecture, build status, data lifecycle, threat models, ADRs (docs/decisions)
```

The interface uses everyday words (Friends, Profile, Messages, Groups). Some internal names are older and were kept on
purpose: Fence = Wall, Whispers = Messages, Town Halls = Groups, Porch = Profile, Tributes = Testimonials.

## Running it locally

Requires Node 26 and pnpm 10.

```bash
pnpm install
cp .env.example .env.local      # then fill in the values
pnpm infra:up                   # local Postgres (5433) and Redis (6380)
pnpm db:migrate
pnpm seed:dev                   # optional test data
pnpm dev                        # http://localhost:3000
pnpm ws                         # real-time server, in a second terminal
```

## Checks

```bash
pnpm check     # format, lint, typecheck, unit tests, production build
pnpm e2e       # production build + Playwright end-to-end tests
```

## Deploying

Pushing to `main` deploys to Vercel. Production does **not** run migrations on deploy: apply any new file in
`db/migrations/` to the production database first, then push.

## Documentation

- [Build status](docs/BUILD_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions (ADRs)](docs/decisions/)
- [Data lifecycle](docs/DATA_LIFECYCLE.md)
- [Security notes](docs/security/)

## Credits

Landing page illustrations are from Magnific (free plan) and are credited to their artist on the landing page.

## Copyright

Copyright © 2026 Chiranjit Karmakar. All rights reserved.

This is proprietary software. No licence is granted: you may not copy, modify, distribute, host or reuse any part of
this project without written permission. See [LICENSE](LICENSE).
