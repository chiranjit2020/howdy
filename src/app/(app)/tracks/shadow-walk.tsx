'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { ClayCard, Switch, useToast } from '@/ui/primitives';

/** The Eye: Shadow Walk hides my visits and, in return, freezes my own Tracks. Private to me. */
export function ShadowWalk({ initial }: { initial: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  async function set(value: boolean) {
    const before = on;
    setOn(value);
    setError(undefined);
    const res = await apiRequest('PATCH', '/api/me/ranch', { shadowWalk: value });
    if (res.ok) {
      toast({ title: value ? 'Shadow Walk is on.' : 'Shadow Walk is off.', tone: 'success' });
      router.refresh();
    } else {
      setOn(before);
      setError(res.error?.message ?? 'That did not save. Try again.');
    }
  }

  return (
    <ClayCard>
      <Switch
        label="Shadow Walk"
        hint={
          on
            ? 'Your visits leave no Tracks, and your own Tracks are frozen.'
            : 'Browse without leaving Tracks. In return, your own Tracks freeze.'
        }
        checked={on}
        onCheckedChange={set}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </ClayCard>
  );
}
