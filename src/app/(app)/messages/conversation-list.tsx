'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { PersonEntry } from '@/app/_lib/social';
import type { ThreadSummary } from '@/modules/whispers';
import { cn } from '@/ui/cn';
import { formatRelative } from '@/ui/howdy';
import { PencilIcon, WhisperIcon } from '@/ui/icons';
import { Avatar, Badge, Button, EmptyState, IconButton, Input, Modal, Skeleton } from '@/ui/primitives';

const PANEL = 'clay flex min-h-0 flex-1 flex-col overflow-hidden';

/** "Asha", "asha", "@asha" all find Asha Rao (@asha_r). */
const matches = (p: { displayName: string; handle: string }, q: string) => {
  const needle = q.trim().toLowerCase().replace(/^@/, '');
  return !needle || `${p.displayName} ${p.handle}`.toLowerCase().includes(needle);
};

/**
 * My conversations, newest first. The open one is marked (and its unread count hidden: I am reading it). The heading is
 * the page's h1 on /messages and an h2 beside an open chat, whose name is the h1 there.
 */
export function ConversationList({
  threads,
  held,
  friends,
}: {
  threads: ThreadSummary[];
  held: number;
  friends: PersonEntry[];
}) {
  const path = usePathname();
  const active = path.startsWith('/messages/') ? decodeURIComponent(path.split('/')[2] ?? '') : null;
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);
  const shown = threads.filter((t) => matches(t, q));
  const Heading = active === null ? 'h1' : 'h2';

  return (
    <section aria-labelledby="messages-heading" className={PANEL}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <Heading id="messages-heading" className="min-w-0 flex-1 text-heading text-text-primary">
          Messages
        </Heading>
        <IconButton label="New message" onClick={() => setPicking(true)}>
          <PencilIcon />
        </IconButton>
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-6">
          <EmptyState
            as="h2"
            icon={<WhisperIcon className="text-text-muted" />}
            title="No messages yet"
            description="Messages are private, just between you and a friend, and vanish after 7 days."
          />
          <Button size="sm" onClick={() => setPicking(true)}>
            Start a conversation
          </Button>
        </div>
      ) : (
        <>
          <div className="px-4 pt-2 pb-1">
            <Input
              label="Search conversations"
              hideLabel
              type="search"
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
          </div>
          <ul aria-label="Your conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {shown.map((t) => {
              const current = t.handle === active;
              return (
                <li key={t.handle}>
                  <Link
                    href={`/messages/${t.handle}`}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-2 py-2.5 no-underline hover:no-underline',
                      current ? 'bg-primary-soft' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <Avatar name={t.displayName} tint={t.portraitTint} src={t.portraitUrl} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">
                          {t.displayName}
                        </span>
                        <span className="shrink-0 text-metadata text-text-muted">
                          {t.muted && 'Muted · '}
                          {formatRelative(new Date(t.last.at))}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-caption text-text-secondary">
                          {t.last.mine && <span className="sr-only">You said: </span>}
                          {t.last.mine ? 'You: ' : ''}
                          {t.last.body}
                        </span>
                        {t.unread > 0 && !current && (
                          <Badge tone="new">
                            {t.unread > 99 ? '99+' : t.unread}
                            <span className="sr-only"> unread</span>
                          </Badge>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="px-2 py-6 text-center text-caption text-text-secondary">
                No conversation matches “{q.trim()}”.
              </li>
            )}
          </ul>
        </>
      )}

      {held > 0 && (
        <Link
          href="/messages/held"
          className="flex min-h-11 items-center border-t border-border px-4 text-caption font-semibold"
        >
          Held back from people you restricted ({held > 99 ? '99+' : held})
        </Link>
      )}

      <NewMessage open={picking} onClose={() => setPicking(false)} friends={friends} />
    </section>
  );
}

/** Pick a friend to message: messages are between friends only, so these are everyone you can write to. */
function NewMessage({
  open,
  onClose,
  friends,
}: {
  open: boolean;
  onClose: () => void;
  friends: PersonEntry[];
}) {
  const [q, setQ] = useState('');
  const shown = friends.filter((f) => matches(f, q));
  return (
    <Modal open={open} onClose={onClose} title="New message">
      {friends.length === 0 ? (
        <p className="text-body text-text-secondary">
          Messages are between friends. Once someone accepts your friend request, you can write to them here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            label="Search friends"
            hideLabel
            type="search"
            placeholder="Search friends"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <ul
            aria-label="Your friends"
            className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto"
          >
            {shown.map((f) => (
              <li key={f.handle}>
                <Link
                  href={`/messages/${f.handle}`}
                  onClick={onClose}
                  className="flex min-h-11 items-center gap-3 py-2 no-underline hover:no-underline"
                >
                  <Avatar name={f.displayName} tint={f.portraitTint} src={f.portraitUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-text-primary">{f.displayName}</span>
                    <span className="block truncate text-caption text-text-secondary">@{f.handle}</span>
                  </span>
                </Link>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="py-6 text-center text-caption text-text-secondary">
                No friend matches “{q.trim()}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/** The list's outline while it loads: the heading, the search box and a few conversation rows. */
export function ConversationListSkeleton() {
  // The real heading from the first paint (the page is never without its h1, even while the list streams in).
  const Heading = usePathname() === '/messages' ? 'h1' : 'h2';
  return (
    <div aria-busy="true" className={cn(PANEL, 'gap-3 p-4')}>
      <Heading className="text-heading text-text-primary">Messages</Heading>
      <p role="status" className="sr-only">
        Loading…
      </p>
      <Skeleton className="h-11 w-full rounded-md" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
