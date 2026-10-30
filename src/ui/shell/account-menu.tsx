'use client';

import Link from 'next/link';
import { useCallback, useId, useRef, useState } from 'react';
import { Avatar } from '../primitives/avatar';
import { useDismiss } from '../primitives/use-dismiss';
import type { ShellMe } from './app-shell';
import { Devices } from './devices';

/**
 * Your avatar in the top bar (wide screens): opens a small panel with who you are, your profile and Settings, and your
 * devices with the ways to sign out. A disclosure, not a menu: it holds a list and buttons, so Tab moves through it as
 * usual. Escape or a click outside closes it, and focus goes back to the avatar.
 */
export function AccountMenu({ me }: { me: ShellMe }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    // While "Sign out of every device?" is asking, Escape belongs to that question: it closes the question only.
    if (root.current?.querySelector('dialog[open]')) return;
    setOpen(false);
    button.current?.focus();
  }, []);
  useDismiss(open, [root], close);

  return (
    <div ref={root} className="relative hidden md:block">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Your account"
        onClick={() => setOpen((o) => !o)}
        // A real 44 px box: an image alone is too small to tap.
        className="grid size-11 place-items-center rounded-pill pointer-fine:size-9"
      >
        <Avatar name={me.displayName} src={me.portraitUrl} tint={me.portraitTint} size="sm" />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Your account"
          className="absolute top-full right-0 z-40 mt-2 flex w-80 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-float"
        >
          <div className="flex items-center gap-3">
            <Avatar name={me.displayName} src={me.portraitUrl} tint={me.portraitTint} size="md" />
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-text-primary">{me.displayName}</p>
              <p className="truncate text-caption text-text-secondary">@{me.handle}</p>
            </div>
          </div>
          <nav aria-label="Account" className="flex flex-col">
            {[
              { href: `/profile/${me.handle}`, label: 'My profile' },
              { href: '/settings', label: 'Settings' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-md px-2 text-body text-text-primary no-underline hover:bg-surface-sunken hover:no-underline"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-border pt-3">
            <Devices plain />
          </div>
        </div>
      )}
    </div>
  );
}
