'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  capsule_opened: 'CAPSULE_OPENED',
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
  const [busy, setBusy] = useState<'more' | undefined>();
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
          {fresh > 0 ? `${fresh > 99 ? '99+' : fresh} new` : 'All caught up'}
        </p>
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
            {...(c.actor.portraitUrl
              ? { photo: { name: c.actor.displayName, src: c.actor.portraitUrl } }
              : {})}
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
