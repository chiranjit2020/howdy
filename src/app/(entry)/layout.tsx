import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Log in and Create account: the same shell as every other page, but with no top bar. The card carries the logo itself,
 * so a bar above it would only repeat it. The other signed-out pages (gate, verify, lost-your-key) keep theirs.
 */
export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame waysIn={false} header={false}>
      {children}
    </AppFrame>
  );
}
