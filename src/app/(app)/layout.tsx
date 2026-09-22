import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/** Every signed-in page (Home, Posse, Whispers, Chimes, Tracks) lives inside the same shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
