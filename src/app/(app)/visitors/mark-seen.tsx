'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { postJson } from '@/ui/auth/api';

/**
 * Opening Visitors counts as looking at them: their "new" mark is cleared on the server and the page frame is refreshed,
 * so the menu's count and the dot on your photo go (the menu lives in the layout, drawn on the server). Like Notifications.
 */
export function MarkVisitsSeen({ fresh }: { fresh: number }) {
  const router = useRouter();
  const marked = useRef(false);
  useEffect(() => {
    if (fresh === 0 || marked.current) return;
    marked.current = true;
    void postJson('/api/me/tracks/seen', {}).then((res) => {
      if (res.ok) router.refresh();
    });
  }, [fresh, router]);
  return null;
}
