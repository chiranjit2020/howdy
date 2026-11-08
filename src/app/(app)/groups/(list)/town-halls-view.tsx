'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DirectoryItem, DirectoryPage, InviteSummary, MineItem } from '@/modules/town-halls';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { GROUP_VISIBILITY_LABEL } from '@/ui/howdy';
import { RAIL_TEXT, RailCard } from '@/ui/howdy/rail-card';
import { GroupIcon } from '@/ui/icons';
import { Badge, Button, ClayCard, EmptyState } from '@/ui/primitives';

/** A group's initial on a quiet tile: a circle has no picture yet, and its name is what people know it by. */
function GroupMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-title font-semibold text-on-highlight"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Invites waiting for my answer, at the top of the page (there is nothing to do with a group until I answer). */
export function InvitesCard({ initial }: { initial: InviteSummary[] }) {
  const router = useRouter();
  const [invites, setInvites] = useState(initial);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  if (invites.length === 0) return null;

  async function answer(townHallId: string, action: 'accept' | 'decline') {
    setBusy(`${townHallId}:${action}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/town-halls/${townHallId}`, { action });
    setBusy(undefined);
    if (res.ok) {
      setInvites((all) => all.filter((i) => i.townHallId !== townHallId));
      router.refresh();
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <ClayCard className="flex flex-col gap-2">
      <h2 className="text-title text-text-primary">Invites for you ({invites.length})</h2>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="-mb-2.5 flex flex-col divide-y divide-border">
        {invites.map((i) => (
          <li key={i.townHallId} className="flex flex-wrap items-center gap-3 py-2.5">
            <GroupMark name={i.name} />
            <div className="min-w-0 flex-[1_1_12rem]">
              <p className="truncate text-body font-semibold text-text-primary">{i.name}</p>
              <p className="truncate text-caption text-text-secondary">Invited by @{i.invitedBy.handle}</p>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                loading={busy === `${i.townHallId}:accept`}
                onClick={() => answer(i.townHallId, 'accept')}
                aria-label={`Join ${i.name}`}
              >
                Join
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `${i.townHallId}:decline`}
                onClick={() => answer(i.townHallId, 'decline')}
                aria-label={`Decline ${i.name}`}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ClayCard>
  );
}

/** The circles I belong to: one row each, straight to it. */
export function MyGroups({ mine }: { mine: MineItem[] }) {
  if (mine.length === 0) {
    return (
      <ClayCard>
        <EmptyState
          as="h2"
          icon={<GroupIcon className="text-text-primary" />}
          title="No groups yet"
          description="Start one for your batch, family, society or team, and invite them. Groups your friends are in show on the right."
        />
      </ClayCard>
    );
  }
  return (
    <ClayCard className="flex flex-col gap-2">
      <h2 className="text-title text-text-primary">Your groups ({mine.length})</h2>
      <ul className="-mx-2 -mb-2 flex flex-col">
        {mine.map((t) => (
          <li key={t.id}>
            <Link
              href={`/groups/${t.id}`}
              className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2.5 no-underline hover:bg-surface-sunken hover:no-underline"
            >
              <GroupMark name={t.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-text-primary">{t.name}</span>
                <span className="truncate text-caption text-text-secondary">{t.description}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {t.requestsWaiting ? (
                  <Badge tone="new">
                    {t.requestsWaiting}
                    <span className="sr-only"> asking to join</span>
                  </Badge>
                ) : null}
                <span className="text-metadata text-text-muted">
                  {t.myRole === 'owner'
                    ? 'Owner'
                    : t.myRole === 'deputy'
                      ? 'Deputy'
                      : GROUP_VISIBILITY_LABEL[t.visibility]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ClayCard>
  );
}

/** "Groups your friends are in" (ADR-054): circles friends of mine are in and that may be found. */
export function FriendsGroups({ initial }: { initial: DirectoryPage }) {
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

  return (
    <RailCard
      id="friends-groups"
      title="Groups your friends are in"
      {...(next
        ? {
            foot: (
              <Button
                variant="link"
                size="sm"
                className="-mx-1"
                loading={busy === '__more__'}
                onClick={loadMore}
              >
                More groups
              </Button>
            ),
          }
        : {})}
    >
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {items.length === 0 ? (
        <p className={RAIL_TEXT}>When your friends are in groups that can be found, they show here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((t) => (
            <li key={t.id} className="flex flex-col gap-1.5">
              <Link href={`/groups/${t.id}`} className="block min-h-11 min-w-0 no-underline hover:underline">
                <span className="block truncate text-card font-semibold text-text-primary">{t.name}</span>
                <span className="block text-metadata font-normal text-text-muted">
                  {t.friendsHere === 1 ? '1 friend is here' : `${t.friendsHere} friends are here`}
                </span>
              </Link>
              {t.joined ? (
                <Link href={`/groups/${t.id}`} className="text-caption font-semibold">
                  Open
                </Link>
              ) : t.joinRule === 'approval' ? (
                // Asked for on its own page, which explains that the owner or a Deputy lets people in (ADR-041).
                <Link
                  href={`/groups/${t.id}`}
                  className="inline-flex min-h-11 items-center text-caption font-semibold"
                >
                  Ask to join
                </Link>
              ) : (
                <Button
                  size="sm"
                  loading={busy === t.id}
                  onClick={() => join(t.id)}
                  className="self-start"
                  aria-label={`Join ${t.name}`}
                >
                  Join
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}
