import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { Art } from '../art/glyph';
import { BellIcon } from '../icons';
import { cn } from '../cn';
import { HowdyLogo } from '../logo';
import { Avatar } from '../primitives/avatar';
import { BirdVisitor } from './bird-visitor';
import { ShellBottomNav, ShellMoreMenu, ShellSidebarNav, type ShellNavItem } from './nav';
import { SiteFooter } from './site-footer';

// The signed-out top bar's two ways in: equal widths, never wrapping, sized to fit beside the logo on a 320 px phone.
// Width comes from the text (both grid columns match the wider pill), so nothing is squeezed on a 320 px phone.
const AUTH_PILL =
  'flex w-full min-h-12 flex-col items-center justify-center rounded-md px-2 py-1 leading-tight whitespace-nowrap ' +
  'no-underline select-none transition-colors duration-150 ease-out active:shadow-clay-pressed ' +
  'hover:no-underline sm:min-w-36';
// The main label drops one size step on the narrowest phones (under 360 px) so both pills fit beside the logo.
const AUTH_PILL_LABEL = 'text-metadata font-semibold min-[360px]:text-caption';
const AUTH_PILL_SECONDARY =
  'border border-border bg-surface text-text-primary shadow-clay-sm hover:bg-surface-sunken';
const AUTH_PILL_PRIMARY = 'bg-accent-strong text-on-accent shadow-clay-sm hover:bg-accent-hover';

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
  townHallInvites = 0,
  moderator = false,
  admin = false,
  waysIn = true,
  bare = false,
  children,
}: {
  me?: ShellMe | undefined;
  unread?: number;
  unreadWhispers?: number;
  townHallInvites?: number;
  /** Adds the sidebar-only Moderation link. Only a hint: the page and API check the role themselves. */
  moderator?: boolean;
  /** Adds the Security Center (Control Room) link after Moderation. Also only a hint: /admin checks for itself. */
  admin?: boolean;
  /** Signed out: offer Step Inside / Stake a Claim in the top bar. Off on the sign-in pages: just the logo, centred. */
  waysIn?: boolean;
  /** Signed out only: no top bar and no site footer (the page carries its own logo and links). Ignored signed in. */
  bare?: boolean;
  children: ReactNode;
}) {
  const logoOnly = !me && !waysIn;
  const items: ShellNavItem[] = me
    ? [
        { key: 'home', href: '/home', label: 'Home' },
        { key: 'ranch', href: `/profile/${me.handle}`, label: 'My profile' },
        { key: 'posse', href: '/friends', label: 'Friends' },
        { key: 'tracks', href: '/visitors', label: 'Visitors' },
        { key: 'whispers', href: '/messages', label: 'Messages', badge: unreadWhispers },
        { key: 'chimes', href: '/notifications', label: 'Notifications', badge: unread },
        // Sidebar-only on wide screens; on a phone these are in the top bar's "More" menu (ShellMoreMenu).
        { key: 'workshop', href: '/settings', label: 'Settings' },
        { key: 'town-halls', href: '/groups', label: 'Groups', badge: townHallInvites },
        { key: 'capsules', href: '/capsules', label: 'Time Capsules' },
        ...(moderator ? [{ key: 'moderation', href: '/moderation', label: 'Moderation' } as const] : []),
        ...(admin ? [{ key: 'security', href: '/admin/security', label: 'Security Center' } as const] : []),
      ]
    : [];

  return (
    <div className="daylight-only min-h-dvh">
      {/* Bare pages (signed out) leave the bar out altogether; their card carries the logo. */}
      {(me || !bare) && (
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
          <div
            className={cn(
              'mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 min-[360px]:gap-4 md:px-6',
              logoOnly ? 'justify-center' : 'justify-between',
            )}
          >
            <HowdyLogo size={me || logoOnly ? 'xs' : 'bar'} href={me ? '/home' : '/gate'} />
            {logoOnly ? null : me ? (
              <div className="flex items-center gap-3">
                {/* Decorative: a little bird that hops beside the bell, and now and then flies off to visit a card
                  (BirdVisitor); its spot stays empty until it is back. */}
                <span
                  aria-hidden="true"
                  data-howdy-bird
                  className="pointer-events-none transition-opacity duration-500 select-none [:root[data-bird-away]_&]:opacity-0 [:root[data-bird-away]_&]:duration-0"
                >
                  <Art name="bird" size="free" className="w-9 origin-bottom animate-bird-hop" />
                </span>
                <Link
                  href="/notifications"
                  aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                  className="relative grid size-11 place-items-center rounded-pill border border-border bg-surface text-heading text-text-primary no-underline shadow-clay-sm"
                >
                  <BellIcon className="size-5" />
                  {unread > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-pill bg-accent-strong px-1 text-metadata font-semibold text-on-accent"
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </Link>
                {/* A real 44 px box (an inline link around an image is shorter than its picture, and too small to tap).
                  Phones have your picture in the tab bar instead, so it shows here from md up only. */}
                <Link
                  href={`/profile/${me.handle}`}
                  aria-label="Your profile"
                  className="hidden size-11 rounded-pill md:inline-flex"
                >
                  <Avatar name={me.displayName} src={me.portraitUrl} tint={me.portraitTint} size="md" />
                </Link>
                <ShellMoreMenu items={items} />
              </div>
            ) : (
              // Two equal pills: the Howdy name, and underneath what it plainly means.
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className={cn(AUTH_PILL, AUTH_PILL_SECONDARY)}>
                  <span className={AUTH_PILL_LABEL}>Log in</span>
                  <span className="text-metadata text-text-secondary">Sign in</span>
                </Link>
                <Link href="/signup" className={cn(AUTH_PILL, AUTH_PILL_PRIMARY)}>
                  <span className={AUTH_PILL_LABEL}>Sign up</span>
                  <span className="text-metadata">Create account</span>
                </Link>
              </div>
            )}
          </div>
        </header>
      )}

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 md:px-6">
        {me && (
          <aside className="sticky top-16 hidden max-h-[calc(100dvh-4rem)] w-56 shrink-0 flex-col justify-between gap-6 self-start py-6 md:flex">
            <ShellSidebarNav items={items} />
            <div aria-hidden="true" className="flex flex-col gap-3 px-2">
              <p className="font-display text-body text-text-secondary italic">
                “Good people make life better”
              </p>
            </div>
          </aside>
        )}
        {/* Room for the phone tab bar and its raised Nail button (and the safe-area inset under it); signed in only. */}
        <div className={cn('min-w-0 flex-1', me && 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8')}>
          {children}
          {(me || !bare) && <SiteFooter />}
        </div>
      </div>
      {me && <ShellBottomNav items={items} me={me} />}
      {me && <BirdVisitor />}
    </div>
  );
}
