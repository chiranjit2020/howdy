'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PersonEntry, RelationshipLists } from '@/app/_lib/social';
import type { RelationshipAction } from '@/shared/validation/relationships';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { PersonRow } from '@/ui/howdy';
import { Button, ClayCard } from '@/ui/primitives';

/** Outlaws (blocked), muted and restricted people, each with an undo. Private: they are never told. */
export function PeopleControls({
  blocked,
  muted,
  restricted,
}: Pick<RelationshipLists, 'blocked' | 'muted' | 'restricted'>) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function undo(p: PersonEntry, action: RelationshipAction) {
    setBusy(`${p.handle}:${action}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/relationships/${p.handle}`, { action });
    setBusy(undefined);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  const group = (
    id: string,
    title: string,
    people: PersonEntry[],
    action: RelationshipAction,
    label: string,
    linkToRanch: boolean,
  ) =>
    people.length === 0 ? null : (
      <section key={id} aria-labelledby={id} className="flex flex-col gap-2">
        <h3 id={id} className="text-caption font-semibold text-text-primary">
          {title}
        </h3>
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <PersonRow
              key={p.handle}
              {...p}
              linkToRanch={linkToRanch}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `${p.handle}:${action}`}
                  onClick={() => undo(p, action)}
                  aria-label={`${label} ${p.displayName}`}
                >
                  {label}
                </Button>
              }
            />
          ))}
        </ul>
      </section>
    );

  const none = blocked.length + muted.length + restricted.length === 0;
  return (
    <ClayCard>
      <div className="flex flex-col gap-4">
        <h2 className="text-title text-text-primary">Outlaws and quiet ones</h2>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {none ? (
          <p className="text-caption text-text-secondary">
            Nobody. You can block, mute or restrict someone from their Ranch. They are never told.
          </p>
        ) : (
          <>
            {group('blocked', 'Blocked (Outlaws)', blocked, 'unblock', 'Unblock', false)}
            {group('muted', 'Muted', muted, 'unmute', 'Unmute', true)}
            {group('restricted', 'Restricted', restricted, 'unrestrict', 'Unrestrict', true)}
          </>
        )}
      </div>
    </ClayCard>
  );
}
