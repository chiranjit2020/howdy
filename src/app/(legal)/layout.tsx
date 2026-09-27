import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * Privacy, Terms, Campfire Rules and Cookies: open to everyone, signed in or not, in the usual shell. Never sends anyone
 * to /agree — these are the pages a person must be able to read BEFORE agreeing.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <AppFrame askToAgree={false}>{children}</AppFrame>;
}
