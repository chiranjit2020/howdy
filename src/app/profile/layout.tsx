import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/** A Ranch can be opened signed in (full shell) or signed out (top bar with a way in only). */
export default function RanchLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
