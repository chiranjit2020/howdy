'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Art, type ArtName } from '../art/glyph';
import { postJson } from '../auth/api';
import { cn } from '../cn';
import { MoreIcon } from '../icons';
import { Dropdown } from '../primitives/dropdown';
import { Avatar } from '../primitives/avatar';
import { BottomNavigation, type NavItem } from '../primitives/navigation';
import type { ShellMe } from './app-shell';

export type ShellNavKey =
  | 'home'
  | 'ranch'
  | 'posse'
  | 'tracks'
  | 'whispers'
  | 'chimes'
  | 'workshop'
  | 'town-halls'
  | 'capsules'
  | 'moderation';

export interface ShellNavItem {
  key: ShellNavKey;
  href: string;
  label: string;
  /** Unread count (already filtered for this person); shown as a pill and announced as text. */
  badge?: number;
}

const ART: Record<ShellNavKey, ArtName> = {
  home: 'nav-home',
  ranch: 'nav-porch',
  posse: 'nav-pals',
  tracks: 'nav-tracks',
  whispers: 'nav-whispers',
  chimes: 'nav-chimes',
  workshop: 'nav-wordshop',
  'town-halls': 'nav-town-halls',
  capsules: 'nav-capsules',
  moderation: 'nav-moderation',
};
// Loaded at once (not lazily): the navigation is on screen from the first paint.
const navArt = (name: ArtName) => <Art name={name} size="free" className="size-7" loading="eager" />;
const ICON = Object.fromEntries(Object.entries(ART).map(([key, name]) => [key, navArt(name)])) as Record<
  ShellNavKey,
  ReactNode
>;

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

/**
 * Phones only (hidden from `md` up, where the sidebar lists everything): a "More" menu in the top bar for every page
 * that is neither a tab nor the bell — Tracks, Workshop, Town Halls, Time Capsules, Moderation for staff. Without it
 * those pages had no way in on a phone. It ends with Sign out.
 */
export function ShellMoreMenu({ items }: { items: ShellNavItem[] }) {
  const router = useRouter();
  const more = items.filter((it) => !PHONE_TABS.includes(it.key) && it.key !== 'chimes');
  if (more.length === 0) return null;
  const waiting = more.reduce((n, it) => n + (it.badge ?? 0), 0);
  return (
    <div className="md:hidden">
      <Dropdown
        label="More"
        align="end"
        items={[
          ...more.map((it) => ({
            id: it.key,
            label: it.badge ? `${it.label} (${badgeText(it.badge)} new)` : it.label,
            onSelect: () => router.push(it.href),
          })),
          // Where people look for it on a phone. "Sign out everywhere" stays with Open Gates on Home (it asks first).
          {
            id: 'sign-out',
            label: 'Sign out',
            onSelect: async () => {
              await postJson('/api/auth/logout', {});
              router.push('/gate');
              router.refresh();
            },
          },
        ]}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={waiting > 0 ? `More pages, ${waiting} new` : 'More pages'}
            className="relative grid size-11 place-items-center rounded-pill bg-surface text-heading text-text-primary shadow-clay-sm"
          >
            <MoreIcon className="size-6" />
            {waiting > 0 && (
              <span aria-hidden="true" className="absolute -top-1 -right-1 size-3 rounded-pill bg-accent" />
            )}
          </button>
        )}
      />
    </div>
  );
}

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
        icon: navArt('nav-nail'),
      }}
    />
  );
}
