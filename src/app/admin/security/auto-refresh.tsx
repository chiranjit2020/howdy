'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-reads the console every `seconds` while the tab is visible. The data is server-rendered; this only re-asks. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-on-island/10 px-2 py-1 text-metadata text-on-island-muted">
      <span className="inline-block size-1.5 rounded-pill bg-success" aria-hidden />
      Auto-refresh: {seconds}s
    </span>
  );
}
