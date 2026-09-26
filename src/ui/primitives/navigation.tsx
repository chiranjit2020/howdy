import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  current?: boolean;
  /** Small dot for unread activity (announced as text, not colour alone). */
  badge?: string;
}

/** Side/top navigation. `current` maps to aria-current="page". */
export function Navigation({
  items,
  label,
  className,
}: {
  items: NavItem[];
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
                  ? 'bg-accent text-on-accent shadow-clay-sm'
                  : 'text-text-primary hover:bg-surface-sunken',
              )}
            >
              <span aria-hidden="true" className="text-title">
                {it.icon}
              </span>
              {it.label}
              {it.badge && (
                <span className="ml-auto rounded-pill bg-danger px-2 text-metadata text-on-danger">
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
 * Mobile tab bar: a dock floating just above the bottom edge (and the safe-area inset); hidden from md up (use
 * <Navigation> there). One coral pill glides to the current tab, whose icon gives a small hop as it arrives; a pressed
 * icon squishes. Tabs with unread activity carry a dot. Reduced motion turns all of it into plain state changes.
 */
export function BottomNavigation({ items, label }: { items: NavItem[]; label: string }) {
  const index = items.findIndex((it) => it.current);
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-[1.75rem] border border-border/70 bg-surface/90 shadow-float backdrop-blur-md md:hidden"
    >
      <ul className="relative flex">
        {/* The gliding pill: one element that slides between tabs, rather than one per tab switching on and off. */}
        <li
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 flex justify-center pt-2 transition-[translate,opacity] duration-500 ease-spring',
            index < 0 && 'opacity-0',
          )}
          style={{ width: `${100 / items.length}%`, translate: `${Math.max(index, 0) * 100}% 0` }}
        >
          <span className="h-8 w-12 rounded-pill bg-accent shadow-clay-sm" />
        </li>
        {items.map((it) => (
          // min-w-0: six tabs share a 320 px screen.
          <li key={it.href} className="relative min-w-0 flex-1">
            <Link
              href={it.href}
              aria-current={it.current ? 'page' : undefined}
              className={cn(
                'group flex min-h-16 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.6875rem] leading-tight no-underline transition-colors',
                it.current ? 'font-bold text-text-primary' : 'font-semibold text-text-secondary',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative flex h-8 w-12 items-center justify-center text-title transition-transform duration-150 group-active:scale-85',
                  it.current && 'animate-nav-pop text-on-accent',
                )}
              >
                {it.icon}
                {it.badge && (
                  <span className="absolute top-1 right-3 size-2 animate-yo-pop rounded-full bg-danger ring-2 ring-surface" />
                )}
              </span>
              {/* Tight tracking, no side padding: "Whispers" then just fits a sixth of a 320 px dock. */}
              <span className="max-w-full truncate tracking-tight">{it.label}</span>
              {it.badge && <span className="sr-only"> ({it.badge})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
