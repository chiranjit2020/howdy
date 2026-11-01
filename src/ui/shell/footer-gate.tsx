'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Messages is a full-height chat (its panes fill the screen under the top bar): no site footer under it. */
export function FooterGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path === '/messages' || path.startsWith('/messages/') ? null : children;
}
