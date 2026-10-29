import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL_FACTS } from '@/shared/legal';
import { Img } from '../art/img';
import { Card } from '../primitives';

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
        src="/brand/howdy-wordmark.png"
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
 * Centred on the screen. No side padding of its own: the shell's px-4 already gives the gutter, and doubling it
 * squeezes the card on a 320px phone.
 */
export function EntryMain({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center py-4">
      {children}
    </main>
  );
}

/** Logo, the page's own content, then the footer links: the whole frame for a simple entry page. */
export function EntryCard({ children }: { children: ReactNode }) {
  return (
    <EntryMain>
      <Card className="flex flex-col gap-5 p-5 shadow-clay sm:p-7">
        <EntryLogo />
        {children}
      </Card>
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
