# HOWDY — MASTER BUILD PROMPT

You are the **lead product architect, security engineer, backend engineer, frontend engineer, UX engineer, and QA engineer** responsible for building **Howdy**.

Howdy is a new social platform inspired by some of the strongest social mechanics of early social networks such as Orkut, but it is **not an Orkut clone, Facebook clone, Instagram clone, Twitter/X clone, WhatsApp clone, or TikTok clone**.

The product philosophy is:

> **Small-circle social interaction + curiosity + asynchronous conversation + lightweight social rituals + controlled privacy + social memory.**

The product should feel human, tactile, playful, nostalgic in spirit, but technically modern, secure, fast, accessible, and scalable.

---

# 0. MOST IMPORTANT INSTRUCTION

**Do not blindly follow this document if the existing codebase, technical constraints, security requirements, or a better engineering decision indicate another approach.**

You have architectural freedom.

If you determine that another feature, infrastructure component, database design, security mechanism, or implementation sequence must come first, **explain why and implement it first**.

However:

* Do not randomly change the architecture.
* Do not introduce technology simply because it is fashionable.
* Do not over-engineer.
* Do not build features merely because they are listed here.
* Prefer the simplest architecture that can safely support Howdy's long-term direction.
* Preserve future flexibility.

Think like a senior engineer building a product that may eventually have millions of users.

---

# 1. SOURCE OF TRUTH

The uploaded document:

`howdy-conversation-with-gemini.md`

contains the original product exploration and design discussion.

Treat it as the **product discovery source**.

Before implementation:

1. Read it completely.
2. Extract the product principles.
3. Extract existing feature decisions.
4. Extract terminology.
5. Extract UI/design decisions.
6. Extract security/privacy ideas.
7. Identify contradictions or incomplete decisions.
8. Create an implementation roadmap.

Do not silently discard important ideas from the document.

Where this master prompt and the source document differ:

* Prefer explicit instructions in this master prompt for implementation priorities.
* Preserve useful product ideas from the source.
* If a conflict materially affects architecture, make a reasoned engineering decision and document it.

---

# 2. PRODUCT IDENTITY

Product name:

**Howdy**

Core metaphor:

A friendly social world where people can:

* say Howdy
* visit someone's Ranch
* leave Post Cards
* give a Yo
* Tip a Hat
* exchange Whispers
* form a Posse
* discover Tracks
* leave Tributes
* participate in Town Halls
* create social memories

The vocabulary is part of the product identity, but **do not allow branded terminology to make the codebase confusing**.

For example:

Frontend:

`Ranch`

Backend/domain:

`Profile`

Frontend:

`Tracks`

Backend/domain:

`ProfileVisit`

Frontend:

`Whisper`

Backend/domain:

`Conversation / Message`

Use conventional engineering terminology internally wherever it improves maintainability.

---

# 3. CORE PRODUCT PRINCIPLE

Howdy must NOT become an infinite content-consumption machine.

Do not build the product around:

* infinite algorithmic feeds
* influencer culture
* short-video addiction
* engagement farming
* follower-count competition
* popularity rankings
* aggressive recommendation algorithms
* advertising-first design

The primary loop should feel closer to:

```text
Ranch
   ↓
Someone visits
   ↓
Track
   ↓
Curiosity
   ↓
Open Ranch
   ↓
Fence
   ↓
Post Card
   ↓
Yo / Tip
   ↓
Whisper
   ↓
Posse
   ↓
Town Hall
   ↓
Social Memory
   ↓
Return
```

This loop can evolve.

---

# 4. P0 PRIORITY — SECURITY

## SECURITY IS THE FIRST-CLASS FEATURE.

Do NOT treat security as something to "add later".

Before meaningful social functionality is released, establish a strong security foundation.

You must continuously evaluate:

### Authentication

Use secure modern authentication.

At minimum consider:

* secure password hashing
* Argon2id
* email verification
* secure sessions
* refresh-session rotation where applicable
* session revocation
* logout from current device
* logout from all devices
* password reset
* brute-force protection
* login rate limiting
* account enumeration protection
* suspicious login handling
* secure cookies
* CSRF protection where applicable
* secure headers
* CSP
* input validation
* output encoding
* XSS protection
* SQL injection protection
* authorization checks
* object-level authorization

Keep the architecture open for:

* Passkeys/WebAuthn
* MFA
* OTP
* trusted devices

Do not implement every advanced mechanism immediately unless justified.

---

# 5. SECURITY PRINCIPLE

Assume:

> **Every client request is hostile until validated and authorized.**

Never trust:

* frontend route protection
* hidden buttons
* disabled UI controls
* client-side validation
* user-supplied IDs
* user-supplied roles
* user-supplied permissions
* client timestamps
* client relationship state

Authorization must be enforced server-side.

---

# 6. AUTHORIZATION MODEL

Design authorization as a reusable system.

A user must only be able to perform an action if:

```text
Authenticated
+
Resource exists
+
Relationship permits action
+
Privacy permits action
+
Account status permits action
+
Rate limit permits action
```

Eventually support concepts such as:

* owner
* visitor
* passerby
* posse
* close posse
* blocked
* muted
* restricted
* moderator
* administrator

Do not scatter authorization logic throughout controllers.

Create centralized policies/services where appropriate.

---

# 7. DATABASE

The primary database is:

**Neon PostgreSQL**

Use PostgreSQL as the source of truth.

Do NOT move to MongoDB merely because PostgreSQL requires more schema design.

Howdy contains many relational concepts:

* users
* relationships
* permissions
* posts
* replies
* reactions
* conversations
* memberships
* notifications
* moderation
* social graph relationships

PostgreSQL is appropriate.

Design the schema carefully.

Use migrations.

Never manually modify production schema without a migration.

Use constraints wherever possible.

Examples:

* foreign keys
* unique constraints
* check constraints
* indexes
* nullable rules
* cascade/restrict behavior intentionally defined

---

# 8. REDIS

Redis may be introduced where it provides clear value.

Potential uses:

* rate limiting
* ephemeral Tracks
* presence
* typing indicators
* WebSocket coordination
* temporary tokens
* notification aggregation
* caching
* pub/sub

Do NOT use Redis as the permanent source of truth for social data.

For example:

```text
PostgreSQL
    ↓
Permanent message storage

Redis
    ↓
Realtime delivery / ephemeral state
```

---

# 9. ARCHITECTURE

Start with a:

# MODULAR MONOLITH

Do NOT start with microservices.

The system should have clear domain boundaries.

Possible modules:

```text
auth
users
profiles
relationships
fence
post-cards
reactions
tracks
tributes
signals
whispers
town-halls
notifications
moderation
media
admin
```

These are logical modules.

They do NOT need to become separate servers.

---

# 10. CLEAN CODE ARCHITECTURE

Use clean architecture principles where they provide real value.

Prefer:

```text
HTTP / WebSocket
        ↓
Controller / Handler
        ↓
Application Service / Use Case
        ↓
Domain Rules
        ↓
Repository
        ↓
PostgreSQL / Redis / External Service
```

Do not create meaningless abstractions.

Avoid:

```text
Controller
→ Manager
→ Helper
→ Utility
→ Adapter
→ Factory
→ Service
→ Repository
```

when a simpler implementation would be clearer.

The architecture should be:

**structured, testable, understandable, replaceable.**

---

# 11. TECHNOLOGY DIRECTION

Unless the existing project dictates otherwise, the preferred stack is:

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS or another maintainable styling approach
* responsive PWA-capable architecture

### Backend

* Node.js
* TypeScript

### Database

* Neon PostgreSQL

### Realtime

* WebSocket

### Ephemeral/realtime infrastructure

* Redis

### Object storage

Keep the implementation open between:

* Cloudflare R2
* S3-compatible storage
* Cloudinary

Choose based on actual requirements.

### Deployment

Keep deployment architecture flexible.

Do not tightly couple the application to one vendor unless necessary.

---

# 12. DESIGN SYSTEM — BUILD THIS BEFORE BUILDING THE PRODUCT UI

Create a real Howdy design system.

Do not style every page independently.

The design system should become the foundation of the entire application.

---

# 13. VISUAL LANGUAGE

Howdy should feel:

* tactile
* warm
* playful
* human
* modern
* nostalgic without looking outdated
* friendly
* slightly whimsical
* premium
* highly responsive

Avoid:

* generic SaaS dashboards
* excessive glassmorphism
* overly dark interfaces
* generic Bootstrap appearance
* excessive gradients
* excessive animations
* visual clutter

---

# 14. COLOR SYSTEM

Initial palette:

```text
Canvas Cream       #F8F5EE
Clay White         #FFFFFF
Sherbet Peach      #FFB4A2
Pistachio Mint     #B7E4C7
Buttercup Gold     #FFEAA7
Lavender Mist      #D8B4E2
Sky Tint           #BEE1E6
Deep Charcoal      #2B2D42
Muted Slate        #8D99AE
```

Do not hard-code colors throughout components.

Create semantic design tokens.

Example concept:

```text
--color-background
--color-surface
--color-surface-raised
--color-text-primary
--color-text-secondary
--color-accent
--color-success
--color-warning
--color-danger
--color-border
```

The underlying palette may change later without rewriting components.

---

# 15. TYPOGRAPHY

Primary:

```text
Plus Jakarta Sans
```

Monospace:

```text
JetBrains Mono
```

Optional display:

```text
Fraunces
```

Create typography tokens for:

* display
* heading
* title
* body
* caption
* metadata
* code

Do not use arbitrary font sizes throughout the application.

---

# 16. COMPONENT SYSTEM

Create reusable primitives.

At minimum:

```text
Button
IconButton
Input
Textarea
Select
Checkbox
Radio
Switch
Avatar
Badge
Chip
Card
ClayCard
Modal
Drawer
Popover
Tooltip
Dropdown
Toast
Dialog
Tabs
Navigation
BottomNavigation
Skeleton
EmptyState
ErrorState
LoadingState
ConfirmationDialog
```

Then create Howdy-specific components:

```text
RanchHeader
Signal
PostCard
PostCardReply
YoButton
TipHatButton
TrackItem
TributeCard
Fence
WhisperBubble
PosseBadge
TownHallCard
ChimeItem
```

Do not build Howdy-specific components before establishing reusable primitives where appropriate.

---

# 17. ACCESSIBILITY

Accessibility is part of the design system.

Support:

* keyboard navigation
* focus states
* semantic HTML
* ARIA where necessary
* sufficient contrast
* reduced motion
* screen-reader-friendly controls
* visible interaction states
* touch targets appropriate for mobile

Never sacrifice accessibility simply to achieve the visual aesthetic.

---

# 18. RESPONSIVENESS

Design from approximately:

```text
320px
```

through:

```text
large desktop / fullscreen
```

Do not assume only conventional Bootstrap breakpoints.

The interface should adapt naturally.

Mobile is not a shrunk desktop.

Desktop is not simply a stretched mobile screen.

---

# 19. MOTION

Motion should communicate:

* state changes
* interaction feedback
* hierarchy
* transitions
* social reactions

Avoid decorative animation everywhere.

Respect:

```text
prefers-reduced-motion
```

---

# 20. FIRST IMPLEMENTATION — AUTHENTICATION

Start with authentication.

However, before coding authentication, inspect the repository and determine whether another foundational piece must exist first.

If not:

```text
PHASE 0
Security foundation
        ↓
PHASE 1
Design system foundation
        ↓
PHASE 2
Authentication
```

Authentication should include an initial complete flow:

```text
The Gate
    ↓
Stake a Claim
    ↓
Create account
    ↓
Verification
    ↓
Step Inside
```

Initial auth functionality:

* sign up
* login
* logout
* session persistence
* protected routes
* password hashing
* validation
* error handling
* rate limiting
* email verification architecture
* password reset architecture
* session management

Do not expose whether a particular email/account exists through overly specific error messages.

---

# 21. AUTH UI VOCABULARY

Use Howdy terminology in the UI where it improves the experience.

Examples:

```text
Sign Up        → Stake a Claim
Login          → Step Inside
Logout         → Hit the Trail
Welcome        → The Gate
Username       → Handle / Call Sign
Password       → Secret Knock
Forgot Password → Lost Your Key?
OTP            → Passcode / Wax Stamp
Account Created → Deed Granted
```

Do not sacrifice usability for terminology.

For example, a screen can say:

```text
Step Inside
Log in to your Howdy account
```

rather than forcing users to understand an unfamiliar metaphor.

---

# 22. PROFILE FOUNDATION

After authentication works securely, build the minimal Ranch.

Initial profile:

```text
Handle
Portrait
Signal
Display name
```

Do not immediately build every social feature.

Establish the underlying identity model first.

---

# 23. CORE DATA MODEL

Design carefully around entities such as:

```text
User
Profile
Session
Relationship
PostCard
PostCardReply
Reaction
Track
Tribute
Signal
Conversation
ConversationMember
Message
TownHall
TownHallMember
TownHallPost
Notification
Report
Block
Mute
Media
AuditLog
```

The exact schema is your decision.

Do not blindly copy this list if analysis shows a better model.

---

# 24. RELATIONSHIPS

Social relationships must be modeled explicitly.

Potential states:

```text
UNKNOWN
PASSERBY
REQUESTED
POSSE
CLOSE_POSSE
SCOUTING
MUTED
RESTRICTED
BLOCKED
```

Do not treat every relationship as "follow".

Howdy's relationship model is part of the product differentiation.

---

# 25. FENCE

The Fence is a public asynchronous interaction area attached to a Ranch.

Potential features:

* Post Cards
* replies
* Yo
* reactions
* moderation
* privacy
* rate limits
* deletion
* reporting

Initial Post Card limits should remain intentionally small.

Starting direction:

```text
Post Card: 160 characters
Reply: 80 characters
```

These values can change after testing.

---

# 26. YO

Yo is a lightweight social interaction.

It should be:

* one-tap
* low friction
* recognizable
* rate limited
* notification-aware

Do not turn Yo into a generic reaction system.

---

# 27. TRACKS

Tracks represent profile visits.

Treat visits as sensitive social events.

Privacy must be designed before implementation.

Potential model:

```text
Normal
Shadow Walk
```

Shadow Walk may prevent the visitor from being revealed while also affecting what the user can see.

Do not expose:

* IP address
* raw location
* device fingerprint
* unnecessary identifying metadata

Use deduplication and retention limits.

A Track is an event, not ordinary permanent social content.

---

# 28. WHISPERS

Whispers are private conversations.

Do NOT turn Howdy into WhatsApp.

Initial architecture:

```text
WebSocket
   ↓
Authentication
   ↓
Authorization
   ↓
Validation
   ↓
PostgreSQL
   ↓
Redis Pub/Sub
   ↓
Recipient WebSocket
```

PostgreSQL remains the durable source of truth.

Redis handles realtime coordination.

---

# 29. WEBSOCKET CONTRACT

Use a versioned envelope.

Example:

```ts
interface WsFrame<T> {
  v: 1;
  op: "ACTION" | "EVENT" | "ACK" | "ERR";
  type: string;
  requestId: string;
  seq: number;
  serverTime: number;
  d: T;
}
```

Support:

* reconnect
* message acknowledgement
* duplicate prevention
* sequence numbers
* client message IDs
* server message IDs
* synchronization after reconnect
* authorization
* rate limits

Assume mobile networks will disconnect frequently.

---

# 30. NOTIFICATIONS

Create a unified activity system.

Potential events:

```text
POST_CARD_CREATED
POST_CARD_REPLIED
TRACK_CREATED
YO_DROPPED
MARK_AWARDED
TRIBUTE_CREATED
WHISPER_RECEIVED
POSSE_REQUESTED
```

Separate:

```text
Domain Event
```

from:

```text
Notification
```

This will make future notification channels easier.

---

# 31. MODERATION

Safety is not optional.

Build the foundation early.

Users need:

```text
Block
Mute
Report
Restrict
```

Eventually:

```text
Moderation Queue
Moderator Actions
Account Suspension
Content Removal
Audit Log
Appeals
```

AI may assist moderation later.

AI must not silently become the sole authority for important account/content decisions without appropriate safeguards.

---

# 32. ANTI-SPAM

Howdy will be vulnerable to:

* fake accounts
* automated accounts
* harassment
* profile scraping
* mass Post Cards
* mass Yo
* Track abuse
* Whisper spam
* malicious links
* account takeover

Use layered controls:

```text
Rate limiting
+
Account age
+
Relationship state
+
Trust signals
+
Behavior patterns
+
Moderation
```

Do not rely on a single "trust score".

---

# 33. SECURITY TESTING

Every security-sensitive feature must have tests.

At minimum test:

### Authentication

* invalid password
* brute force
* expired session
* revoked session
* logout
* password reset
* email verification
* session fixation
* cookie security

### Authorization

Attempt:

```text
User A → access User B's resource
User A → modify User B's resource
User A → delete User B's content
Blocked user → interact
Unauthenticated user → protected endpoint
```

These tests should fail safely.

---

# 34. TESTING STRATEGY

Every implementation phase must include:

### Unit tests

Business logic.

### Integration tests

Database and service interactions.

### API tests

Authentication and authorization.

### End-to-end tests

Critical user journeys.

### Security tests

Abuse and permission boundaries.

### UI tests

Critical interactions where appropriate.

Do not write tests merely to increase coverage percentage.

Test behavior.

---

# 35. TEST AFTER EVERY PHASE

Never follow:

```text
Build everything
→ Test at the end
```

Instead:

```text
Plan
↓
Implement
↓
Test
↓
Fix
↓
Refactor
↓
Document
↓
Move forward
```

A phase is not complete until its acceptance criteria pass.

---

# 36. BUILD LEDGER

Create a persistent project file:

```text
/docs/BUILD_STATUS.md
```

This file is extremely important.

Maintain it throughout development.

Example:

```md
# Howdy Build Status

## Current Phase

Phase 0 — Security Foundation

## Status

IN PROGRESS

## Completed

- [x] Repository inspected
- [x] Environment verified
- [x] Database connected
- [x] Initial migration
- [ ] Session architecture
- [ ] Authentication
- [ ] Security tests

## Current Task

...

## Next Task

...

## Blockers

...

## Architectural Decisions

...

## Tests

...

## Known Issues

...

## Deferred

...
```

Update this file after every meaningful implementation session.

---

# 37. ARCHITECTURAL DECISION RECORDS

Create:

```text
/docs/decisions/
```

Record important architectural decisions.

Example:

```text
ADR-001-postgresql.md
ADR-002-modular-monolith.md
ADR-003-authentication.md
ADR-004-session-management.md
```

Each decision should contain:

```text
Context
Decision
Alternatives
Reason
Consequences
```

Do not create ADRs for trivial implementation choices.

---

# 38. ENVIRONMENT MANAGEMENT

Never commit secrets.

Use:

```text
.env.local
```

and:

```text
.env.example
```

The example file should contain variable names but never real credentials.

At minimum consider:

```text
DATABASE_URL
REDIS_URL
AUTH_SECRET
APP_URL
```

and other provider credentials only when needed.

---

# 39. DATABASE MIGRATIONS

Use a migration system appropriate for the chosen ORM/database layer.

Every schema change must produce a migration.

Never rely on:

```text
"just run this SQL manually"
```

for repeatable project development.

---

# 40. ERROR HANDLING

Create a consistent error model.

Do not leak:

* database errors
* SQL
* stack traces
* internal service information
* authentication details
* infrastructure information

to normal users.

Development logs can contain more information.

Production responses must be safe.

---

# 41. LOGGING

Implement structured logging.

Log:

* request ID
* user ID where appropriate
* event type
* severity
* duration
* error class

Never log:

* passwords
* authentication secrets
* session tokens
* reset tokens
* sensitive private message contents unless explicitly required and carefully controlled

---

# 42. OBSERVABILITY

Keep the architecture open for:

* metrics
* error tracking
* tracing
* uptime monitoring

Initially keep it simple.

Do not install ten observability products on day one.

---

# 43. SEARCH

Do not introduce Elasticsearch/OpenSearch immediately.

Start with PostgreSQL capabilities.

Evaluate external search only when actual requirements justify it.

---

# 44. NEO4J

Do NOT introduce Neo4j initially.

The social graph can initially live in PostgreSQL.

Reconsider Neo4j only when real requirements emerge such as:

```text
multi-hop relationship queries
complex graph traversal
relationship recommendations
social graph analysis
```

Architecture should allow future extraction.

---

# 45. MEDIA

Do not send large files through the application server unnecessarily.

Preferred pattern:

```text
Client
 ↓
Signed upload URL
 ↓
Object Storage
 ↓
Processing
 ↓
CDN
```

Keep media processing isolated from core request handling.

---

# 46. FRONTEND ROUTING

Potential initial structure:

```text
/
 /gate
 /stake-a-claim
 /step-inside
 /lost-your-key
 /verify
 /ranch/[handle]
 /fence
 /whispers
 /town-halls
 /notifications
 /workshop
```

You may change these routes if a better information architecture emerges.

Do not let product vocabulary make URLs difficult to understand or maintain.

---

# 47. ONBOARDING

Avoid a giant registration form.

Initial flow should be lightweight:

```text
The Gate
↓
Stake a Claim
↓
Handle
↓
Secret Knock
↓
Verification
↓
Portrait
↓
Signal
↓
Find your Posse
```

However, do not make onboarding unnecessarily long.

---

# 48. PRODUCT DISCOVERY

Howdy should eventually have:

### Ranch

Personal profile.

### Fence

Public asynchronous interaction.

### Tracks

Profile visits.

### Post Cards

Short social messages.

### Yo

Lightweight acknowledgement.

### Tip Hat

Social gesture.

### Tributes

Public endorsements/testimonials.

### Posse

Relationships.

### Whispers

Private messaging.

### Town Halls

Communities.

### Signals

Status/presence.

### Chimes

Notifications.

### Shadow Walk

Incognito/privacy mode.

### Memories

Social history.

---

# 49. FUTURE FEATURES — DO NOT BUILD YET

Keep these in the roadmap but do not prematurely implement:

* Time Capsules
* advanced relationship graph
* sophisticated discovery
* smart recommendations
* social memory engine
* advanced reputation
* community events
* annual Ranch recap
* AI-assisted moderation
* intelligent spam detection
* passkeys
* advanced MFA
* sophisticated analytics
* creator monetization
* advertising
* livestreaming
* video feed

Evaluate each feature when its underlying product need becomes clear.

---

# 50. FEATURES TO AVOID EARLY

Do not build initially:

* infinite algorithmic feed
* Reels/TikTok-style video
* livestreaming
* public popularity rankings
* follower-count competition
* complex badges
* cryptocurrency
* microservices
* Kafka
* event sourcing
* CQRS everywhere
* Neo4j
* recommendation ML
* voice/video calling
* huge media infrastructure

Unless a real requirement appears that justifies one.

---

# 51. PERFORMANCE PRINCIPLES

Optimize after measuring.

Important areas:

* database indexes
* query efficiency
* N+1 queries
* pagination
* caching
* image optimization
* bundle size
* WebSocket efficiency
* API latency

Do not prematurely optimize everything.

---

# 52. PAGINATION

Never load unbounded collections.

Use appropriate pagination for:

* Fence
* replies
* Tracks
* Whispers
* notifications
* Town Halls
* Tributes

Prefer cursor-based pagination for activity-heavy feeds where appropriate.

---

# 53. PRIVACY

Privacy must be considered per object.

Examples:

```text
Profile visibility
Signal visibility
Fence visibility
Track visibility
Tribute visibility
Whisper permission
Town Hall visibility
```

Block should override normal interaction permissions.

---

# 54. DATA RETENTION

Do not retain sensitive ephemeral information forever.

Examples:

Tracks:

```text
short retention
```

Typing:

```text
seconds
```

Presence:

```text
ephemeral
```

Ephemeral Whispers:

```text
product-defined retention
```

Make retention explicit.

---

# 55. USER DATA

Provide architecture for:

* account deletion
* data cleanup
* session revocation
* content deletion
* block/mute
* privacy controls

"Delete account" should not simply mean:

```sql
DELETE FROM users;
```

Understand the dependency graph first.

---

# 56. DEVELOPMENT WORKFLOW

Before modifying the project:

```text
1. Inspect repository
2. Inspect package configuration
3. Inspect existing architecture
4. Inspect environment configuration
5. Inspect database
6. Inspect tests
7. Inspect current build status
8. Identify current phase
9. Decide smallest safe next step
```

Then implement.

---

# 57. AFTER IMPLEMENTATION

After each meaningful change:

```text
1. Run formatter
2. Run type checking
3. Run linting
4. Run unit tests
5. Run integration tests where relevant
6. Run build
7. Run relevant E2E tests
8. Inspect runtime behavior
9. Fix failures
10. Update BUILD_STATUS.md
```

Never claim something is complete without testing it.

---

# 58. WHEN SOMETHING FAILS

Do not hide failures.

Document:

```text
Failure
Cause
Fix
Verification
```

If a test cannot currently be executed because infrastructure is unavailable, record that explicitly.

---

# 59. DEFINITION OF DONE

A feature is NOT done merely because:

```text
the UI exists
```

A feature is done when:

```text
UI
+
Backend
+
Database
+
Validation
+
Authorization
+
Error handling
+
Security
+
Tests
+
Responsive behavior
+
Documentation
```

are appropriately complete for its scope.

---

# 60. CLAUDE'S DECISION AUTHORITY

You are allowed to say:

> "Before implementing X, we should implement Y because X depends on Y."

You are allowed to change the implementation order.

You are allowed to replace a proposed technology if you provide a clear reason.

You are allowed to simplify the architecture.

You are allowed to defer features.

You are allowed to refactor existing work.

You are NOT allowed to:

* ignore security
* bypass authorization
* skip testing
* introduce unnecessary complexity
* overwrite working functionality without justification
* silently change product behavior
* mark unfinished work as complete

---

# 61. BUILD ORDER — INITIAL GUIDANCE

Use this as a starting point, not a rigid command.

```text
PHASE 0
Repository + Architecture + Security Foundation

        ↓

PHASE 1
Design System

        ↓

PHASE 2
Authentication + Sessions

        ↓

PHASE 3
User/Profile/Ranch

        ↓

PHASE 4
Relationships / Posse

        ↓

PHASE 5
Fence + Post Cards + Yo

        ↓

PHASE 6
Notifications / Chimes

        ↓

PHASE 7
Whispers + WebSockets

        ↓

PHASE 8
Tracks + Shadow Walk

        ↓

PHASE 9
Tributes + Marks + Signals

        ↓

PHASE 10
Town Halls

        ↓

PHASE 11
Moderation + Anti-Abuse Expansion

        ↓

PHASE 12
Memories / Time Capsules

        ↓

PHASE 13
Performance + Scaling + Advanced Intelligence
```

Again:

**You may change this order if engineering dependencies require it.**

---

# 62. FIRST TASK

Do NOT immediately start generating large amounts of code.

First:

### Step 1

Inspect the entire existing repository.

### Step 2

Read:

```text
howdy-conversation-with-gemini.md
```

### Step 3

Determine:

* current technology
* current folder structure
* current implementation
* missing infrastructure
* database configuration
* environment variables
* existing tests
* existing UI
* security weaknesses
* architectural problems

### Step 4

Create:

```text
/docs/BUILD_STATUS.md
```

### Step 5

Create an initial architecture document:

```text
/docs/ARCHITECTURE.md
```

### Step 6

Create initial ADRs for major decisions.

### Step 7

Create the design-system foundation.

### Step 8

Establish the security foundation.

### Step 9

Implement the first authentication slice.

### Step 10

Test it thoroughly.

### Step 11

Update BUILD_STATUS.md.

### Step 12

Only then move to the next phase.

---

# 63. FINAL DEVELOPMENT PRINCIPLE

Build Howdy as if:

> **The first 100 users are going to find every bug you hoped nobody would find.**

Make it secure.

Make it understandable.

Make it testable.

Make it pleasant.

Make it resilient.

Do not build a giant system prematurely.

Build a **small, extremely solid core**, then expand the social world around it.

The ultimate objective is not to demonstrate how many technologies were used.

The objective is:

# Build Howdy.

# Make it feel alive.

# Make it safe.

# Make it worth coming back to.
