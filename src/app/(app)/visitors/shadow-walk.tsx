'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { RailCard } from '@/ui/howdy/rail-card';
import { Switch, useToast } from '@/ui/primitives';

/**
 * The Eye: Shadow Walk hides my visits and, in return, freezes my own Tracks. Private to me. A card in the right panel,
 * "Your visits": whether the profiles I open see that I stopped by.
 */
export function ShadowWalk({ initial }: { initial: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  async function set(value: boolean) {
    const before = on;
    setOn(value);
    setError(undefined);
    const res = await apiRequest('PATCH', '/api/me/porch', { shadowWalk: value });
    if (res.ok) {
      toast({ title: value ? 'Private browsing is on.' : 'Private browsing is off.', tone: 'success' });
      router.refresh();
    } else {
      setOn(before);
      setError(res.error?.message ?? 'That did not save. Try again.');
    }
  }

  return (
    <RailCard id="your-visits" title="Your visits">
      <Switch
        label="Private browsing"
        hint={
          on
            ? 'No one can see when you visit. Your own visitors stay hidden until you turn this off.'
            : 'Visit profiles without anyone knowing. While it’s on, you won’t see your own visitors either.'
        }
        checked={on}
        onCheckedChange={set}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </RailCard>
  );
}
