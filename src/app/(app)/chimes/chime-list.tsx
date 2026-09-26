'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChimeType, ChimeView } from '@/modules/notifications';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { ChimeItem, type ChimeType as ItemType } from '@/ui/howdy';
import { Button, ClayCard, EmptyState } from '@/ui/primitives';

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
};

/** The Chimes page. Opening a Chime marks it read; "Mark all read" clears the rest. The server decides what is shown. */
export function ChimeList({ initial }: { initial: Page }) {
  const router = useRouter();
  const [chimes, setChimes] = useState<Wire[]>(initial.chimes);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [unread, setUnread] = useState(initial.unread);
  const [busy, setBusy] = useState<'all' | 'more' | undefined>();
  const [error, setError] = useState<string | undefined>();

  function open(chime: Wire) {
    if (!chime.unread) return;
    setChimes((all) => all.map((c) => (c.id === chime.id ? { ...c, unread: false } : c)));
    setUnread((n) => Math.max(0, n - 1));
    // keepalive: the request finishes even though the browser is already leaving for the Chime's page.
    void fetch('/api/me/chimes/read', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [chime.id] }),
    }).catch(() => undefined);
  }

  async function markAll() {
    setBusy('all');
    setError(undefined);
    const res = await postJson('/api/me/chimes/read', { all: true });
    setBusy(undefined);
    if (res.ok) {
      setChimes((all) => all.map((c) => ({ ...c, unread: false })));
      setUnread(0);
      router.refresh();
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

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
    } else setError(res.error?.message ?? 'Could not load older Chimes.');
  }

  if (chimes.length === 0) {
    return (
      <ClayCard>
        <EmptyState
          icon="🔔"
          title="All quiet on the range"
          description="When someone asks to be your Pal, nails a card to your Fence, gives you a Yo, leaves a Tribute or a Mark, or invites you to a Town Hall, it rings here."
        />
      </ClayCard>
    );
  }

  return (
    <section aria-label="Your Chimes" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-caption text-text-secondary">
          {unread > 0 ? `${unread > 99 ? '99+' : unread} unread` : 'All caught up'}
        </p>
        {unread > 0 && (
          <Button variant="secondary" size="sm" loading={busy === 'all'} onClick={markAll}>
            Mark all read
          </Button>
        )}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="flex flex-col gap-2">
        {chimes.map((c) => (
          <ChimeItem
            key={c.id}
            type={ITEM[c.type]}
            text={c.text}
            createdAt={c.at}
            unread={c.unread}
            href={c.href}
            onOpen={() => open(c)}
          />
        ))}
      </ul>
      {next && (
        <Button variant="secondary" loading={busy === 'more'} onClick={more} className="self-center">
          Older Chimes
        </Button>
      )}
    </section>
  );
}
