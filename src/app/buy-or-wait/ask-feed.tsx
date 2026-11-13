'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AskList } from '@/shared/validation/town-halls';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { NewAsk } from '@/ui/howdy/buy-or-wait';
import { cn } from '@/ui/cn';
import { Button, EmptyState, useToast } from '@/ui/primitives';
import { AskCard, type WireAsk } from './ask-card';

const SHOW: { key: AskList; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'friends', label: 'Friends' },
  { key: 'mine', label: 'Mine' },
];

const EMPTY: Record<AskList, { title: string; description: string }> = {
  all: {
    title: 'No questions yet',
    description: 'Thinking of buying something? Ask first. People answer Buy or Wait, each with a reason.',
  },
  friends: {
    title: 'Your friends haven’t asked anything yet',
    description: 'When a friend asks “Buy or wait?”, it shows here and you get a notification.',
  },
  mine: {
    title: 'You haven’t asked yet',
    description: 'Ask about the next thing you’re thinking of buying.',
  },
};

/**
 * The Buy or wait page (ADR-066): ask, then the questions — everyone's and my friends' (Everyone), my friends' only, or
 * mine. The filter is a link (`?show=`), so each list has its own address and the back button works.
 */
export function AskFeed({
  show,
  initial,
  nextCursor,
  groups,
}: {
  show: AskList;
  initial: WireAsk[];
  nextCursor: string | null;
  groups: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [asks, setAsks] = useState(initial);
  const [next, setNext] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function more() {
    if (!next) return;
    setLoading(true);
    const res = await apiRequest<{ asks: WireAsk[]; nextCursor: string | null }>(
      'GET',
      `/api/asks?show=${show}&cursor=${next}`,
    );
    setLoading(false);
    if (res.ok && res.data) {
      const page = res.data.asks;
      setAsks((all) => [...all, ...page.filter((p) => !all.some((a) => a.id === p.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load more questions.');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 basis-full font-display text-heading text-text-primary sm:flex-1 sm:basis-0">
          Buy or wait?
        </h1>
        <NewAsk<unknown, WireAsk>
          groups={groups}
          initialTarget="everyone"
          trigger="Ask a question"
          triggerVariant="primary"
          onPosted={(made) => {
            if (made.kind === 'public') {
              setAsks((all) => [made.ask, ...all]);
              toast({ title: 'Asked. Your friends will hear about it.', tone: 'success' });
            } else toast({ title: 'Asked in your group.', tone: 'success' });
          }}
        />
      </div>
      <p className="text-caption text-text-secondary">
        Thinking of buying something? Ask before you spend. People answer Buy or Wait, each with a reason. You
        decide.
      </p>
      <nav aria-label="Which questions" className="flex gap-2">
        {SHOW.map((s) => (
          <Link
            key={s.key}
            href={s.key === 'all' ? '/buy-or-wait' : `/buy-or-wait?show=${s.key}`}
            aria-current={show === s.key ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-pill px-4 text-caption font-medium no-underline pointer-fine:min-h-9',
              show === s.key
                ? 'bg-primary font-semibold text-on-primary'
                : 'bg-surface-sunken text-text-primary hover:bg-border',
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {asks.length === 0 ? (
        <EmptyState as="h2" title={EMPTY[show].title} description={EMPTY[show].description} />
      ) : (
        <ol className="flex flex-col gap-4">
          {asks.map((a) => (
            <li key={a.id}>
              <AskCard initial={a} onRemoved={(id) => setAsks((all) => all.filter((x) => x.id !== id))} />
            </li>
          ))}
        </ol>
      )}
      {next && (
        <Button variant="secondary" onClick={more} loading={loading} className="self-center">
          More questions
        </Button>
      )}
    </div>
  );
}
