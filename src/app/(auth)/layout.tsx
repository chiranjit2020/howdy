import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Signed-out pages (Welcome, confirm email, forgot / new password) look exactly like Log in and Sign up: the same shell,
 * bare (no top bar, no site footer). Each page draws its card with `EntryCard` (src/ui/auth/entry-shell.tsx), which
 * leads with the wordmark and ends with Terms · Privacy · Help.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame waysIn={false} bare>
      {children}
    </AppFrame>
  );
}
