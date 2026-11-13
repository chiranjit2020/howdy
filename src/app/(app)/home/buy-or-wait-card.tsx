'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AskView } from '@/modules/asks';
import { NewAsk, rupees, VerdictMark } from '@/ui/howdy/buy-or-wait';
import { BuyOrWaitIcon } from '@/ui/icons';
import { buttonClasses, useToast } from '@/ui/primitives';
import { cn } from '@/ui/cn';

type WireAsk = Omit<AskView, 'createdAt'> & { createdAt: Date | string };

/**
 * "Buy or wait?" on Home (ADR-066): the newest open questions people can answer (each one opens its page), and the way to
 * ask your own. Always shown, so the feature is never hidden: with no questions yet it invites you to ask the first.
 */
export function BuyOrWaitCard({ asks, groups }: { asks: WireAsk[]; groups: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <section aria-labelledby="buy-or-wait-heading" className="clay flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="buy-or-wait-heading" className="min-w-0 flex-1 text-title font-semibold text-text-primary">
          <BuyOrWaitIcon aria-hidden="true" className="mr-1.5 inline size-6 align-[-0.2em]" />
          Buy or wait?
        </h2>
        <NewAsk<unknown, WireAsk>
          groups={groups}
          initialTarget="everyone"
          trigger="Ask"
          triggerVariant="primary"
          onPosted={(made) => {
            toast({ title: 'Asked. People will start answering.', tone: 'success' });
            if (made.kind === 'public') router.push(`/buy-or-wait/${made.ask.id}`);
            else router.push(`/groups/${made.groupId}`);
          }}
        />
      </div>
      {asks.length === 0 ? (
        <p className="text-caption text-text-secondary">
          Thinking of buying something? Ask first. People answer Buy or Wait, each with a reason.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {asks.map((a) => (
            <li key={a.id}>
              <Link
                href={`/buy-or-wait/${a.id}`}
                className="flex min-h-11 items-center gap-3 py-2 text-text-primary no-underline hover:no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.item}</span>
                  <span className="block truncate text-metadata text-text-muted">
                    {a.author.displayName} · {rupees(a.priceRupees)}
                  </span>
                </span>
                <span className="shrink-0 text-caption text-text-secondary tabular-nums">
                  <VerdictMark verdict="buy" /> {a.counts.buy} · <VerdictMark verdict="wait" />{' '}
                  {a.counts.wait}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/buy-or-wait" className={cn(buttonClasses({ variant: 'link', size: 'sm' }), 'self-start')}>
        See all questions
      </Link>
    </section>
  );
}
