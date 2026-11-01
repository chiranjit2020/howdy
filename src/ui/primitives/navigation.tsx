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
 * A tab's icon, in a pill that turns sunflower on the current tab (the sidebar's mark). Lives inside the <Link> so it can
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
        'relative flex h-8 w-14 items-center justify-center rounded-pill text-title transition-[transform,background-color,color] duration-150 group-active:scale-90',
        current
          ? 'animate-nav-pop bg-primary text-on-primary'
          : 'text-text-secondary group-hover:text-text-primary',
        pending && 'animate-shimmer opacity-60',
      )}
    >
      {children}
      {count ? (
        // A notification count: the theme red, so it stands out from the sunflower of the current tab.
        <span className="absolute -top-1 right-1.5 grid h-4 min-w-4 animate-yo-pop place-items-center rounded-pill bg-danger px-1 text-[0.625rem] leading-none font-bold text-on-danger ring-2 ring-surface">
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
  const look = cn(TAB, it.current ? 'font-bold text-text-primary' : 'font-semibold text-text-secondary');
  const label = (
    <>
      <span className="max-w-full truncate tracking-tight">{it.label}</span>
      {it.badge && <span className="sr-only"> ({it.badge})</span>}
    </>
  );
  return (
    // min-w-0: five tabs share a 320 px screen.
    <li className="min-w-0 flex-1">
      {it.href ? (
        <Link href={it.href} aria-current={it.current ? 'page' : undefined} className={look}>
          <TabIcon current={Boolean(it.current)} count={it.count} dot={Boolean(it.badge)}>
            {it.icon}
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
            {it.icon}
          </TabMark>
          {label}
        </button>
      )}
    </li>
  );
}

/**
 * Mobile tab bar, hidden from md up (use <Navigation> there): a frosted ("acrylic") bar across the bottom edge, with a
 * hairline on top and content scrolling softly blurred behind it; it reaches down over the phone's home-bar area. Where
 * blur is not supported, or the person asks for less transparency, it is a plain solid bar. Full width, so five tabs
 * each get a fifth of the screen. Each tab is an icon in a pill (sunflower on the current tab, with a small hop) over a
 * short label; a pressed icon squishes. A tab is a link, or a button that opens a sheet. Reduced motion turns the
 * movement into plain state changes.
 */
export function BottomNavigation({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="acrylic fixed inset-x-0 bottom-0 z-40 border-t border-border/70 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch px-1">
        {items.map((it) => (
          <Tab key={it.href ?? it.label} it={it} />
        ))}
      </ul>
    </nav>
  );
}
