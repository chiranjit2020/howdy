'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AskCard, type WireAsk } from '@/app/buy-or-wait/ask-card';
import { cn } from '@/ui/cn';
import { POST_LIST } from '@/ui/howdy/post-card';
import { buttonClasses } from '@/ui/primitives';

/**
 * A person's newest "Buy or wait?" questions on their profile, above the wall (2026-11-14, the user's ask), answerable
 * right here. Only those this viewer may see arrive from the server; with none, nothing is shown.
 */
export function AsksSection({
  initial,
  ownerName,
  isOwner,
  signedIn,
}: {
  initial: WireAsk[];
  ownerName: string;
  isOwner: boolean;
  signedIn: boolean;
}) {
  const [asks, setAsks] = useState(initial);
  if (asks.length === 0) return null;
  return (
    <section aria-labelledby="profile-asks-heading" className="flex flex-col gap-4">
      <h2 id="profile-asks-heading" className="font-display text-heading text-text-primary">
        {isOwner ? 'Your Buy or wait? questions' : `${ownerName} asks: buy or wait?`}
      </h2>
      <ol className={POST_LIST}>
        {asks.map((a) => (
          <li key={a.id}>
            <AskCard
              initial={a}
              signedIn={signedIn}
              onRemoved={(id) => setAsks((list) => list.filter((x) => x.id !== id))}
            />
          </li>
        ))}
      </ol>
      {signedIn && (
        <Link
          href={isOwner ? '/buy-or-wait?show=mine' : '/buy-or-wait'}
          className={cn(buttonClasses({ variant: 'link', size: 'sm' }), 'self-start')}
        >
          {isOwner ? 'See all your questions' : 'See more questions'}
        </Link>
      )}
    </section>
  );
}
