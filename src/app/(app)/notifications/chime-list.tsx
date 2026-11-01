'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ChimeType, ChimeView } from '@/modules/notifications';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { ChimeItem, type ChimeType as ItemType } from '@/ui/howdy';
import { BellIcon } from '@/ui/icons';
import { Button, ClayCard, ConfirmationDialog, EmptyState } from '@/ui/primitives';

type Wire = Omit<ChimeView, 'at'> & { at: string };
interface Page {
  chimes: Wire[];
  nextCursor: string | null;
  unread: number;
}

const ITEM: Record<ChimeType, ItemType> = {
  posse_requested: 'POSSE_REQUESTED',
  posse_accepted: 'POSSE_ACCEPTED',
  card_created: 'POST_CARD_CREATED',
  card_waiting: 'CARD_WAITING',
  card_approved: 'CARD_APPROVED',
  reply_created: 'POST_CARD_REPLIED',
  reply_waiting: 'REPLY_WAITING',
  yo_given: 'YO_DROPPED',
  whisper_received: 'WHISPER_RECEIVED',
  tribute_waiting: 'CARD_WAITING',
  tribute_approved: 'TRIBUTE_CREATED',
  mark_given: 'MARK_AWARDED',
  townhall_invited: 'TOWNHALL_INVITED',
  townhall_invite_accepted: 'TOWNHALL_ACCEPTED',
  capsule_opened: 'CAPSULE_OPENED',
  hall_reply_created: 'POST_CARD_REPLIED',
  hall_reaction_given: 'YO_DROPPED',
  townhall_join_requested: 'TOWNHALL_INVITED',
  townhall_request_approved: 'TOWNHALL_ACCEPTED',
  townhall_made_deputy: 'TOWNHALL_ACCEPTED',
  townhall_made_owner: 'TOWNHALL_ACCEPTED',
  story_reacted: 'YO_DROPPED',
};

/**
 * The Chimes page. Opening it counts as reading everything it shows: they are marked read on the server straight away and
 * the page frame is refreshed, so the bell's number clears. What was new stays highlighted for this visit. A Chime that
 * rings after the page was drawn (`seenAt`) is left unread. The server decides what is shown.
 */
export function ChimeList({ initial, seenAt }: { initial: Page; seenAt: string }) {
  const router = useRouter();
  const [chimes, setChimes] = useState<Wire[]>(initial.chimes);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [busy, setBusy] = useState<'more' | 'clear' | undefined>();
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const marked = useRef(false);
  const fresh = initial.unread;

  useEffect(() => {
    if (fresh === 0 || marked.current) return;
    marked.current = true;
    void postJson('/api/me/chimes/read', { all: true, before: seenAt }).then((res) => {
      if (res.ok) router.refresh(); // the bell lives in the layout, drawn on the server
    });
  }, [fresh, seenAt, router]);

  async function more() {
    if (!next) return;
    setBusy('more');
    setError(undefined);
    const res = await apiRequest<Page>('GET', `/api/me/chimes?cursor=${next}`);
    setBusy(undefined);
    if (res.ok && res.data) {
      const older = res.data.chimes;
      setChimes((all) => [...all, ...older.filter((o) => !all.some((c) => c.id === o.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load older notifications.');
  }

  async function clearAll() {
    setBusy('clear');
    setError(undefined);
    const res = await apiRequest('DELETE', '/api/me/chimes', { before: seenAt });
    setBusy(undefined);
    setClearing(false);
    if (res.ok) {
      setChimes([]);
      setNext(null);
      router.refresh(); // the bell's count lives in the layout
    } else setError(res.error?.message ?? 'Could not clear your notifications. Try again.');
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-heading text-text-primary">Notifications</h1>
          <p role="status" className="text-caption text-text-secondary">
            {fresh > 0 && chimes.length > 0 ? `${fresh > 99 ? '99+' : fresh} new` : ''}
          </p>
        </div>
        {chimes.length > 0 && (
          <Button variant="link" onClick={() => setClearing(true)}>
            Clear all
          </Button>
        )}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {chimes.length === 0 ? (
        <ClayCard>
          <EmptyState
            as="h2"
            icon={<BellIcon className="text-text-muted" />}
            title="No notifications"
            description="When a friend posts on your wall, replies, reacts, sends you a message or invites you to a group, it shows here."
          />
        </ClayCard>
      ) : (
        <section
          aria-label="Your notifications"
          className="overflow-hidden rounded-lg border border-border bg-surface"
        >
          <ul className="flex flex-col divide-y divide-border">
            {chimes.map((c) => (
              <ChimeItem
                key={c.id}
                type={ITEM[c.type]}
                text={c.text}
                createdAt={c.at}
                unread={c.unread}
                href={c.href}
                person={{ name: c.actor.displayName, tint: c.actor.portraitTint, src: c.actor.portraitUrl }}
              />
            ))}
          </ul>
        </section>
      )}
      {next && (
        <Button variant="secondary" loading={busy === 'more'} onClick={more} className="self-center">
          Older notifications
        </Button>
      )}
      <ConfirmationDialog
        open={clearing}
        destructive
        title="Clear all notifications?"
        description="They are removed for good. New ones will still come in."
        confirmLabel="Clear all"
        loading={busy === 'clear'}
        onCancel={() => setClearing(false)}
        onConfirm={clearAll}
      />
    </>
  );
}
