/** Relationship between two users, from the viewer's perspective (master prompt §24). Not a "follow". */
export const RELATIONSHIP_STATES = [
  'UNKNOWN',
  'PASSERBY',
  'REQUESTED',
  'POSSE',
  'CLOSE_POSSE',
  'SCOUTING',
  'MUTED',
  'RESTRICTED',
  'BLOCKED',
] as const;

export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];
