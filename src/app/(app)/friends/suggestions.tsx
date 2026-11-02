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
  if (names.length === 0) return `${s.shared} shared friends`;
  return others > 0
    ? `Friends with ${names.join(', ')} and ${others} more of yours`
    : `Friends with ${names.join(' and ')}`;
};

/**
 * "Pals you may know" (ADR-029): Pals of at least two of my Pals. Ask sends an ordinary Pal request; Not now hides them
 * for good. Neither tells them anything beyond what an ordinary ask does. Only rendered when there is someone.
 *
 * `show` keeps the card short (Home's panel, the Friends page on a phone): the first few, and the next one moves up when
 * one is dismissed. Then either `more` links to the full card (Home) or a "Show N more" button opens it in place.
 */
export function Suggestions({
  initial,
  id = 'suggestions-heading',
  show,
  more,
  className,
}: {
  initial: PalSuggestion[];
  /** The heading's id; a page that renders the card twice (phone and wide layouts) gives each its own. */
  id?: string;
  show?: number;
  more?: { href: string; label: string };
  /** Classes for a wrapper around the card (e.g. which screen sizes show it); no wrapper without. Nothing at all when
   *  there is nobody to suggest, so no empty box takes a gap. */
  className?: string;
}) {
  const [list, setList] = useState(initial);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [expanded, setExpanded] = useState(false);
  if (list.length === 0) return null;
  const cut = show !== undefined && !expanded && list.length > show;
  const visible = cut ? list.slice(0, show) : list;

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

  const card = (
    <RailCard id={id} title="Friends you may know" {...(cut && more ? { more } : {})}>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="-my-2.5 flex flex-col divide-y divide-border">
        {visible.map((s) => (
          <li key={s.handle} className="flex gap-3 py-2.5">
            <Avatar name={s.displayName} tint={s.portraitTint} src={s.portraitUrl} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {/* The name and why are one link: a 44 px target that reads as "Dev · Friends with Bikram". */}
              <Link
                href={`/profile/${s.handle}`}
                className="block min-h-11 min-w-0 no-underline hover:underline"
              >
                <span className="block truncate font-semibold">{s.displayName}</span>
                <span className="line-clamp-2 text-caption text-text-secondary">{why(s)}</span>
              </Link>
              {asked.has(s.handle) ? (
                <span className="text-caption text-text-secondary">Asked</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    loading={busy === `${s.handle}:ask`}
                    onClick={() => ask(s.handle)}
                    aria-label={`Ask ${s.displayName} to be friends`}
                  >
                    Ask
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
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
      {cut && !more && (
        <Button variant="link" className="self-start" onClick={() => setExpanded(true)}>
          Show {list.length - visible.length} more
        </Button>
      )}
    </RailCard>
  );
  return className ? <div className={className}>{card}</div> : card;
}
