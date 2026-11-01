'use client';

import { useState } from 'react';
import type { MarkKind } from '@/shared/validation/marks';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { MARK_LABEL, MARK_MEANING, MARK_ORDER, MarkIcon } from '@/ui/howdy';
import { Chip, HelpTip } from '@/ui/primitives';

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
      <div className="flex items-center">
        <p id="describe-label" className="text-caption font-semibold text-text-primary">
          Describe {displayName}
        </p>
        <HelpTip label="How does describing work?">
          <p className="mb-1.5">
            Pick the one word that fits them. You can change it any time, or tap it again to take it back.
          </p>
          <ul className="mb-1.5 flex flex-col gap-0.5">
            {MARK_ORDER.map((k) => (
              <li key={k}>
                <strong className="font-semibold">{MARK_LABEL[k]}</strong> · {MARK_MEANING[k]}
              </li>
            ))}
          </ul>
          <p>
            Their profile shows only the top words, once three people have picked. Never who picked which.
          </p>
        </HelpTip>
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div role="group" aria-labelledby="describe-label" className="flex flex-wrap gap-2">
        {MARK_ORDER.map((k) => (
          <Chip
            key={k}
            selected={mine === k}
            disabled={busy}
            onSelect={() => void choose(k)}
            aria-label={`${MARK_LABEL[k]} (${MARK_MEANING[k].toLowerCase()})`}
          >
            <MarkIcon kind={k} />
            {MARK_LABEL[k]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
