import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { Art } from '../art/glyph';
import { HowdyLogo } from '../auth/auth-card';
import { BellIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { buttonClasses } from '../primitives/button';
import { ShellBottomNav, ShellSidebarNav, type ShellNavItem } from './nav';

export interface ShellMe {
  handle: string;
  displayName: string;
  portraitTint?: PortraitTint | undefined;
  /** Your photo's address, when you have one (the coloured initials show otherwise). */
  portraitUrl?: string | null | undefined;
}

/**
 * The frame around every signed-in page: a top bar (logo, notifications, your avatar), a left sidebar with the navigation,
 * and the page in the middle. Below `md` the sidebar becomes a bottom tab bar. Signed out (a Ranch can be opened without an
 * account) there is only the top bar, with a way in. The counts are already filtered for this person by the caller.
 */
export function AppShell({
  me,
  unread = 0,
  unreadWhispers = 0,
  children,
}: {
  me?: ShellMe | undefined;
  unread?: number;
  unreadWhispers?: number;
  children: ReactNode;
}) {
  const items: ShellNavItem[] = me
    ? [
        { key: 'home', href: '/home', label: 'Home' },
        { key: 'ranch', href: `/ranch/${me.handle}`, label: 'My Ranch' },
        { key: 'posse', href: '/posse', label: 'Posse' },
        { key: 'tracks', href: '/tracks', label: 'Tracks' },
        { key: 'whispers', href: '/whispers', label: 'Whispers', badge: unreadWhispers },
        { key: 'chimes', href: '/chimes', label: 'Chimes', badge: unread },
        // Phones reach the Workshop from "Tend the Ranch" on their own Ranch; the tab bar only has room for six.
        { key: 'workshop', href: '/workshop', label: 'Workshop', sidebarOnly: true },
      ]
    : [];

  return (
    <div className="daylight-only min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <HowdyLogo size="xs" href={me ? '/home' : '/gate'} />
          {me ? (
            <div className="flex items-center gap-3">
              {/* Decorative: a little bird that hops beside the bell. */}
              <span aria-hidden="true" className="pointer-events-none select-none">
                <Art name="bird" size="free" className="w-9 origin-bottom animate-bird-hop" />
              </span>
              <Link
                href="/chimes"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                className="relative grid size-11 place-items-center rounded-pill bg-surface text-heading text-text-primary no-underline shadow-clay-sm"
              >
                <BellIcon />
                {unread > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-pill bg-accent px-1 text-metadata font-semibold text-on-accent"
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              {/* A real 44 px box (an inline link around an image is shorter than its picture, and too small to tap). */}
              <Link
                href={`/ranch/${me.handle}`}
                aria-label="Your Ranch"
                className="inline-flex size-11 rounded-pill"
              >
                <Avatar name={me.displayName} src={me.portraitUrl} tint={me.portraitTint} size="md" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/step-inside" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                Step Inside
              </Link>
              <Link href="/stake-a-claim" className={buttonClasses({ variant: 'cta', size: 'sm' })}>
                Stake a Claim
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 md:px-6">
        {me && (
          <aside className="sticky top-16 hidden max-h-[calc(100dvh-4rem)] w-56 shrink-0 flex-col justify-between gap-6 self-start py-6 md:flex">
            <ShellSidebarNav items={items} />
            <div aria-hidden="true" className="flex flex-col gap-3 px-2">
              <Art name="cactus" size="free" className="w-24" />
              <p className="font-display text-body text-text-secondary italic">
                “Good people make life better”
              </p>
            </div>
          </aside>
        )}
        <div className="min-w-0 flex-1 pb-24 md:pb-8">{children}</div>
      </div>
      {me && <ShellBottomNav items={items} />}
    </div>
  );
}
