import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';

/**
 * The Workshop's shell, in a layout (not the page) so its loading outline appears inside the top bar and sidebar like
 * every other page's. A route group, so /workshop/kit (a design gallery with its own navigation demo) stays outside it.
 */
export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
