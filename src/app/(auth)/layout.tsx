import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Signed-out pages (Gate, Step Inside, Stake a Claim, verify, lost-your-key) share the exact same shell as every signed-in
 * page: the top bar with the Howdy logo and a way in, on the same flat Daylight background. There is no separate "before
 * you sign in" look — see AppShell for the shell itself.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
