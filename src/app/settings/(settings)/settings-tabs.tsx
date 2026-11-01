'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/ui/cn';

export const SETTINGS_SECTIONS = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/privacy', label: 'Privacy' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/people', label: 'People' },
  { href: '/settings/account', label: 'Account' },
] as const;

/**
 * The sections of Settings, each its own short page: a row of links styled as tabs (they are navigation, so a nav with
 * aria-current, not an ARIA tablist). On a phone the row scrolls sideways; the current one is marked in sunflower.
 */
export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {SETTINGS_SECTIONS.map((s) => {
          const current = path === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-caption font-semibold no-underline hover:no-underline',
                  current
                    ? 'border-highlight text-text-primary'
                    : 'border-transparent text-text-secondary hover:border-border-strong hover:text-text-primary',
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
