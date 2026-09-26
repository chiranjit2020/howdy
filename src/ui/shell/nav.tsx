'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import {
  BellIcon,
  FenceIcon,
  HomeIcon,
  PencilIcon,
  ToolsIcon,
  TownHallIcon,
  TracksIcon,
  UsersIcon,
  WhisperIcon,
} from '../icons';
import { Avatar } from '../primitives/avatar';
import { BottomNavigation, type NavItem } from '../primitives/navigation';
import type { ShellMe } from './app-shell';

export type ShellNavKey =
  'home' | 'ranch' | 'posse' | 'tracks' | 'whispers' | 'chimes' | 'workshop' | 'town-halls';

export interface ShellNavItem {
  key: ShellNavKey;
  href: string;
  label: string;
  /** Unread count (already filtered for this person); shown as a pill and announced as text. */
  badge?: number;
}

const ICON: Record<ShellNavKey, ReactNode> = {
  home: <HomeIcon />,
  ranch: <FenceIcon />,
  posse: <UsersIcon />,
  tracks: <TracksIcon />,
  whispers: <WhisperIcon />,
  chimes: <BellIcon />,
  workshop: <ToolsIcon />,
  'town-halls': <TownHallIcon />,
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
                  'flex min-h-12 items-center gap-3 rounded-pill px-4 text-body font-medium no-underline transition-colors',
                  current
                    ? 'bg-success/60 font-semibold text-text-primary shadow-clay-sm'
                    : 'text-text-primary hover:bg-surface-sunken',
                )}
              >
                <span aria-hidden="true" className="text-heading text-text-secondary">
                  {ICON[it.key]}
                </span>
                {it.label}
                {it.badge ? (
                  <>
                    <span className="sr-only">, </span>
                    <span className="ml-auto rounded-pill bg-accent px-2 text-metadata font-semibold text-on-accent">
                      {badgeText(it.badge)}
                      <span className="sr-only"> unread</span>
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
 * The phone tabs, in order: two each side of the raised "Nail" button, your own picture last. Chimes is left out (the
 * bell in the top bar already has it, with its count) and so is Tracks (it has a card on your own Porch); the sidebar
 * still lists everything.
 */
const PHONE_TABS: ShellNavKey[] = ['home', 'posse', 'whispers', 'ranch'];

/** The phone form of the same navigation: a fixed tab bar (hidden from `md` up by the primitive itself). */
export function ShellBottomNav({ items, me }: { items: ShellNavItem[]; me: ShellMe }) {
  const pathname = usePathname();
  const byKey = new Map(items.map((it) => [it.key, it]));
  const tabs: NavItem[] = PHONE_TABS.flatMap((key) => {
    const it = byKey.get(key);
    if (!it) return [];
    const current = isCurrent(pathname, it.href);
    return [
      {
        href: it.href,
        // Your own picture stands for your Porch, like a profile tab; "My Porch" would not fit a fifth of 320 px.
        label: key === 'ranch' ? 'Porch' : it.label,
        icon:
          key === 'ranch' ? (
            <Avatar
              name={me.displayName}
              src={me.portraitUrl ?? undefined}
              tint={me.portraitTint}
              size="sm"
              className={cn(
                'rounded-full',
                current && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
              )}
            />
          ) : (
            ICON[key]
          ),
        current,
        ...(it.badge ? { badge: `${badgeText(it.badge)} unread` } : {}),
      },
    ];
  });
  return (
    <BottomNavigation
      items={tabs}
      label="Primary"
      action={{
        href: `/porch/${me.handle}?nail=1`,
        label: 'Nail',
        description: 'Nail a card to your Fence',
        icon: <PencilIcon />,
      }}
    />
  );
}
