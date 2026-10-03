'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { useLiveRing } from './use-live-ring';

/**
 * For a server-rendered list (the Whispers list): when my doorbell rings (ADR-035), redraw the page from the server, so a
 * new Whisper's thread moves to the top with its unread count. Rings close together are folded into one redraw.
 */
export function LiveRefresh({ channel }: { channel: string | undefined }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onRing = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  }, [router]);
  useLiveRing(channel, onRing);
  return null;
}
