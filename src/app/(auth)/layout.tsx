import type { ReactNode } from 'react';
import { AuthBackdrop } from '@/ui/auth/illustrations';

/**
 * Shared frame for the signed-out pages: a warm gradient with soft colour shapes behind, one centred card in front. Each
 * page brings its own <AuthCard> (which carries the Howdy wordmark), so the wordmark can be large on Step Inside and small
 * elsewhere.
 *
 * These pages are always Daylight, whatever the system or Dusk setting: `daylight-only` is the marker that tokens.css
 * (`:root:has(.daylight-only)`) uses to switch the whole page to the light palette.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="daylight-only">
      <AuthBackdrop />
      <main
        id="main"
        className="mx-auto flex min-h-dvh w-full max-w-xl items-center justify-center px-4 py-10"
      >
        {children}
      </main>
    </div>
  );
}
