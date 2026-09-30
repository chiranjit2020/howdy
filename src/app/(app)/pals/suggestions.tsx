'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PalSuggestion } from '@/modules/suggestions';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Avatar, Button, ClayCard } from '@/ui/primitives';

const why = (s: PalSuggestion) => {
  const names = s.via.map((v) => v.displayName);
  const others = s.shared - names.length;
  if (names.length === 0) return `${s.shared} shared Pals`;
  return others > 0
    ? `Pals with ${names.join(', ')} and ${others} more of yours`
    : `Pals with ${names.join(' and ')}`;
};

/**
 * "Pals you may know" (ADR-029): Pals of at least two of my Pals. Ask sends an ordinary Pal request; Not now hides them
 * for good. Neither tells them anything beyond what an ordinary ask does. Only rendered when there is someone.
 */
export function Suggestions({ initial }: { initial: PalSuggestion[] }) {
  const [list, setList] = useState(initial);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  if (list.length === 0) return null;

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

  return (
    <section aria-labelledby="suggestions-heading">
      <ClayCard className="flex flex-col gap-3">
        <h2 id="suggestions-heading" className="text-title text-text-primary">
          Pals you may know
        </h2>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <ul className="flex flex-col gap-3">
          {list.map((s) => (
            <li key={s.handle} className="flex flex-wrap items-center gap-3">
              <Avatar name={s.displayName} tint={s.portraitTint} size="sm" />
              <span className="min-w-0 flex-1">
                <Link href={`/porch/${s.handle}`} className="block font-semibold [overflow-wrap:anywhere]">
                  {s.displayName}
                </Link>
                <span className="block text-caption text-text-secondary">{why(s)}</span>
              </span>
              {asked.has(s.handle) ? (
                <span className="text-caption text-text-secondary">Asked</span>
              ) : (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    loading={busy === `${s.handle}:ask`}
                    onClick={() => ask(s.handle)}
                    aria-label={`Ask ${s.displayName} to be Pals`}
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
            </li>
          ))}
        </ul>
      </ClayCard>
    </section>
  );
}
