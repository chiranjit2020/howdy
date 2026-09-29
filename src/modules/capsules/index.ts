/**
 * Public surface of the capsules module: Time Capsules (Phase 12, ADR-028). Depends on moderation (first-week budget),
 * profiles and relationships; nothing depends on it — the Chime is a domain event.
 */
export { myCapsules, openDue, removeCapsule, sealCapsule, MAX_SEALED, MAX_SEALED_PER_PAL } from './service';
export type { ComingCapsule, MyCapsules, OpenedCapsule, SealedCapsule } from './service';
