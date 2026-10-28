import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Log in and Create account: the same shell as every other page, but bare (no top bar, no site footer). The card
 * carries the logo, and the page its own short Terms · Privacy · Help row. The other signed-out pages (gate, verify,
 * lost-your-key) keep the bar and footer.
 */
export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame waysIn={false} bare>
      {children}
    </AppFrame>
  );
}
