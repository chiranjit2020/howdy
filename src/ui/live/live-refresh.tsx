'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useLiveRing } from './use-live-ring';

/**
 * When my doorbell rings (ADR-035), redraw the page from the server, so whatever is server-drawn catches up without a
 * refresh: the menu's counts, the notifications list, the Messages list. Rings close together are folded into one
 * redraw, and a tab in the background waits until it is looked at again.
 */
export function LiveRefresh({ channel }: { channel?: string | undefined }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const missed = useRef(false);

  const onRing = useCallback(() => {
    if (document.visibilityState !== 'visible') {
      missed.current = true;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  }, [router]);

  useEffect(() => {
    function back() {
      if (document.visibilityState !== 'visible' || !missed.current) return;
      missed.current = false;
      router.refresh();
    }
    document.addEventListener('visibilitychange', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      clearTimeout(timer.current);
    };
  }, [router]);

  useLiveRing(channel, onRing);
  return null;
}
