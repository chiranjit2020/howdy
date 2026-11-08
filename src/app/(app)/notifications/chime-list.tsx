'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ChimeType, ChimeView } from '@/modules/notifications';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { ChimeItem, type ChimeType as ItemType } from '@/ui/howdy';
import { BellIcon, MoreIcon } from '@/ui/icons';
import { Button, ClayCard, ConfirmationDialog, Dropdown, EmptyState, IconButton } from '@/ui/primitives';

type Wire = Omit<ChimeView, 'at'> & { at: string };
interface Page {
  chimes: Wire[];
  nextCursor: string | null;
  /** Every unread one the person can see (not only the bell's new ones). */
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
 * The notifications page (2026-11-03). Opening it clears the bell's number (up to what it shows, `seenAt`), but each
 * notification stays unread (tinted, red dot) until it is opened or marked read from its menu. "Mark all as read" and
 * "Clear all" sit at the top; each one can also be marked unread again or removed. The server decides what is shown.
 */
export function ChimeList({ initial, seenAt, bell }: { initial: Page; seenAt: string; bell: number }) {
  const router = useRouter();
  const [chimes, setChimes] = useState<Wire[]>(initial.chimes);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [unreadLeft, setUnreadLeft] = useState(initial.unread);
  const [busy, setBusy] = useState<'more' | 'clear' | 'read' | undefined>();
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const seen = useRef<string | undefined>(undefined);

  // Opening the page clears the bell. Only when it shows a number, so the redraw this causes does not ask again.
  useEffect(() => {
    if (bell === 0 || seen.current === seenAt) return;
    seen.current = seenAt;
    void postJson('/api/me/chimes/seen', { before: seenAt }).then((res) => {
      if (res.ok) router.refresh(); // the bell lives in the layout, drawn on the server
    });
  }, [bell, seenAt, router]);

  // The server's newest page, after a redraw: new and bumped notifications go to the top, older pages already loaded
  // stay below. The server is the truth for read and unread.
  const [shownFirst, setShownFirst] = useState(initial.chimes);
  if (shownFirst !== initial.chimes) {
    setShownFirst(initial.chimes);
    setUnreadLeft(initial.unread);
    setChimes((all) => {
      const ids = new Set(initial.chimes.map((c) => c.id));
      return [...initial.chimes, ...all.filter((c) => !ids.has(c.id))];
    });
  }

  const patch = (id: string, fn: (c: Wire) => Wire) =>
    setChimes((all) => all.map((c) => (c.id === id ? fn(c) : c)));

  /** Read or unread, shown at once and put back if the server says no. */
  async function setRead(c: Wire, read: boolean) {
    if (c.unread === !read) return;
    setError(undefined);
    patch(c.id, (x) => ({ ...x, unread: !read }));
    setUnreadLeft((n) => Math.max(0, n + (read ? -1 : 1)));
    const res = await apiRequest('PATCH', `/api/me/chimes/${c.id}`, { read });
    if (!res.ok && res.status !== 404) {
      patch(c.id, (x) => ({ ...x, unread: read }));
      setUnreadLeft((n) => Math.max(0, n + (read ? 1 : -1)));
      setError(res.error?.message ?? 'That did not work. Try again.');
    }
  }

  async function remove(c: Wire) {
    setError(undefined);
    const res = await apiRequest('DELETE', `/api/me/chimes/${c.id}`);
    if (res.ok || res.status === 404) {
      setChimes((all) => all.filter((x) => x.id !== c.id));
      if (c.unread) setUnreadLeft((n) => Math.max(0, n - 1));
    } else setError(res.error?.message ?? 'Could not remove that notification. Try again.');
  }

  async function readAll() {
    setBusy('read');
    setError(undefined);
    const res = await postJson('/api/me/chimes/read', { all: true, before: seenAt });
    setBusy(undefined);
    if (res.ok) {
      setChimes((all) => all.map((c) => (new Date(c.at) <= new Date(seenAt) ? { ...c, unread: false } : c)));
      setUnreadLeft(0);
      router.refresh();
    } else setError(res.error?.message ?? 'Could not mark them read. Try again.');
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
      setUnreadLeft(0);
      router.refresh(); // the bell's count lives in the layout
    } else setError(res.error?.message ?? 'Could not clear your notifications. Try again.');
  }

  const anyUnread = unreadLeft > 0 || chimes.some((c) => c.unread);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-heading text-text-primary">Notifications</h1>
          <p role="status" className="text-caption text-text-secondary">
            {unreadLeft > 0 && chimes.length > 0 ? (
              `${unreadLeft > 99 ? '99+' : unreadLeft} unread`
            ) : (
              // Nothing unread: said to screen readers, not shown (the list itself makes it plain on screen).
              <span className="sr-only">All caught up</span>
            )}
          </p>
        </div>
        {chimes.length > 0 && (
          <div className="flex items-center gap-4">
            {anyUnread && (
              <Button variant="link" loading={busy === 'read'} onClick={readAll}>
                Mark all as read
              </Button>
            )}
            <Button variant="link" onClick={() => setClearing(true)}>
              Clear all
            </Button>
          </div>
        )}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {chimes.length === 0 ? (
        <ClayCard>
          <EmptyState
            as="h2"
            icon={<BellIcon className="text-text-primary" />}
            title="No notifications"
            description="When a friend posts on your wall, replies, reacts, sends you a message or invites you to a group, it shows here."
          />
        </ClayCard>
      ) : (
        <section
          aria-label="Your notifications"
          className="overflow-hidden rounded-card border border-border bg-surface shadow-clay"
        >
          <ul className="flex flex-col divide-y divide-border">
            {chimes.map((c) => {
              const label = `More about this notification: ${c.text}`;
              return (
                <ChimeItem
                  key={c.id}
                  type={ITEM[c.type]}
                  text={c.text}
                  createdAt={c.at}
                  unread={c.unread}
                  href={c.href}
                  // Opening it reads it; the link goes on at once and the mark follows quietly.
                  onOpen={() => void setRead(c, true)}
                  person={{ name: c.actor.displayName, tint: c.actor.portraitTint, src: c.actor.portraitUrl }}
                  menu={
                    <Dropdown
                      label={label}
                      align="end"
                      items={[
                        c.unread
                          ? { id: 'read', label: 'Mark as read', onSelect: () => void setRead(c, true) }
                          : { id: 'unread', label: 'Mark as unread', onSelect: () => void setRead(c, false) },
                        { id: 'remove', label: 'Remove', onSelect: () => void remove(c) },
                      ]}
                      trigger={(t) => (
                        <IconButton label={label} {...t}>
                          <MoreIcon className="size-5" />
                        </IconButton>
                      )}
                    />
                  }
                />
              );
            })}
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
