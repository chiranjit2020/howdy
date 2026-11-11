import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL_FACTS } from '@/shared/legal';
import { Img } from '../art/img';
import { cn } from '../cn';
import { HowdyLogo } from '../logo';

/**
 * The frame every signed-out page shares (Welcome, Log in, Sign up, confirm email, forgot / new password): no top bar,
 * one centred card that leads with the wordmark, and the essential links under it.
 */

/** Help is a plain email for now: there is no help centre yet. */
const FOOTER_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: `mailto:${LEGAL_FACTS.contactEmail}?subject=Help%20with%20Howdy`, label: 'Help' },
];

/** The brand mark that leads every entry card. min-h-11 keeps the link tappable. */
export function EntryLogo() {
  return (
    <Link
      href="/gate"
      className="inline-flex min-h-11 items-center self-center no-underline hover:no-underline"
    >
      <Img
        src="/brand/howdy-wordmark.webp"
        width={728}
        height={224}
        alt="Howdy"
        loading="eager"
        className="h-auto w-28 sm:w-32"
      />
    </Link>
  );
}

/** Entry pages have no site footer, so the essentials sit right under the card. */
export function EntryFooter() {
  return (
    <nav aria-label="Legal" className="mt-2">
      <ul className="flex items-center justify-center gap-5 text-metadata">
        {FOOTER_LINKS.map(({ href, label }) => (
          <li key={label}>
            <a
              href={href}
              className="inline-flex min-h-11 items-center text-text-secondary no-underline hover:text-text-primary hover:underline"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The blue strip that tops every sign-in card: a small copy of the app's top bar, so signing in already looks like the
 * app you are about to enter.
 */
export function EntryBand({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-20 items-center justify-center bg-header', className)}>
      <HowdyLogo tone="onColour" size="band" priority />
    </div>
  );
}

/**
 * Centred on the screen. Bare pages have no shell gutter, so it is here: 8 px on phones, 16 px from sm up (the same as
 * the app), never doubled, so the card still fits a 320px phone.
 */
export function EntryMain({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      // 28rem of card plus the gutter either side (the box includes its padding).
      className="mx-auto flex min-h-dvh w-full max-w-[29rem] flex-col justify-center px-2 py-4 sm:max-w-[30rem] sm:px-4"
    >
      {children}
    </main>
  );
}

/**
 * The sign-in card (2026-11-08): the blue band with the white logo on top, the page's own content under it. Every
 * signed-out page uses it, so the whole flow (Log in, Create account, Google's last step, forgot password, confirm
 * email) looks the same. `bandClassName`: Log in / Create account hide the band from lg, where the split screen's blue
 * half carries the logo. Card's look without Card: its p-4 would win over p-0 (cn does not merge classes).
 */
export function EntryPanel({ children, bandClassName }: { children: ReactNode; bandClassName?: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-card-edge bg-surface shadow-clay">
      <EntryBand {...(bandClassName ? { className: bandClassName } : {})} />
      <div className="flex flex-col gap-5 p-5 sm:p-7">{children}</div>
    </div>
  );
}

/** Band, the page's own content, then the footer links: the whole frame for a simple entry page. */
export function EntryCard({ children }: { children: ReactNode }) {
  return (
    <EntryMain>
      <EntryPanel>{children}</EntryPanel>
      <EntryFooter />
    </EntryMain>
  );
}

/** The heading block of an entry card: compact title and one plain line under it. */
export function EntryHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-center">
      <h1 className="text-body font-semibold text-text-primary">{title}</h1>
      {children && <p className="text-caption font-normal text-text-secondary">{children}</p>}
    </div>
  );
}
