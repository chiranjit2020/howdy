'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import { BellIcon, FenceIcon, HomeIcon, ToolsIcon, TracksIcon, UsersIcon, WhisperIcon } from '../icons';
import { BottomNavigation, type NavItem } from '../primitives/navigation';

export type ShellNavKey = 'home' | 'ranch' | 'posse' | 'tracks' | 'whispers' | 'chimes' | 'workshop';

export interface ShellNavItem {
  key: ShellNavKey;
  href: string;
  label: string;
  /** Unread count (already filtered for this person); shown as a pill and announced as text. */
  badge?: number;
  /** Left out of the phone tab bar (there is only room for six), still in the sidebar. */
  sidebarOnly?: boolean;
}

const ICON: Record<ShellNavKey, ReactNode> = {
  home: <HomeIcon />,
  ranch: <FenceIcon />,
  posse: <UsersIcon />,
  tracks: <TracksIcon />,
  whispers: <WhisperIcon />,
  chimes: <BellIcon />,
  workshop: <ToolsIcon />,
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

/** The phone form of the same navigation: a fixed tab bar (hidden from `md` up by the primitive itself). */
export function ShellBottomNav({ items }: { items: ShellNavItem[] }) {
  const pathname = usePathname();
  const tabs: NavItem[] = items
    .filter((it) => !it.sidebarOnly)
    .map((it) => ({
      href: it.href,
      label: it.label,
      icon: ICON[it.key],
      current: isCurrent(pathname, it.href),
      ...(it.badge ? { badge: `${badgeText(it.badge)} unread` } : {}),
    }));
  return <BottomNavigation items={tabs} label="Primary" />;
}
