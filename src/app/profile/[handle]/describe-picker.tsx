'use client';

import { useState } from 'react';
import type { MarkKind } from '@/shared/validation/marks';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { MARK_LABEL, MARK_MEANING, MARK_ORDER, MarkIcon } from '@/ui/howdy';
import { cn } from '@/ui/cn';

/**
 * "Describe Meera" (ADR-052), in the "You and Meera" card: pick the one word that fits them, change it any time, or tap
 * your word again to take it back. Their profile shows only the top words once enough friends have picked — never counts,
 * never who picked what.
 */
export function DescribePicker({
  handle,
  displayName,
  initial,
}: {
  handle: string;
  displayName: string;
  initial: MarkKind | null;
}) {
  const [mine, setMine] = useState<MarkKind | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function choose(kind: MarkKind) {
    setBusy(true);
    setError(undefined);
    const res =
      mine === kind
        ? await apiRequest('DELETE', `/api/porch/${handle}/marks`)
        : await postJson(`/api/porch/${handle}/marks`, { kind });
    setBusy(false);
    if (res.ok) setMine(mine === kind ? null : kind);
    else setError(res.error?.message ?? 'That did not go through. Try again.');
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p id="describe-label" className="text-body font-semibold text-text-primary">
        Describe {displayName}
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {/* Five equal tiles in one row (emoji over the word), so they never wrap, even at 320 px. */}
      <div role="group" aria-labelledby="describe-label" className="grid grid-cols-5 gap-1.5">
        {MARK_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={mine === k}
            disabled={busy}
            onClick={() => void choose(k)}
            aria-label={`${MARK_LABEL[k]} (${MARK_MEANING[k].toLowerCase()})`}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-metadata transition-colors disabled:opacity-60',
              mine === k
                ? 'bg-primary font-bold text-on-primary'
                : 'bg-surface-sunken font-medium text-text-primary hover:bg-border',
            )}
          >
            <MarkIcon kind={k} className="text-title" />
            {MARK_LABEL[k]}
          </button>
        ))}
      </div>
      {/* What the pick means, and how private it is: said here, so no "?" is needed. */}
      <p className="text-caption text-text-secondary" aria-live="polite">
        {mine ? (
          <>
            You picked <strong className="font-semibold text-text-primary">{MARK_LABEL[mine]}</strong>:{' '}
            {MARK_MEANING[mine].toLowerCase()}. Tap it again to take it back.{' '}
          </>
        ) : (
          'Pick the one word that fits them. '
        )}
        Only you know what you picked. Their profile shows the top words once three friends pick.
      </p>
    </div>
  );
}
