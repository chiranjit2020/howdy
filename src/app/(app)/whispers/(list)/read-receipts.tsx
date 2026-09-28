'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { ClayCard, Switch, useToast } from '@/ui/primitives';

/** Read receipts ("Seen"), reciprocal: turning them off also hides everyone else's. Private to me. */
export function ReadReceipts({ initial }: { initial: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  async function set(value: boolean) {
    const before = on;
    setOn(value);
    setError(undefined);
    const res = await apiRequest('PATCH', '/api/me/porch', { readReceipts: value });
    if (res.ok) {
      toast({ title: value ? 'Read receipts are on.' : 'Read receipts are off.', tone: 'success' });
      router.refresh();
    } else {
      setOn(before);
      setError(res.error?.message ?? 'That did not save. Try again.');
    }
  }

  return (
    <ClayCard>
      <Switch
        label="Read receipts"
        hint={
          on
            ? 'Pals who also have them on see “Seen” when you have read their Whispers, and you see theirs.'
            : 'Nobody sees when you have read their Whispers, and you do not see “Seen” either.'
        }
        checked={on}
        onCheckedChange={set}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </ClayCard>
  );
}
