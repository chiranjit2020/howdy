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

/** Mobile tab bar. Fixed to the bottom, respects the safe-area inset; hidden from md up (use <Navigation> there). */
export function BottomNavigation({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-xl">
        {items.map((it) => (
          <li key={it.href} className="flex-1">
            <Link
              href={it.href}
              aria-current={it.current ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-metadata font-semibold no-underline',
                it.current ? 'text-text-primary' : 'text-text-secondary',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-8 w-14 items-center justify-center rounded-pill text-title',
                  it.current && 'bg-accent text-on-accent',
                )}
              >
                {it.icon}
              </span>
              {it.label}
              {it.badge && <span className="sr-only"> ({it.badge})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
