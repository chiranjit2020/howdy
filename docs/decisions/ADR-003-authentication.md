# ADR-003 — First-party authentication (no third-party auth service)

**Context.** Master prompt requires Argon2id, verification, reset, revocation, enumeration protection, and openness
to passkeys/MFA. The Neon setup file in the repo suggests `auth: true` (Neon Auth), which would delegate identity.

**Decision.** Implement authentication in-house inside the `auth` module: email + password (Argon2id via
`@node-rs/argon2`), email verification, password reset, server-side sessions (ADR-004). Do **not** enable Neon Auth
for now. Credentials live in a `credentials`-style table separate from `users` so passkeys/MFA factors can be added
as further factor tables without reshaping `users`.

**Alternatives.** Neon Auth / Auth.js / Clerk / Lucia-style library. Rejected for now: identity, session rotation and
authorization tie tightly to Howdy's relationship model, and the master prompt treats auth as the first-class
security feature to own and test.

**Reason.** Full control over enumeration behaviour, session model, rate limiting and audit trail.

**Consequences.** We own the risk; must ship the security test suite (master prompt §33) with the feature. Revisit
if maintaining it becomes a burden or when adding passkeys (a vetted WebAuthn library, not hand-rolled).
