import type { ReactNode } from 'react';
import type { TownHallVisibility } from '@/shared/validation/town-halls';
import { Badge } from '../primitives/badge';

export type { TownHallVisibility } from '@/shared/validation/town-halls';

/** Circles (ADR-054): findable by friends of members, or private. Quiet labels: they inform, they do not decorate. */
export const GROUP_VISIBILITY_LABEL: Record<TownHallVisibility, string> = {
  open: 'Friends can find it',
  invite: 'Private',
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
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="clay flex flex-col gap-3 rounded-[20px] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Heading
          className={headingLevel === 1 ? 'text-heading text-text-primary' : 'text-title text-text-primary'}
        >
          {name}
        </Heading>
        <Badge>{GROUP_VISIBILITY_LABEL[visibility]}</Badge>
        {joined && <Badge tone="sunflower">Member</Badge>}
      </div>
      <p className="text-body text-text-secondary">{description}</p>
      {action && <div>{action}</div>}
    </article>
  );
}
