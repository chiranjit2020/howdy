# ADR-009 — Profiles (Ranch), central authorization, module boundaries

## Context
Phase 3 introduces the first resource with an owner and other viewers (the Ranch), so it is where authorisation stops being
"is there a session?" and becomes "who may see or change *this*?". It also introduces multiple feature modules.

## Decisions

**One policy function.** `can(actor, action, resource, {relationship})` in `src/modules/authz` is pure and synchronous. Callers
load the facts; the policy decides; nothing else implements access rules. It covers relationship + privacy + account status;
existence and rate limits stay with the caller. The `relationship` input means *how the resource owner regards the actor*, so a
block by the owner denies the actor, while one-way SCOUTING never satisfies "posse". It is verified against an independent
oracle over every actor × visibility × relationship combination, plus properties (block overrides everything, the owner always
sees their own, a Signal is never broader than its Ranch, non-active accounts are denied even their own).

**Relationships are a stub.** `relationshipOf()` returns PASSERBY for everyone until Phase 4. Consequence: "posse" visibility
currently means "owner only", and nobody can be blocked. Replacing that one function lights both up; the policy is already
correct for all states.

**Privacy by default, per object.** `ranch_visibility` and `signal_visibility` ∈ {everyone, members, posse}, both defaulting to
`members`. A Signal must satisfy *both* settings.

**No existence oracle.** A Ranch that is missing, whose owner is suspended, or that the viewer may not see yields one result:
API 404 with the same body; for signed-out page visits, the same "Step inside" prompt (signed-in viewers get the standard 404).
Handles are public identifiers (sign-up reports "taken"), so this protects the *content and settings*, not the handle's existence.

**Editing has no object id.** `/api/me/ranch` and `/api/me/signal` always act on the signed-in user; there is no id in the URL
or body to tamper with, and unknown body keys are dropped (`profile.ts` schemas), so mass assignment and cross-user writes are
structurally impossible rather than merely checked. Edits still call `can()` so there is a single decision point when moderators
or delegation arrive.

**Module boundaries are lint rules.** A module is imported only through its `index.ts`; `auth → profiles → (authz, relationships)`
only (no cycles); `ui` and `shared` contain no server code; `platform` never imports upward. Because `auth` creates the profile in
the sign-up transaction, profile HTTP routes live in the **app layer** (`src/app/api/me/*`), composing `auth` (who) and
`profiles` (what), which avoids an `auth ↔ profiles` cycle. Rules are tested by linting deliberately bad snippets.

**Text shown to other people is screened.** Display names and Signals are NFC-normalised, whitespace-collapsed, and rejected if
they contain bidi overrides/embeddings/isolates, zero-width or invisible characters (ZWNJ/ZWJ are allowed for Indic/Persian
scripts and emoji), control characters, or links / bare domains (spam and phishing). The database also enforces length and
control-character constraints. React renders all of it as text; this is defence in depth, not the XSS control.

**Portrait is a colour, for now.** Photo upload needs the Media module (object storage choice, signed uploads, scanning). Until
then a Portrait is a palette tint on the initials avatar (five accessible fills).

**Signal expiry** is enforced on read (an expired Signal is never returned) and physically cleared by a retention job.

## Alternatives considered
Access checks inline in handlers (drifts); a database row-level-security layer (good later defence in depth, but the rules depend
on relationships that do not exist yet); putting profile routes inside the `profiles` module (forces `profiles → auth`, a cycle);
revealing "this Ranch is private" (existence oracle); allowing links in names/Signals (spam vector).

## Consequences / gaps
- No photo portraits, bio, Horizon banner or per-field privacy beyond the two settings.
- Impersonation via look-alike letters from other scripts (confusables) and reserved-name squatting beyond the fixed list is not
  detected; needs moderation tooling (Phase 11).
- Display names are not unique by design; the `@handle` is the identity.
- The URL-detection heuristic uses a short TLD list; it will miss exotic TLDs and may flag a name like "Dr. Who.com".
- The retention job exists but is not scheduled; the audit log has no retention period yet (see DATA_LIFECYCLE.md).
