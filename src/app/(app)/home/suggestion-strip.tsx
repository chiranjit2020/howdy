'use client';

import Link from 'next/link';
import { useId } from 'react';
import type { PalSuggestion } from '@/modules/suggestions';
import { FormMessage } from '@/ui/auth/form-parts';
import { CloseIcon } from '@/ui/icons';
import { Avatar, Button, IconButton } from '@/ui/primitives';
import { useSuggestionActions } from '../friends/suggestions';

/** How many small cards Home shows; the rest are on Friends ("See all"). */
const SHOW = 5;

/**
 * "Friends you may know" on Home (ADR-061): a row of small cards between "What's on your mind?" and the posts, on every
 * screen size. Five across when the column is wide enough (a container query on the column, not the screen); on a
 * phone a row you swipe, with the next card peeking in to say there is more. No scrollbar is drawn: the peek and the
 * snap do that job, and keyboard focus scrolls each card into view. Dismissing one closes the gap and the next moves in.
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
          // Phone: a swiped row, edge to edge of the column. Wide column: five equal cards, nothing to scroll.
          'flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' +
          '@xl:grid @xl:grid-cols-5 @xl:overflow-visible'
        }
      >
        {visible.map((s) => (
          <li
            key={s.handle}
            className="relative flex w-32 shrink-0 snap-start flex-col items-center gap-2 rounded-lg border border-border bg-surface p-3 pt-5 text-center @xl:w-auto"
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
                  {s.shared} mutual friends
                </span>
              </span>
            </Link>
            {asked.has(s.handle) ? (
              <span className="flex min-h-11 items-center text-caption text-text-secondary pointer-fine:min-h-8">
                Asked
              </span>
            ) : (
              <Button
                size="sm"
                fullWidth
                loading={busy === `${s.handle}:ask`}
                onClick={() => ask(s.handle)}
                aria-label={`Ask ${s.displayName} to be friends`}
              >
                Ask
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
