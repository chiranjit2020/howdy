'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PalSuggestion } from '@/modules/suggestions';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { RailCard } from '@/ui/howdy/rail-card';
import { Avatar, Button } from '@/ui/primitives';

const why = (s: PalSuggestion) => {
  const names = s.via.map((v) => v.displayName);
  const others = s.shared - names.length;
  // Early days suggest people I share no friends with too (EARLY_DAYS_UNTIL).
  if (s.shared === 0) return 'New on Howdy';
  if (names.length === 0) return `${s.shared} shared ${s.shared === 1 ? 'friend' : 'friends'}`;
  return others > 0
    ? `Friends with ${names.join(', ')} and ${others} more of yours`
    : `Friends with ${names.join(' and ')}`;
};

/**
 * Ask and Not now, shared by the Friends page card and Home's strip (ADR-061). Ask sends an ordinary friend request;
 * Not now hides that person for good, and the list closes up so the next one moves in.
 */
export function useSuggestionActions(initial: PalSuggestion[]) {
  const [list, setList] = useState(initial);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function ask(handle: string) {
    setBusy(`${handle}:ask`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/relationships/${handle}`, { action: 'request' });
    setBusy(undefined);
    if (res.ok) setAsked((s) => new Set(s).add(handle));
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }
  async function notNow(handle: string) {
    setBusy(`${handle}:dismiss`);
    setError(undefined);
    const res = await apiRequest('POST', '/api/pals/suggestions/dismiss', { handle });
    setBusy(undefined);
    if (res.ok) setList((all) => all.filter((s) => s.handle !== handle));
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }
  return { list, asked, busy, error, ask, notNow };
}

/**
 * "Pals you may know" (ADR-029): Pals of at least two of my Pals. Neither Add friend nor Not now tells them anything beyond what
 * an ordinary ask does. Only rendered when there is someone.
 *
 * `show` keeps the card short (the Friends page on a phone): the first few, and the next one moves up when one is
 * dismissed; "Show N more" opens the rest in place.
 */
export function Suggestions({
  initial,
  id = 'suggestions-heading',
  show,
  className,
}: {
  initial: PalSuggestion[];
  /** The heading's id; a page that renders the card twice (phone and wide layouts) gives each its own. */
  id?: string;
  show?: number;
  /** Classes for a wrapper around the card (e.g. which screen sizes show it); no wrapper without. Nothing at all when
   *  there is nobody to suggest, so no empty box takes a gap. */
  className?: string;
}) {
  const { list, asked, busy, error, ask, notNow } = useSuggestionActions(initial);
  const [expanded, setExpanded] = useState(false);
  if (list.length === 0) return null;
  const cut = show !== undefined && !expanded && list.length > show;
  const visible = cut ? list.slice(0, show) : list;

  const card = (
    <RailCard
      id={id}
      title="Friends you may know"
      {...(cut
        ? {
            foot: (
              <Button variant="link" size="sm" className="-mx-1" onClick={() => setExpanded(true)}>
                Show {list.length - visible.length} more
              </Button>
            ),
          }
        : {})}
    >
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="flex flex-col gap-4">
        {visible.map((s) => (
          <li key={s.handle} className="flex gap-3">
            <Avatar name={s.displayName} tint={s.portraitTint} src={s.portraitUrl} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {/* The name and why are one link: a 44 px target that reads as "Dev · Friends with Bikram". */}
              <Link
                href={`/profile/${s.handle}`}
                className="block min-h-11 min-w-0 no-underline hover:underline"
              >
                <span className="block truncate text-card font-semibold text-text-primary">
                  {s.displayName}
                </span>
                <span className="line-clamp-2 text-metadata font-normal text-text-muted">{why(s)}</span>
              </Link>
              {asked.has(s.handle) ? (
                <span className="text-caption text-text-secondary">Request sent</span>
              ) : (
                // "Add friend", never a lone short word: a pill around "Ask" came out as a circle (2026-11-10).
                <span className="flex items-center gap-3">
                  <Button
                    size="sm"
                    loading={busy === `${s.handle}:ask`}
                    onClick={() => ask(s.handle)}
                    aria-label={`Add ${s.displayName} as a friend`}
                  >
                    Add friend
                  </Button>
                  <Button
                    size="sm"
                    variant="link"
                    loading={busy === `${s.handle}:dismiss`}
                    onClick={() => notNow(s.handle)}
                    aria-label={`Not now: stop suggesting ${s.displayName}`}
                  >
                    Not now
                  </Button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </RailCard>
  );
  return className ? <div className={className}>{card}</div> : card;
}
