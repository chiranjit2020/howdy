'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DirectoryItem, DirectoryPage, InviteSummary, TownHallSummary } from '@/modules/town-halls';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { TownHallCard } from '@/ui/howdy';
import { Button, ClayCard, EmptyState, Tabs } from '@/ui/primitives';

/** Directory, your own Town Halls, and invites waiting for your answer — three tabs, nothing shared between them. */
export function TownHallsView({
  initialDirectory,
  mine,
  invites,
}: {
  initialDirectory: DirectoryPage;
  mine: TownHallSummary[];
  invites: InviteSummary[];
}) {
  return (
    <Tabs
      label="Town Halls"
      tabs={[
        { id: 'directory', label: 'Discover', panel: <Directory initial={initialDirectory} /> },
        { id: 'mine', label: `Mine (${mine.length})`, panel: <Mine mine={mine} /> },
        {
          id: 'invites',
          label: invites.length > 0 ? `Invites (${invites.length})` : 'Invites',
          panel: <Invites initial={invites} />,
        },
      ]}
    />
  );
}

function Directory({ initial }: { initial: DirectoryPage }) {
  const [items, setItems] = useState<DirectoryItem[]>(initial.townHalls);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function join(id: string) {
    setBusy(id);
    setError(undefined);
    const res = await apiRequest('POST', `/api/town-halls/${id}`, { action: 'join' });
    setBusy(undefined);
    if (res.ok) setItems((all) => all.map((t) => (t.id === id ? { ...t, joined: true } : t)));
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  async function loadMore() {
    if (!next) return;
    setBusy('__more__');
    const res = await apiRequest<DirectoryPage>('GET', `/api/town-halls?cursor=${next}`);
    setBusy(undefined);
    if (res.ok && res.data) {
      const more = res.data.townHalls;
      setItems((all) => [...all, ...more.filter((m) => !all.some((t) => t.id === m.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load more.');
  }

  if (items.length === 0) {
    return (
      <ClayCard>
        <EmptyState as="h2" icon="🏛️" title="No Town Halls yet" description="Be the first to start one." />
      </ClayCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {items.map((t) => (
        <TownHallCard
          key={t.id}
          name={t.name}
          description={t.description}
          visibility={t.visibility}
          joined={t.joined}
          action={
            t.joined ? (
              <Link href={`/town-halls/${t.id}`} className="text-caption text-auth-link">
                Open
              </Link>
            ) : (
              <Button size="sm" loading={busy === t.id} onClick={() => join(t.id)}>
                Join
              </Button>
            )
          }
        />
      ))}
      {next && (
        <Button variant="secondary" loading={busy === '__more__'} onClick={loadMore} className="self-center">
          More Town Halls
        </Button>
      )}
    </div>
  );
}

function Mine({ mine }: { mine: TownHallSummary[] }) {
  if (mine.length === 0) {
    return (
      <ClayCard>
        <EmptyState
          as="h2"
          icon="🏛️"
          title="You have not joined any yet"
          description="Discover one, or start your own."
        />
      </ClayCard>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {mine.map((t) => (
        <TownHallCard
          key={t.id}
          name={t.name}
          description={t.description}
          visibility={t.visibility}
          joined
          action={
            <Link href={`/town-halls/${t.id}`} className="text-caption text-auth-link">
              {t.isOwner ? 'Manage' : 'Open'}
            </Link>
          }
        />
      ))}
    </div>
  );
}

function Invites({ initial }: { initial: InviteSummary[] }) {
  const [invites, setInvites] = useState(initial);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function answer(townHallId: string, action: 'accept' | 'decline') {
    setBusy(`${townHallId}:${action}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/town-halls/${townHallId}`, { action });
    setBusy(undefined);
    if (res.ok) setInvites((all) => all.filter((i) => i.townHallId !== townHallId));
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  if (invites.length === 0) {
    return (
      <ClayCard>
        <EmptyState as="h2" icon="🏛️" title="No invites waiting" description="You are all caught up." />
      </ClayCard>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {invites.map((i) => (
        <ClayCard key={i.townHallId} className="flex flex-col gap-3">
          <h3 className="text-title text-text-primary">{i.name}</h3>
          <p className="text-body text-text-secondary">{i.description}</p>
          <p className="text-caption text-text-secondary">Invited by @{i.invitedBy.handle}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={busy === `${i.townHallId}:accept`}
              onClick={() => answer(i.townHallId, 'accept')}
            >
              Join
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === `${i.townHallId}:decline`}
              onClick={() => answer(i.townHallId, 'decline')}
            >
              Decline
            </Button>
          </div>
        </ClayCard>
      ))}
    </div>
  );
}
