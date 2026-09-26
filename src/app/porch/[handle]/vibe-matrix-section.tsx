'use client';

import { useState } from 'react';
import type { VibeMatrix as VibeMatrixData } from '@/modules/marks';
import type { MarkKind } from '@/shared/validation/marks';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { GlossaryHint, MARK_LABEL, VibeMatrix } from '@/ui/howdy';
import { ClayCard, useToast } from '@/ui/primitives';

type Wire = Omit<VibeMatrixData, 'cooldownEndsAt'> & { cooldownEndsAt: Date | string | null };

function cooldownLabel(endsAt: Date | string): string {
  const days = Math.max(1, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
  return `You can Mark them again in ${days} ${days === 1 ? 'day' : 'days'}.`;
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
      toast({ title: `You gave a ${MARK_LABEL[kind]} Mark.`, tone: 'success' });
    } else setError(res.error?.message ?? 'That Mark did not go through.');
  }

  return (
    <ClayCard className="flex flex-col gap-3 bg-mystery/10">
      <div className="flex items-center">
        <h2 className="text-title text-text-primary">Vibe Matrix</h2>
        <GlossaryHint term="vibeMatrix" />
      </div>
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
    </ClayCard>
  );
}
