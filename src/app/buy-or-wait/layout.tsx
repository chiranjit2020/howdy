import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Buy or wait (ADR-066). The list is for signed-in people; a question's own page (its share link) also opens signed out
 * when it is for everyone, so this sits outside the signed-in group, like a profile.
 */
export default function BuyOrWaitLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
