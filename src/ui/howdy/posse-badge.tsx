import type { RelationshipState } from '@/shared/relationship';
import { Badge, type Tone } from '../primitives/badge';

const MAP: Partial<Record<RelationshipState, { label: string; tone: Tone }>> = {
  PASSERBY: { label: 'Passerby', tone: 'neutral' },
  REQUESTED: { label: 'Requested', tone: 'info' },
  POSSE: { label: 'Friend', tone: 'success' },
  CLOSE_POSSE: { label: 'Close friend', tone: 'accent' },
  SCOUTING: { label: 'Following', tone: 'mystery' },
  MUTED: { label: 'Muted', tone: 'neutral' },
  RESTRICTED: { label: 'Restricted', tone: 'warning' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
};

/** Relationship label. UNKNOWN renders nothing. Text always accompanies colour. */
export function PosseBadge({ state }: { state: RelationshipState }) {
  const entry = MAP[state];
  if (!entry) return null;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
