'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { PersonEntry, RelationshipLists } from '@/app/_lib/social';
import type { RelationshipAction } from '@/shared/validation/relationships';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { PersonRow } from '@/ui/howdy';
import { RAIL_CARD, RAIL_TEXT, RailCard } from '@/ui/howdy/rail-card';
import { MoreIcon, UsersIcon, WhisperIcon } from '@/ui/icons';
import { Button, ConfirmationDialog, Dropdown, EmptyState, Input } from '@/ui/primitives';

// A round 44px icon button (or link) for the compact Pals row. The card is white, so the hover is the sunken grey.
const iconButton =
  'inline-flex size-11 items-center justify-center rounded-pill text-title text-text-primary no-underline hover:bg-surface-sunken hover:text-text-primary';

/** How many friends a phone shows before "Show all"; past this many, the list also gets a search box. */
const PHONE_FRIENDS = 8;
/** A friend who said yes within this long is marked "New friend" (newest are on top). */
const NEW_FRIEND_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The signed-in person's lists, in the order people act on them (2026-11-10): requests waiting for you first, then
 * `addFriend` (the phone's compact Add a friend box; wide screens have it in the right panel), your friends newest first,
 * the requests you sent, and who you follow. Each button sends one action; the page then reloads from the server.
 */
export function PosseLists({ lists, addFriend }: { lists: RelationshipLists; addFriend?: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [leaving, setLeaving] = useState<PersonEntry | undefined>();
  const [allFriends, setAllFriends] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const friends = q
    ? lists.posse.filter((p) => p.displayName.toLowerCase().includes(q) || p.handle.includes(q))
    : lists.posse;
  // While searching every match shows; otherwise a phone shows the newest few until "Show all".
  const friendsCut = !q && !allFriends && lists.posse.length > PHONE_FRIENDS;
  const [now] = useState(() => Date.now());
  const isNew = (p: PersonEntry) => now - new Date(p.at).getTime() < NEW_FRIEND_MS;

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

  // One card per list, in the side cards' proportions (2026-11-07): 16 px title, 40 px avatars, 14 px names, 12 px
  // gaps between people (no lines: the gap already separates them), and the small print under a dashed rule.
  const section = (
    id: string,
    title: string,
    people: PersonEntry[],
    empty: string,
    row: (p: PersonEntry, i: number) => ReactNode,
    more?: ReactNode,
    foot?: ReactNode,
    top?: ReactNode,
  ) => (
    <RailCard id={id} title={title} {...(foot ? { foot } : {})}>
      {top}
      {people.length === 0 ? (
        <p className={RAIL_TEXT}>{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">{people.map(row)}</ul>
      )}
      {more}
    </RailCard>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {lists.truncated && <FormMessage tone="info">Showing the first 100 in each list.</FormMessage>}

      {lists.incoming.length > 0 &&
        section('requests', `Requests for you (${lists.incoming.length})`, lists.incoming, '', (p) => (
          <PersonRow
            key={p.handle}
            {...p}
            card
            inlineActions
            actions={
              <>
                {btn(p, 'accept', 'Accept', 'primary')}
                {btn(p, 'decline', 'Decline', 'ghost')}
              </>
            }
          />
        ))}

      {addFriend}

      {lists.posse.length === 0 && lists.incoming.length === 0 ? (
        <div className={RAIL_CARD}>
          <EmptyState
            as="h2"
            icon={<UsersIcon className="text-text-primary" />}
            title="No friends yet"
            description="Send a request with their username, or share your invite link with someone new. Requests are private until they say yes."
          />
        </div>
      ) : (
        section(
          'posse',
          `Your friends (${lists.posse.length})`,
          friends,
          `No friend matches “${query.trim()}”.`,
          (p, i) => (
            <PersonRow
              key={p.handle}
              {...p}
              card
              inlineActions
              className={friendsCut && i >= PHONE_FRIENDS ? 'max-xl:hidden' : undefined}
              {...(isNew(p) || p.closeByMe
                ? {
                    note: [isNew(p) && 'New friend', p.closeByMe && 'Close friend']
                      .filter(Boolean)
                      .join(' · '),
                  }
                : {})}
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
                        <MoreIcon className="size-5" />
                      </button>
                    )}
                    items={[
                      {
                        id: 'close',
                        label: p.closeByMe ? 'Remove from close friends' : 'Add to close friends',
                        disabled: busy !== undefined,
                        onSelect: () => run(p.handle, p.closeByMe ? 'unclose' : 'close'),
                      },
                      { id: 'leave', label: 'Unfriend…', onSelect: () => setLeaving(p) },
                    ]}
                  />
                </>
              }
            />
          ),
          friendsCut && (
            <Button
              variant="link"
              size="sm"
              className="-mx-1 self-start xl:hidden"
              onClick={() => setAllFriends(true)}
            >
              Show all {lists.posse.length} friends
            </Button>
          ),
          'Close friend is a private label, just for you. Following someone shows their posts on your Home. Nobody is told about either.',
          lists.posse.length > PHONE_FRIENDS && (
            <Input
              label="Search your friends"
              hideLabel
              type="search"
              placeholder="Search your friends"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
          ),
        )
      )}

      {lists.outgoing.length > 0 &&
        section('waiting', `Sent requests (${lists.outgoing.length})`, lists.outgoing, '', (p) => (
          <PersonRow key={p.handle} {...p} card inlineActions actions={btn(p, 'cancel', 'Cancel', 'ghost')} />
        ))}

      {lists.scouting.length > 0 &&
        section('scouting', 'Following', lists.scouting, '', (p) => (
          <PersonRow
            key={p.handle}
            {...p}
            card
            inlineActions
            actions={btn(p, 'unscout', 'Unfollow', 'ghost')}
          />
        ))}

      <ConfirmationDialog
        open={leaving !== undefined}
        title="Unfriend?"
        description={`You and @${leaving?.handle ?? ''} will no longer be friends. They are not told.`}
        confirmLabel="Unfriend"
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
