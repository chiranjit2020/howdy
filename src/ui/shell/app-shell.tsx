import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { BellIcon, SearchIcon } from '../icons';
import { cn } from '../cn';
import { HowdyLogo } from '../logo';
import { buttonClasses } from '../primitives/button';
import { AccountMenu } from './account-menu';
import { FreeToTalkPill, type FreeToTalkState } from './free-to-talk-menu';
import { PeopleSearch } from './people-search';
import { ShellBottomNav, ShellSidebarNav, type ShellNavItem } from './nav';
import { FooterGate } from './footer-gate';
import { SiteFooter } from './site-footer';
import { Streamed } from './streamed';

// The signed-out top bar's two ways in: ordinary buttons of equal width (the wider word sets both), one word each.
const AUTH_BUTTON = 'w-full whitespace-nowrap hover:no-underline sm:min-w-24';

export interface ShellMe {
  handle: string;
  displayName: string;
  portraitTint?: PortraitTint | undefined;
  /** Your photo's address, when you have one (the coloured initials show otherwise). */
  portraitUrl?: string | null | undefined;
}

/** Everything in the frame that is counted per person, and so can arrive after the frame itself. */
export interface ShellCounts {
  unread: number;
  unreadWhispers: number;
  friendRequests: number;
  newVisits: number;
  townHallInvites: number;
  freeToTalk?: FreeToTalkState | undefined;
  admin: boolean;
}

/** What the frame shows while the counts are on their way: no badges, Free to talk off. */
export const NO_COUNTS: ShellCounts = {
  unread: 0,
  unreadWhispers: 0,
  friendRequests: 0,
  newVisits: 0,
  townHallInvites: 0,
  freeToTalk: { lit: [], mine: null },
  admin: false,
};

/**
 * The frame around every signed-in page: a top bar (logo, the notifications bell, your avatar), a left sidebar with the navigation,
 * and the page in the middle. Below `md` the sidebar becomes a bottom tab bar. Signed out (a Ranch can be opened without an
 * account) there is only the top bar, with a way in. The counts are already filtered for this person by the caller.
 *
 * `live`: the counts as a promise (AppFrame, 2026-11-12). The frame and the page are then sent straight away and the
 * badges stream in a moment later, instead of every page waiting on a dozen counts before its first byte.
 */
export function AppShell({
  me,
  unread = 0,
  unreadWhispers = 0,
  friendRequests = 0,
  newVisits = 0,
  townHallInvites = 0,
  freeToTalk,
  moderator = false,
  admin = false,
  live,
  waysIn = true,
  bare = false,
  children,
}: {
  live?: Promise<ShellCounts> | undefined;
  me?: ShellMe | undefined;
  /** My light and my friends who are free right now: the "Free to talk" pill (wide) or More menu item (phones). */
  freeToTalk?: FreeToTalkState | undefined;
  /** Unread notifications: on the bell in the top bar (they have no menu item of their own). */
  unread?: number;
  unreadWhispers?: number;
  /** Friend requests waiting for an answer. */
  friendRequests?: number;
  /** Visits to your profile this week that you have not looked at yet (they clear when you open Visitors). */
  newVisits?: number;
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
  const counts: ShellCounts | Promise<ShellCounts> = live ?? {
    unread,
    unreadWhispers,
    friendRequests,
    newVisits,
    townHallInvites,
    freeToTalk,
    admin,
  };
  const navItems = ({
    friendRequests,
    newVisits,
    unreadWhispers,
    townHallInvites,
    admin,
  }: ShellCounts): ShellNavItem[] =>
    me
      ? [
          { key: 'home', href: '/home', label: 'Home' },
          { key: 'ranch', href: `/profile/${me.handle}`, label: 'My profile' },
          { key: 'posse', href: '/friends', label: 'Friends', badge: friendRequests, badgeSays: 'waiting' },
          { key: 'tracks', href: '/visitors', label: 'Visitors', badge: newVisits, badgeSays: 'new' },
          { key: 'whispers', href: '/messages', label: 'Messages', badge: unreadWhispers },
          // Notifications have the bell in the top bar, with their count, so no menu item of their own.
          // Sidebar-only on wide screens; on a phone these are in the tab bar's You sheet.
          { key: 'town-halls', href: '/groups', label: 'Groups', badge: townHallInvites },
          ...(moderator ? [{ key: 'moderation', href: '/moderation', label: 'Moderation' } as const] : []),
          ...(admin ? [{ key: 'security', href: '/admin/security', label: 'Security Center' } as const] : []),
          // Always last.
          { key: 'workshop', href: '/settings', label: 'Settings' },
        ]
      : [];

  return (
    <div className="daylight-only min-h-dvh">
      {/* Bare pages (signed out) leave the bar out altogether; their card carries the logo. */}
      {(me || !bare) && (
        <header className="sticky top-0 z-30 bg-header">
          <div
            className={cn(
              // The blue bar runs edge to edge; its contents line up with the 1280 px page below.
              'mx-auto flex h-14 w-full max-w-shell items-center gap-2 px-4 min-[360px]:gap-3',
              logoOnly ? 'justify-center' : 'justify-between',
              // Signed in, from md up: three columns, the two sides equal, so the search box sits in the middle of the
              // screen rather than of the space the logo and the buttons leave.
              me && 'md:grid md:grid-cols-[1fr_minmax(0,28rem)_1fr]',
            )}
          >
            <HowdyLogo
              size="top"
              href={me ? '/home' : '/gate'}
              tone="onColour"
              className="justify-self-start"
            />
            {/* Search people: the box in the middle of the bar from md up; phones get a button to the Search page. */}
            {me && (
              <div className="hidden min-w-0 md:block">
                <PeopleSearch />
              </div>
            )}
            {logoOnly ? null : me ? (
              <div className="flex items-center gap-3 md:justify-self-end">
                <Link
                  href="/search"
                  aria-label="Search people"
                  className="grid size-11 place-items-center rounded-pill pointer-fine:size-9 border border-border bg-surface text-text-primary no-underline shadow-clay-sm md:hidden"
                >
                  <SearchIcon className="size-5" />
                </Link>
                <Streamed
                  value={counts}
                  initial={NO_COUNTS}
                  render={(c) => (c.freeToTalk ? <FreeToTalkPill state={c.freeToTalk} /> : null)}
                />
                <Streamed value={counts} initial={NO_COUNTS} render={(c) => <Bell unread={c.unread} />} />
                {/* Your account (profile, Settings, devices, sign out). Phones have your picture in the tab bar
                  instead, and devices in Settings, so this shows from md up only. */}
                <AccountMenu me={me} />
              </div>
            ) : (
              // One word each: the old second line ("Sign in", "Create account") only repeated the first.
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  className={cn(buttonClasses({ variant: 'secondary', size: 'sm' }), AUTH_BUTTON)}
                >
                  Log in
                </Link>
                <Link href="/signup" className={cn(buttonClasses({ size: 'sm' }), AUTH_BUTTON)}>
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </header>
      )}

      {/* At most 1280 px, centred; 8 px each side on phones (2026-11-08, more room for posts), 16 px from sm up.
          Bare pages run edge to edge (Log in's blue half reaches the screen edge) and keep their own gutter. */}
      <div className={cn('mx-auto flex w-full gap-6', me || !bare ? 'max-w-shell px-2 sm:px-4' : '')}>
        {me && (
          <aside className="sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-52 shrink-0 flex-col justify-between gap-6 self-start py-4 md:flex">
            <Streamed
              value={counts}
              initial={NO_COUNTS}
              render={(c) => <ShellSidebarNav items={navItems(c)} />}
            />
          </aside>
        )}
        {/* Room for the phone tab bar and its raised Nail button (and the safe-area inset under it); signed in only. */}
        <div className={cn('min-w-0 flex-1', me && 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8')}>
          {children}
          {(me || !bare) && (
            <FooterGate>
              <SiteFooter />
            </FooterGate>
          )}
        </div>
      </div>
      {me && (
        <Streamed
          value={counts}
          initial={NO_COUNTS}
          render={(c) => <ShellBottomNav items={navItems(c)} me={me} freeToTalk={c.freeToTalk} />}
        />
      )}
    </div>
  );
}

/** The top bar's bell, with the unread count on it. */
function Bell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative grid size-11 place-items-center rounded-pill pointer-fine:size-9 border border-border bg-surface text-heading text-text-primary no-underline shadow-clay-sm"
    >
      <BellIcon className="size-5" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-pill bg-highlight px-1 text-metadata font-bold text-on-highlight ring-2 ring-surface"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
