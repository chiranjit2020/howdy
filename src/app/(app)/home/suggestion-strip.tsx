'use client';

import Link from 'next/link';
import { useId } from 'react';
import type { PalSuggestion } from '@/modules/suggestions';
import { FormMessage } from '@/ui/auth/form-parts';
import { CloseIcon } from '@/ui/icons';
import { Avatar, Button, IconButton } from '@/ui/primitives';
import { useSuggestionActions } from '../friends/suggestions';

/** How many small cards Home shows; the rest are on Friends ("See all"). */
const SHOW = 10;

/**
 * "Friends you may know" on Home (ADR-061): a row of small cards between "What's on your mind?" and the posts, on every
 * screen size: up to ten (early days fill it, 2026-11-08) in a row you swipe, with the next card peeking in to say there
 * is more. On a phone no scrollbar is drawn (the peek and the snap do that job); in a wide column a thin one shows,
 * since a mouse cannot swipe, and keyboard focus scrolls each card into view. Dismissing one closes the gap and the next moves in.
 */
export function SuggestionStrip({ initial }: { initial: PalSuggestion[] }) {
  const headingId = useId();
  const { list, asked, busy, error, ask, notNow } = useSuggestionActions(initial);
  if (list.length === 0) return null;
  const visible = list.slice(0, SHOW);

  return (
    <section aria-labelledby={headingId} className="@container flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-title text-text-primary">
          Friends you may know
        </h2>
        {list.length > SHOW && (
          <Link href="/friends" className="inline-flex min-h-11 items-center text-caption font-semibold">
            See all
          </Link>
        )}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul
        className={
          // Phone: a swiped row, edge to edge of the column, with 8 px of room inside it (taken back by the negative
          // margin) so the scroll box does not cut off the cards' shadows. Wide column: the same row, with a thin scrollbar for the mouse.
          '-mx-2 flex snap-x snap-mandatory scroll-px-2 gap-3 overflow-x-auto px-2 pb-2 [scrollbar-width:none] ' +
          'max-@xl:[&::-webkit-scrollbar]:hidden @xl:[scrollbar-width:thin]'
        }
      >
        {visible.map((s) => (
          <li
            key={s.handle}
            className="relative flex w-32 shrink-0 snap-start flex-col items-center gap-2 rounded-card border border-border bg-surface p-3 pt-5 shadow-clay text-center"
          >
            <IconButton
              label={`Not now: stop suggesting ${s.displayName}`}
              className="absolute top-0.5 right-0.5 text-body text-text-secondary"
              disabled={busy === `${s.handle}:dismiss`}
              onClick={() => notNow(s.handle)}
            >
              <CloseIcon className="size-4" />
            </IconButton>
            <Link
              href={`/profile/${s.handle}`}
              className="flex w-full min-w-0 flex-col items-center gap-2 no-underline hover:underline"
            >
              <Avatar name={s.displayName} tint={s.portraitTint} src={s.portraitUrl} size="lg" />
              <span className="flex w-full min-w-0 flex-col">
                <span className="truncate text-caption font-semibold text-text-primary">{s.displayName}</span>
                <span className="truncate text-metadata text-text-secondary">
                  {s.shared === 0
                    ? 'New on Howdy'
                    : `${s.shared} mutual ${s.shared === 1 ? 'friend' : 'friends'}`}
                </span>
              </span>
            </Link>
            {asked.has(s.handle) ? (
              <span className="flex min-h-11 items-center text-caption text-text-secondary pointer-fine:min-h-8">
                Request sent
              </span>
            ) : (
              <Button
                size="sm"
                fullWidth
                loading={busy === `${s.handle}:ask`}
                onClick={() => ask(s.handle)}
                aria-label={`Add ${s.displayName} as a friend`}
              >
                Add friend
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
