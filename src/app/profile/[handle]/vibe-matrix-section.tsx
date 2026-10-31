'use client';

import { useState } from 'react';
import type { VibeMatrix as VibeMatrixData } from '@/modules/marks';
import type { MarkKind } from '@/shared/validation/marks';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { MARK_LABEL, MARK_MEANING, PERCENT_AFTER, VibeMatrix } from '@/ui/howdy';
import { RailCard } from '@/ui/howdy/rail-card';
import { HelpTip, useToast } from '@/ui/primitives';

type Wire = Omit<VibeMatrixData, 'cooldownEndsAt'> & { cooldownEndsAt: Date | string | null };

function cooldownLabel(endsAt: Date | string): string {
  const days = Math.max(1, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
  return `You can give them a badge again in ${days} ${days === 1 ? 'day' : 'days'}.`;
}

/** A Ranch's Vibe Matrix — the aggregate Marks breakdown, with a picker for Posse members to award one. */
export function VibeMatrixSection({ handle, initial }: { handle: string; initial: Wire }) {
  const toast = useToast();
  const [matrix, setMatrix] = useState(initial);
  const [giving, setGiving] = useState<MarkKind | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function give(kind: MarkKind) {
    setGiving(kind);
    setError(undefined);
    const res = await postJson<{ kind: MarkKind }>(`/api/porch/${handle}/marks`, { kind });
    setGiving(undefined);
    if (res.ok) {
      setMatrix((m) => ({
        ...m,
        counts: { ...m.counts, [kind]: m.counts[kind] + 1 },
        total: m.total + 1,
        canGive: false,
        cooldownEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }));
      toast({ title: `You gave a ${MARK_LABEL[kind]} badge.`, tone: 'success' });
    } else setError(res.error?.message ?? 'That badge did not go through.');
  }

  return (
    <RailCard
      id="profile-badges"
      title="Badges"
      action={
        // What each kind means, and how they are counted: once, here, instead of a line under every badge.
        <HelpTip label="What are badges?">
          <p className="mb-1.5">
            Kind words from friends and group neighbours, counted. Never a leaderboard.
          </p>
          <ul className="mb-1.5 flex flex-col gap-0.5">
            {(Object.keys(MARK_MEANING) as MarkKind[]).map((k) => (
              <li key={k}>
                <strong className="font-semibold">{MARK_LABEL[k]}</strong> · {MARK_MEANING[k]}
              </li>
            ))}
          </ul>
          <p>Counts until {PERCENT_AFTER} badges, then a share of each.</p>
        </HelpTip>
      }
    >
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <VibeMatrix
        counts={matrix.counts}
        total={matrix.total}
        canGive={matrix.canGive}
        giving={giving}
        onGive={matrix.isOwner ? undefined : give}
        disabledHint={
          !matrix.isOwner && matrix.cooldownEndsAt ? cooldownLabel(matrix.cooldownEndsAt) : undefined
        }
      />
    </RailCard>
  );
}
