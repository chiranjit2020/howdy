# ADR-004 — Opaque server-side sessions

**Context.** Need logout-here, logout-everywhere, revocation, rotation, session listing ("Open Gates"), and a WebSocket
auth path.

**Decision.**
- Session token: 32 random bytes (base64url) in an `HttpOnly; Secure; SameSite=Lax` cookie (`__Host-howdy_session` in prod).
- DB stores `sha256(token)`, user id, created/last-seen/idle-expiry/absolute-expiry, coarse device label, revoked_at.
  A DB leak therefore does not yield usable tokens. IP is not stored beyond what abuse handling strictly needs.
- New token issued on login (no fixation) and on password change / privilege change; all other sessions revoked on
  password change/reset.
- Sliding idle expiry (default 14 days) with absolute cap (default 60 days); `last_seen` updates throttled.
- WebSocket authenticates with the same cookie at upgrade time and re-checks revocation periodically.

**Alternatives.** Stateless JWT (hard to revoke, larger leak impact); JWT + refresh rotation (extra complexity with no
benefit for a first-party web app).

**Reason.** Revocation and per-device control are hard requirements; a DB lookup per request is acceptable on Neon and
cacheable in Redis later if measured necessary.

**Consequences.** Every authenticated request costs one indexed lookup. Native mobile clients later can reuse the same
token as a bearer credential without a redesign.
