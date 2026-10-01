'use client';

import Link, { useLinkStatus } from 'next/link';
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

/** The raised button in the middle of the phone tab bar (the app's main action). */
export interface NavAction {
  href: string;
  /** Its short name (not shown: the icon fills the circle); screen readers hear it when there is no description. */
  label: string;
  /** What screen readers hear, when the short word needs more (e.g. "Nail a card to your Fence"). */
  description?: string;
  icon: ReactNode;
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
 * A tab's icon. Lives inside the <Link> so it can see that link's navigation: on a slow network, before the next page's
 * outline has arrived, the tapped icon dims and breathes so the tap never feels ignored (useLinkStatus; usually the
 * outline is already prefetched and this never shows).
 */
function TabIcon({ current, badge, children }: { current: boolean; badge: boolean; children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex size-8 items-center justify-center text-title transition-[transform,opacity,color] duration-150 group-active:scale-85',
        current ? 'animate-nav-pop text-text-primary' : 'text-text-muted group-hover:text-text-secondary',
        pending && 'animate-shimmer opacity-60',
      )}
    >
      {children}
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 size-2 animate-yo-pop rounded-full bg-danger ring-2 ring-surface" />
      )}
    </span>
  );
}

function Tab({ it }: { it: NavItem }) {
  return (
    // min-w-0: tabs share a 320 px screen.
    <li className="min-w-0 flex-1">
      <Link
        href={it.href}
        aria-current={it.current ? 'page' : undefined}
        className={cn(
          'group flex min-h-16 flex-col items-center justify-center gap-0.5 text-tab no-underline transition-colors',
          it.current ? 'font-bold text-text-primary' : 'font-semibold text-text-secondary',
        )}
      >
        <TabIcon current={Boolean(it.current)} badge={Boolean(it.badge)}>
          {it.icon}
        </TabIcon>
        <span className="max-w-full truncate tracking-tight">{it.label}</span>
        {/* The current tab's mark: a small coral dot that pops in under the label. */}
        <span
          aria-hidden="true"
          className={cn('size-1 rounded-full bg-accent', it.current ? 'animate-yo-pop' : 'invisible')}
        />
        {it.badge && <span className="sr-only"> ({it.badge})</span>}
      </Link>
    </li>
  );
}

/**
 * The raised circle in the notch: a glossy, softly embossed button filled by its icon. The label is not shown — the
 * picture says it — but it (or the longer description) is the link's name.
 */
function ActionButton({ action }: { action: NavAction }) {
  return (
    <Link
      href={action.href}
      aria-label={action.description ?? action.label}
      className="group nav-action-gloss absolute -top-8 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full no-underline transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-92"
    >
      <ActionIcon>{action.icon}</ActionIcon>
    </Link>
  );
}

function ActionIcon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-full items-center justify-center overflow-hidden rounded-full transition-transform duration-150 group-active:scale-95 [&_img]:size-full',
        pending && 'animate-shimmer',
      )}
    >
      {children}
    </span>
  );
}

/*
 * The curved cut-out the action circle sits in: flat at both ends (meeting the two halves of the bar), dipping into a
 * round bowl a little wider than the circle. Drawn in a 112 × 64 box, the same height as the bar.
 */
const NOTCH = 'M0 0C12 0 16 2 20 10C27 26 38 38 56 38C74 38 85 26 92 10C96 2 100 0 112 0V64H0Z';

/**
 * Mobile tab bar, hidden from md up (use <Navigation> there). Attached to the bottom edge with rounded top corners.
 * With an `action`, the tabs split into two halves around a curved notch holding a raised circle for the app's main
 * action. The current tab's icon gives a small hop and a coral dot pops in under its label; a pressed icon squishes.
 * Tabs with unread activity carry a dot. Reduced motion turns all of it into plain state changes.
 */
export function BottomNavigation({
  items,
  label,
  action,
}: {
  items: NavItem[];
  label: string;
  action?: NavAction;
}) {
  const half = Math.ceil(items.length / 2);
  const left = action ? items.slice(0, half) : items;
  const right = action ? items.slice(half) : [];
  return (
    <nav
      aria-label={label}
      // One soft shadow for the whole shape (drop-shadow follows the notch; a box-shadow would not).
      className="fixed inset-x-0 bottom-0 z-40 drop-shadow-[0_-4px_14px_rgb(43_45_66/0.10)] md:hidden"
    >
      <div className="flex">
        <ul className={cn('flex flex-1 rounded-tl-3xl bg-surface pl-2', !action && 'rounded-tr-3xl pr-2')}>
          {left.map((it) => (
            <Tab key={it.href} it={it} />
          ))}
        </ul>
        {action && (
          <>
            <div className="relative -mx-px w-28 shrink-0">
              <svg
                aria-hidden="true"
                viewBox="0 0 112 64"
                className="absolute inset-0 size-full fill-surface"
                preserveAspectRatio="none"
              >
                <path d={NOTCH} />
              </svg>
              <ActionButton action={action} />
            </div>
            <ul className="flex flex-1 rounded-tr-3xl bg-surface pr-2">
              {right.map((it) => (
                <Tab key={it.href} it={it} />
              ))}
            </ul>
          </>
        )}
      </div>
      {/* The phone's own home-bar area, in the bar's colour. */}
      <div className="h-[env(safe-area-inset-bottom)] bg-surface" />
    </nav>
  );
}
