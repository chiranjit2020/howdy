'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface NavItem {
  /** Where the item goes. A phone tab can instead open something (`onSelect`, e.g. a sheet). */
  href?: string;
  onSelect?: () => void;
  /** For an item that opens a sheet: whether it is open now (aria-expanded). */
  expanded?: boolean;
  label: string;
  icon?: ReactNode;
  /** A phone tab: the filled icon it shows while current (the outline `icon` otherwise). */
  iconCurrent?: ReactNode;
  current?: boolean;
  /** Something new: what screen readers hear ("3 unread"). On a phone tab, `count` is the number shown. */
  badge?: string;
  count?: string;
}

/** Side/top navigation. `current` maps to aria-current="page". */
export function Navigation({
  items,
  label,
  className,
}: {
  items: (NavItem & { href: string })[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-col gap-1">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={it.current ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-pill px-4 text-body font-medium no-underline transition-colors',
                it.current
                  ? 'bg-primary text-on-primary shadow-clay-sm'
                  : 'text-text-primary hover:bg-surface-sunken',
              )}
            >
              <span aria-hidden="true" className="text-title">
                {it.icon}
              </span>
              {it.label}
              {it.badge && (
                <span className="ml-auto rounded-pill bg-highlight px-2 text-metadata font-bold text-on-highlight">
                  {it.badge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A tab's icon (filled on the current tab, chosen by the caller), with its count or dot. Lives inside the <Link> so it can
 * see that link's navigation: on a slow network, before the next page's outline has arrived, the tapped icon dims and
 * breathes so the tap never feels ignored (useLinkStatus; usually the outline is already prefetched and this never shows).
 */
function TabIcon({
  current,
  count,
  dot,
  children,
}: {
  current: boolean;
  count?: string;
  dot: boolean;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <TabMark current={current} count={count} dot={dot} pending={pending}>
      {children}
    </TabMark>
  );
}

function TabMark({
  current,
  count,
  dot,
  pending,
  children,
}: {
  current: boolean;
  count?: string | undefined;
  dot: boolean;
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Black icons on white (2026-11-08, the user's call): no pill; the current tab's icon is filled instead.
        'relative flex h-8 w-14 items-center justify-center text-nav-icon text-text-primary transition-transform duration-150 group-active:scale-90',
        current && 'animate-nav-pop',
        pending && 'animate-shimmer opacity-60',
      )}
    >
      {children}
      {count ? (
        // A notification count: the theme red, so it stands out from the sunflower of the current tab.
        <span className="absolute -top-1 right-1.5 grid h-4 min-w-4 animate-yo-pop place-items-center rounded-pill bg-danger px-1 text-tab leading-none font-bold text-on-danger ring-2 ring-surface">
          {count}
        </span>
      ) : (
        dot && (
          <span className="absolute top-0 right-2.5 size-2.5 animate-yo-pop rounded-full bg-danger ring-2 ring-surface" />
        )
      )}
    </span>
  );
}

const TAB =
  'group flex h-full w-full flex-col items-center justify-center gap-0.5 text-tab no-underline transition-colors';

function Tab({ it }: { it: NavItem }) {
  // Black labels: bold on the current tab, regular (400) on the rest.
  const look = cn(TAB, 'text-text-primary', it.current ? 'font-bold' : 'font-normal');
  const icon = it.current && it.iconCurrent ? it.iconCurrent : it.icon;
  const label = (
    <>
      <span className="max-w-full truncate tracking-tight">{it.label}</span>
      {it.badge && <span className="sr-only"> ({it.badge})</span>}
    </>
  );
  return (
    // min-w-0: the tabs share a 320 px screen.
    <li className="min-w-0 flex-1">
      {it.href ? (
        <Link href={it.href} aria-current={it.current ? 'page' : undefined} className={look}>
          <TabIcon current={Boolean(it.current)} count={it.count} dot={Boolean(it.badge)}>
            {icon}
          </TabIcon>
          {label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={it.onSelect}
          aria-haspopup="dialog"
          aria-expanded={it.expanded ?? false}
          className={look}
        >
          <TabMark current={Boolean(it.current)} count={it.count} dot={Boolean(it.badge)}>
            {icon}
          </TabMark>
          {label}
        </button>
      )}
    </li>
  );
}

/**
 * Mobile tab bar, hidden from md up (use <Navigation> there): a solid white bar (the surface colour; 2026-11-08, it was
 * frosted) across the bottom edge, with a hairline on top; it reaches down over the phone's home-bar area. Full width,
 * the tabs sharing it equally. Each tab is a black outline icon over a regular black label; the current tab shows its
 * filled icon (with a small hop) and a bold label. A pressed icon squishes. A tab is a link, or a button that opens a
 * sheet. Reduced motion turns the movement into plain state changes.
 */
export function BottomNavigation({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch px-1">
        {items.map((it) => (
          <Tab key={it.href ?? it.label} it={it} />
        ))}
      </ul>
    </nav>
  );
}
