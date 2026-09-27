import type { ReactNode } from 'react';
import type { TownHallVisibility } from '@/shared/validation/town-halls';
import { Badge, type Tone } from '../primitives/badge';

export type { TownHallVisibility } from '@/shared/validation/town-halls';

const VIS: Record<TownHallVisibility, { label: string; tone: Tone }> = {
  open: { label: 'Open to all', tone: 'success' },
  members: { label: 'Members only', tone: 'info' },
  invite: { label: 'By invitation', tone: 'mystery' },
};

/**
 * A Town Hall (community) in a list, or at the top of its own page. Deliberately no member counts or rankings. The name's
 * heading level follows where the card sits: 2 in a list under the page's h1, 1 when it is the page's own title.
 */
export function TownHallCard({
  name,
  description,
  visibility,
  joined,
  action,
  headingLevel = 2,
}: {
  name: string;
  description: string;
  visibility: TownHallVisibility;
  joined?: boolean;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const v = VIS[visibility];
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="clay flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Heading
          className={headingLevel === 1 ? 'text-heading text-text-primary' : 'text-title text-text-primary'}
        >
          {name}
        </Heading>
        <Badge tone={v.tone}>{v.label}</Badge>
        {joined && <Badge tone="accent">Joined</Badge>}
      </div>
      <p className="text-body text-text-secondary">{description}</p>
      {action && <div>{action}</div>}
    </article>
  );
}
