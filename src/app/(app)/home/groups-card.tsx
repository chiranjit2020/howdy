import Link from 'next/link';
import { cn } from '@/ui/cn';
import { GroupIcon } from '@/ui/icons';
import { buttonClasses } from '@/ui/primitives';

/**
 * "Your groups" on Home (2026-11-14): groups were only in the menu and nobody found them. Your groups, each one tap
 * away; with none, an invitation to start one for the people you already talk to.
 */
export function GroupsCard({
  groups,
  headingId,
  className,
}: {
  groups: { id: string; name: string; requestsWaiting: number | null }[];
  /** Unique per page: the card shows above the feed on narrower screens and in the right panel on wide ones. */
  headingId: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn('clay flex flex-col gap-3 p-4', className)}>
      <h2 id={headingId} className="text-title font-semibold text-text-primary">
        Your groups
      </h2>
      {groups.length === 0 ? (
        <>
          <p className="text-caption text-text-secondary">
            Start a group for your flat, batch, family or team: a pinned notice, events, polls and “Buy or
            wait?”, all in one place.
          </p>
          <Link href="/groups" className={cn(buttonClasses({ size: 'sm' }), 'self-start')}>
            Start or find a group
          </Link>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {groups.slice(0, 4).map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-md px-1 text-text-primary no-underline hover:bg-surface-sunken hover:no-underline"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary"
                  >
                    <GroupIcon />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
                  {g.requestsWaiting ? (
                    <span className="shrink-0 text-metadata text-text-secondary">
                      {g.requestsWaiting} waiting
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/groups" className={cn(buttonClasses({ variant: 'link', size: 'sm' }), 'self-start')}>
            {groups.length > 4 ? `All ${groups.length} groups` : 'Find more groups'}
          </Link>
        </>
      )}
    </section>
  );
}
