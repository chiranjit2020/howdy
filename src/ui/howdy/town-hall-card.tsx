import type { ReactNode } from 'react';
import { Badge, type Tone } from '../primitives/badge';

export type TownHallVisibility = 'open' | 'members' | 'invite';

const VIS: Record<TownHallVisibility, { label: string; tone: Tone }> = {
  open: { label: 'Open to all', tone: 'success' },
  members: { label: 'Members only', tone: 'info' },
  invite: { label: 'By invitation', tone: 'mystery' },
};

/** A Town Hall (community) in a list. Deliberately no member counts or rankings. */
export function TownHallCard({
  name,
  description,
  visibility,
  joined,
  action,
}: {
  name: string;
  description: string;
  visibility: TownHallVisibility;
  joined?: boolean;
  action?: ReactNode;
}) {
  const v = VIS[visibility];
  return (
    <article className="clay flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-title text-text-primary">{name}</h3>
        <Badge tone={v.tone}>{v.label}</Badge>
        {joined && <Badge tone="accent">Joined</Badge>}
      </div>
      <p className="text-body text-text-secondary">{description}</p>
      {action && <div>{action}</div>}
    </article>
  );
}
