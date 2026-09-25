import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Signed-out pages (Gate, Step Inside, Stake a Claim, verify, lost-your-key) share the exact same shell as every signed-in
 * page, on the same flat Daylight background. Their top bar is just the logo, centred: the page itself is the way in, so
 * the bar's Step Inside / Stake a Claim buttons would only repeat it. See AppShell for the shell itself.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AppFrame waysIn={false}>{children}</AppFrame>;
}
