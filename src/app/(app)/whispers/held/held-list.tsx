'use client';

import { useState } from 'react';
import type { HeldWhisper } from '@/modules/whispers';
import { FormMessage } from '@/ui/auth/form-parts';
import { RelativeTime } from '@/ui/howdy';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { Avatar, Button, ClayCard } from '@/ui/primitives';

/** The held Whispers, newest first, each with its sender and a way to flag it. */
export function HeldList({ held }: { held: HeldWhisper[] }) {
  const [flagId, setFlagId] = useState<string | undefined>();
  const [flagged, setFlagged] = useState(false);
  return (
    <>
      {flagged && <FormMessage tone="success">Thanks. We will take a look. They are not told.</FormMessage>}
      <ul className="flex flex-col gap-3" aria-label="Held Whispers">
        {held.map((w) => (
          <li key={w.id}>
            <ClayCard className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Avatar
                  name={w.from.displayName}
                  tint={w.from.portraitTint}
                  src={w.from.portraitUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1 text-body [overflow-wrap:anywhere]">
                  <span className="font-semibold text-text-primary">{w.from.displayName}</span>{' '}
                  <span className="text-text-secondary">@{w.from.handle}</span>
                </span>
                <RelativeTime date={w.createdAt} className="text-metadata text-text-secondary" />
              </div>
              <p className="text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-text-primary">
                {w.body}
              </p>
              <Button size="sm" variant="ghost" className="self-start" onClick={() => setFlagId(w.id)}>
                Flag this Whisper
              </Button>
            </ClayCard>
          </li>
        ))}
      </ul>
      <ReportDialog
        open={flagId !== undefined}
        title="Flag this Whisper"
        endpoint={`/api/reports/whisper/${flagId ?? ''}`}
        onClose={() => setFlagId(undefined)}
        onDone={() => setFlagged(true)}
      />
    </>
  );
}
