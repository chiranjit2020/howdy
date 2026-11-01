'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

/**
 * The two panes. Wide (lg+): list and chat side by side, filling the screen under the top bar. Narrower: one at a time —
 * the list on /messages, the chat (or the held tray) everywhere else; on a phone the chat covers the tab bar, full
 * screen under the top bar, so its reply box sits at the very bottom, as in any messenger.
 */
export function MessagesFrame({ list, children }: { list: ReactNode; children: ReactNode }) {
  const open = usePathname() !== '/messages';
  return (
    <main
      id="main"
      className={cn(
        'flex flex-col gap-4 py-4',
        // Exactly the screen under the 56 px top bar (the shell's bottom padding is taken back: no footer here).
        'md:-mb-8 md:h-[calc(100dvh-3.5rem)]',
        'lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]',
      )}
    >
      <div className={cn('min-h-0 flex-col md:flex-1', open ? 'hidden lg:flex' : 'flex')}>{list}</div>
      <div
        className={cn(
          'min-h-0 flex-1 flex-col',
          open
            ? // A phone: edge to edge under the top bar (the chat card drops its frame there).
              'flex max-md:fixed max-md:inset-x-0 max-md:top-14 max-md:bottom-0 max-md:z-[45] max-md:bg-surface max-md:pb-[env(safe-area-inset-bottom)]'
            : 'hidden lg:flex',
        )}
      >
        {children}
      </div>
    </main>
  );
}
