'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Waiting } from '@/modules/fence';
import type { WaitingTribute } from '@/modules/tributes';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Img } from '@/ui/art/img';
import { RelativeTime } from '@/ui/howdy';
import { Button, ClayCard } from '@/ui/primitives';

type Item = {
  kind: 'cards' | 'replies' | 'tributes';
  id: string;
  body: string;
  handle: string;
  createdAt: Date | string;
  onCard?: string;
  photo?: { url: string; width: number; height: number } | null;
};

const ROUTE: Record<Item['kind'], string> = { cards: 'cards', replies: 'replies', tributes: 'tributes' };

/** Words waiting for the owner's say-so — Post Cards, replies and Tributes alike. */
export function WaitingQueue({ waiting, tributes = [] }: { waiting: Waiting; tributes?: WaitingTribute[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const items: Item[] = [
    ...waiting.cards.map((c) => ({
      kind: 'cards' as const,
      id: c.id,
      body: c.body,
      handle: c.author.handle,
      createdAt: c.createdAt,
      photo: c.photo,
    })),
    ...waiting.replies.map((r) => ({
      kind: 'replies' as const,
      id: r.id,
      body: r.body,
      handle: r.author.handle,
      createdAt: r.createdAt,
      onCard: r.onCard,
    })),
    ...tributes.map((t) => ({
      kind: 'tributes' as const,
      id: t.id,
      body: t.body,
      handle: t.author.handle,
      createdAt: t.createdAt,
    })),
  ];
  if (items.length === 0) return null;

  async function run(item: Item, action: 'approve' | 'remove') {
    setBusy(`${item.id}:${action}`);
    setError(undefined);
    const res =
      action === 'approve'
        ? await apiRequest('POST', `/api/${ROUTE[item.kind]}/${item.id}/approve`, {})
        : await apiRequest('DELETE', `/api/${ROUTE[item.kind]}/${item.id}`);
    setBusy(undefined);
    if (res.ok || res.status === 404) router.refresh();
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <ClayCard className="flex flex-col gap-4">
      <h2 className="text-title text-text-primary">Waiting for you ({items.length})</h2>
      <p className="text-caption text-text-secondary">
        Only you can see these. Approve one to make it public, or take it down.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-metadata text-text-muted">
              {item.kind === 'tributes' ? 'Tribute from ' : ''}@{item.handle} ·{' '}
              <RelativeTime date={item.createdAt} />
              {item.onCard ? ` · reply to “${item.onCard}”` : ''}
            </p>
            <p className="text-body break-words text-text-primary">{item.body}</p>
            {item.photo && (
              <Img
                src={item.photo.url}
                width={item.photo.width}
                height={item.photo.height}
                alt={`Photo on the waiting card from @${item.handle}`}
                className="h-auto max-h-60 w-full rounded-md bg-surface-sunken object-contain"
              />
            )}
            <div className="flex gap-2">
              <Button size="sm" loading={busy === `${item.id}:approve`} onClick={() => run(item, 'approve')}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `${item.id}:remove`}
                onClick={() => run(item, 'remove')}
              >
                Take it down
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ClayCard>
  );
}
