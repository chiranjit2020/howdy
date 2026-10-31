'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiRequest, postJson } from '../auth/api';
import { Avatar } from '../primitives/avatar';
import { useDismiss } from '../primitives/use-dismiss';
import type { ShellMe } from './app-shell';

const ROW =
  'flex min-h-11 items-center rounded-md px-2 text-body text-text-primary no-underline hover:bg-surface-sunken hover:no-underline';

/**
 * Your avatar in the top bar (wide screens): opens a short panel with who you are, My profile, Settings, Devices (how
 * many, linking to Settings, where devices are managed) and Sign out. A disclosure, not a menu: Tab moves through it as
 * usual. Escape or a click outside closes it, and focus goes back to the avatar.
 */
export function AccountMenu({ me }: { me: ShellMe }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<number | undefined>();
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  useDismiss(open, [root], close);

  // How many devices: fetched each time the panel opens (it changes when you sign in elsewhere).
  useEffect(() => {
    if (!open) return;
    let gone = false;
    void apiRequest<{ sessions: unknown[] }>('GET', '/api/auth/sessions').then((res) => {
      if (!gone && res.ok && res.data) setDevices(res.data.sessions.length);
    });
    return () => {
      gone = true;
    };
  }, [open]);

  async function signOut() {
    setLeaving(true);
    await postJson('/api/auth/logout', {});
    router.push('/gate');
    router.refresh();
  }

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
          className="absolute top-full right-0 z-40 mt-2 flex w-72 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-float"
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
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={ROW}>
                {l.label}
              </Link>
            ))}
            <Link
              href="/settings#devices"
              onClick={() => setOpen(false)}
              className={`${ROW} justify-between`}
            >
              Devices
              {devices !== undefined && (
                <span className="text-caption text-text-secondary">
                  {devices}
                  <span className="sr-only"> signed in</span>
                </span>
              )}
            </Link>
          </nav>
          <div className="border-t border-border pt-2">
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={leaving}
              aria-busy={leaving || undefined}
              className={`${ROW} w-full text-left disabled:text-text-muted`}
            >
              {leaving ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
