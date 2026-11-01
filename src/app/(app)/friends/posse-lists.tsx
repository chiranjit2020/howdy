'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { PersonEntry, RelationshipLists } from '@/app/_lib/social';
import type { RelationshipAction } from '@/shared/validation/relationships';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { PersonRow } from '@/ui/howdy';
import { MoreIcon, WhisperIcon } from '@/ui/icons';
import { Button, ClayCard, ConfirmationDialog, Dropdown, EmptyState } from '@/ui/primitives';

// A round 44px icon button (or link) for the compact Pals row.
const iconButton =
  'inline-flex size-11 items-center justify-center rounded-pill text-title text-text-secondary no-underline hover:bg-surface hover:text-text-primary';

/** The signed-in person's Posse, requests and scouting. Each button sends one action; the page then reloads from the server. */
export function PosseLists({ lists }: { lists: RelationshipLists }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [leaving, setLeaving] = useState<PersonEntry | undefined>();

  async function run(handle: string, action: RelationshipAction) {
    setBusy(`${handle}:${action}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/relationships/${handle}`, { action });
    setBusy(undefined);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  const btn = (
    p: PersonEntry,
    action: RelationshipAction,
    label: string,
    variant: 'primary' | 'secondary' | 'ghost' = 'secondary',
  ) => (
    <Button
      key={action}
      size="sm"
      variant={variant}
      loading={busy === `${p.handle}:${action}`}
      onClick={() => run(p.handle, action)}
      aria-label={`${label} ${p.displayName}`}
    >
      {label}
    </Button>
  );

  const section = (
    id: string,
    title: string,
    people: PersonEntry[],
    empty: string,
    row: (p: PersonEntry) => ReactNode,
    footer?: ReactNode,
  ) => (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-title text-text-primary">
        {title}
      </h2>
      {people.length === 0 ? (
        <p className="text-caption text-text-secondary">{empty}</p>
      ) : (
        <ul className="-mb-2.5 flex flex-col divide-y divide-border">{people.map(row)}</ul>
      )}
      {footer}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {lists.truncated && <FormMessage tone="info">Showing the first 100 in each list.</FormMessage>}

      {lists.incoming.length > 0 && (
        <ClayCard>
          {section('requests', `Requests for you (${lists.incoming.length})`, lists.incoming, '', (p) => (
            <PersonRow
              key={p.handle}
              {...p}
              actions={
                <>
                  {btn(p, 'accept', 'Accept', 'primary')}
                  {btn(p, 'decline', 'Decline')}
                </>
              }
            />
          ))}
        </ClayCard>
      )}

      <ClayCard>
        {lists.posse.length === 0 && lists.incoming.length === 0 ? (
          <EmptyState
            as="h2"
            icon="🤝"
            title="No friends yet"
            description="Visit someone's profile and ask to be friends. Requests are private until they say yes."
          />
        ) : (
          section(
            'posse',
            `Your friends (${lists.posse.length})`,
            lists.posse,
            'Nobody yet. Accept a request or ask someone.',
            (p) => (
              <PersonRow
                key={p.handle}
                {...p}
                inlineActions
                {...(p.closeByMe ? { note: 'Close friend' } : {})}
                actions={
                  <>
                    <Link
                      href={`/messages/${p.handle}`}
                      aria-label={`Message to ${p.displayName}`}
                      title="Message"
                      className={iconButton}
                    >
                      <WhisperIcon className="size-5" />
                    </Link>
                    <Dropdown
                      label={`More about ${p.displayName}`}
                      align="end"
                      trigger={(t) => (
                        <button
                          type="button"
                          aria-label={`More about ${p.displayName}`}
                          className={iconButton}
                          {...t}
                        >
                          <MoreIcon />
                        </button>
                      )}
                      items={[
                        {
                          id: 'close',
                          label: p.closeByMe ? 'Remove from close friends' : 'Add to close friends',
                          disabled: busy !== undefined,
                          onSelect: () => run(p.handle, p.closeByMe ? 'unclose' : 'close'),
                        },
                        { id: 'leave', label: 'Stop being friends…', onSelect: () => setLeaving(p) },
                      ]}
                    />
                  </>
                }
              />
            ),
            <p className="mt-3 border-t border-border pt-3 text-metadata text-text-muted">
              Close friend is a private label, just for you. Following someone shows their posts on your Home.
              Nobody is told about either.
            </p>,
          )
        )}
      </ClayCard>

      {lists.outgoing.length > 0 && (
        <ClayCard>
          {section('waiting', `Sent requests (${lists.outgoing.length})`, lists.outgoing, '', (p) => (
            <PersonRow key={p.handle} {...p} inlineActions actions={btn(p, 'cancel', 'Cancel', 'ghost')} />
          ))}
        </ClayCard>
      )}

      {lists.scouting.length > 0 && (
        <ClayCard>
          {section('scouting', 'Following', lists.scouting, '', (p) => (
            <PersonRow key={p.handle} {...p} inlineActions actions={btn(p, 'unscout', 'Unfollow', 'ghost')} />
          ))}
        </ClayCard>
      )}

      <ConfirmationDialog
        open={leaving !== undefined}
        title="Stop being friends?"
        description={`You and @${leaving?.handle ?? ''} will no longer be friends. They are not told.`}
        confirmLabel="Stop being friends"
        loading={leaving !== undefined && busy === `${leaving.handle}:leave`}
        onCancel={() => setLeaving(undefined)}
        onConfirm={async () => {
          // Closes either way: on failure the error shows above the lists.
          if (leaving) await run(leaving.handle, 'leave');
          setLeaving(undefined);
        }}
      />
    </div>
  );
}
