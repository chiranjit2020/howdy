'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { cn } from '../cn';
import {
  BellIcon,
  GroupIcon,
  HomeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TabFriendsFillIcon,
  TabFriendsIcon,
  TabHomeFillIcon,
  TabHomeIcon,
  TabMessagesFillIcon,
  TabMessagesIcon,
  TracksIcon,
  UserIcon,
  UsersIcon,
  WhisperIcon,
} from '../icons';
import { Avatar } from '../primitives/avatar';
import { BottomNavigation, type NavItem } from '../primitives/navigation';
import type { ShellMe } from './app-shell';
import type { FreeToTalkState } from './free-to-talk-menu';
import { YouSheet } from './phone-sheets';

export type ShellNavKey =
  | 'home'
  | 'ranch'
  | 'posse'
  | 'tracks'
  | 'whispers'
  | 'chimes'
  | 'workshop'
  | 'town-halls'
  | 'moderation'
  | 'security';

export interface ShellNavItem {
  key: ShellNavKey;
  href: string;
  label: string;
  /** A count of something new (already filtered for this person); shown as a pill and announced as text. */
  badge?: number;
  /** What the count is, said after the number to screen readers: "3 unread", "1 waiting", "2 today". Default "unread". */
  badgeSays?: string;
}

/** Flat line icons, drawn in the text colour (they follow the current / hover state like the label does). */
const ICON: Record<ShellNavKey, ReactNode> = {
  home: <HomeIcon />,
  ranch: <UserIcon />,
  posse: <UsersIcon />,
  tracks: <TracksIcon />,
  whispers: <WhisperIcon />,
  chimes: <BellIcon />,
  workshop: <SettingsIcon />,
  'town-halls': <GroupIcon />,
  moderation: <ShieldIcon />,
  // No icon of its own yet: the Security Center shares Moderation's.
  security: <ShieldCheckIcon />,
};

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * The signed-in navigation is named "Primary" and comes in two forms that are never on screen together: this sidebar list
 * (the shell only shows it from `md` up) and `ShellBottomNav` below it. The current page is marked with aria-current.
 */
export function ShellSidebarNav({ items }: { items: ShellNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary">
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => {
          const current = isCurrent(pathname, it.href);
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2.5 rounded-pill px-3 text-caption font-medium no-underline transition-colors pointer-fine:min-h-9',
                  // The current page: the primary fill, with its icon in the other palette colour (the two together).
                  current
                    ? 'bg-primary font-semibold text-on-primary hover:no-underline'
                    : 'text-text-primary hover:bg-surface-sunken',
                )}
              >
                {/* 20 px (text-icon): at 16 px Phosphor Regular's lines are ~1 px and blur grey on ordinary laptop
                    screens; at 20 px they stay sharp (2026-11-10, the user's pick of the comparison). */}
                <span
                  aria-hidden="true"
                  className={cn('flex text-icon', current ? 'text-on-primary' : 'text-text-primary')}
                >
                  {ICON[it.key]}
                </span>
                {it.label}
                {it.badge ? (
                  <>
                    <span className="sr-only">, </span>
                    <span
                      className={cn(
                        'ml-auto rounded-pill px-2 text-metadata font-bold',
                        // On the yellow current item the count turns violet, so it never melts into it.
                        current ? 'bg-primary-mark text-primary' : 'bg-highlight text-on-highlight',
                      )}
                    >
                      {badgeText(it.badge)}
                      <span className="sr-only"> {it.badgeSays ?? 'unread'}</span>
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The phone tab bar, in order: Home, Friends, Messages, and your photo (Profile). Create is gone (2026-11-08: almost
 * nobody used it; posts and Stories start from Home's "What's on your mind?", Time Capsules from the Profile sheet).
 * Notifications are the bell in the top bar, with their count; everything else (Visitors, Groups, Settings, staff pages,
 * Free to talk, Time Capsules, Devices, Sign out) is in the Profile sheet. The sidebar still lists everything on wide screens.
 */
const PHONE_TABS = ['home', 'posse', 'whispers'] as const;
/** In the Profile sheet: every page that is neither a tab nor the bell, nor your own profile (the sheet's first row). */
const IN_TABS: ShellNavKey[] = [...PHONE_TABS, 'chimes', 'ranch'];
/** The phone tabs' own icons: outline, and filled while current (Phosphor; see icons.tsx). */
const TAB_ICON: Record<(typeof PHONE_TABS)[number], [ReactNode, ReactNode]> = {
  home: [<TabHomeIcon key="o" />, <TabHomeFillIcon key="f" />],
  posse: [<TabFriendsIcon key="o" />, <TabFriendsFillIcon key="f" />],
  whispers: [<TabMessagesIcon key="o" />, <TabMessagesFillIcon key="f" />],
};

/** The phone form of the navigation: a white tab bar along the bottom (hidden from `md` up by the primitive itself). */
export function ShellBottomNav({
  items,
  me,
  freeToTalk,
}: {
  items: ShellNavItem[];
  me: ShellMe;
  /** Phones reach Free to talk in the Profile sheet (wide screens have the pill in the top bar). */
  freeToTalk?: FreeToTalkState | undefined;
}) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<'you' | undefined>();
  const byKey = new Map(items.map((it) => [it.key, it]));
  const tab = (key: (typeof PHONE_TABS)[number]): NavItem[] => {
    const it = byKey.get(key);
    if (!it) return [];
    return [
      {
        href: it.href,
        label: it.label,
        icon: TAB_ICON[key][0],
        iconCurrent: TAB_ICON[key][1],
        current: isCurrent(pathname, it.href),
        ...(it.badge
          ? { badge: `${badgeText(it.badge)} ${it.badgeSays ?? 'unread'}`, count: badgeText(it.badge) }
          : {}),
      },
    ];
  };
  const rest = items.filter((it) => !IN_TABS.includes(it.key));
  // Something new behind your photo: a waiting count on a page in the sheet, or friends free to talk.
  const waiting = rest.reduce((n, it) => n + (it.badge ?? 0), 0) + (freeToTalk?.lit.length ?? 0);
  const onYourPages =
    isCurrent(pathname, `/profile/${me.handle}`) ||
    isCurrent(pathname, '/capsules') ||
    rest.some((it) => isCurrent(pathname, it.href));
  const tabs: NavItem[] = [
    ...tab('home'),
    ...tab('posse'),
    ...tab('whispers'),
    {
      label: 'Profile',
      // Your photo; on your own pages it gets a black ring (the photo cannot "fill" like the other icons).
      icon: (
        <span
          className={cn(
            'inline-flex rounded-full',
            onYourPages && 'ring-2 ring-text-primary ring-offset-2 ring-offset-surface',
          )}
        >
          <Avatar name={me.displayName} src={me.portraitUrl ?? undefined} tint={me.portraitTint} size="sm" />
        </span>
      ),
      onSelect: () => setSheet('you'),
      expanded: sheet === 'you',
      current: onYourPages,
      ...(waiting > 0 ? { badge: `${badgeText(waiting)} new` } : {}),
    },
  ];
  return (
    <>
      <BottomNavigation items={tabs} label="Primary" />
      <YouSheet
        open={sheet === 'you'}
        onClose={() => setSheet(undefined)}
        me={me}
        freeToTalk={freeToTalk}
        links={rest.map((it) => ({
          key: it.key,
          href: it.href,
          label: it.label,
          icon: ICON[it.key],
          badge: it.badge,
          badgeSays: it.badgeSays,
        }))}
      />
    </>
  );
}
