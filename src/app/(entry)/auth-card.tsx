'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import { LEGAL_FACTS } from '@/shared/legal';
import { Img } from '@/ui/art/img';
import { Card } from '@/ui/primitives';
import { ClaimForm } from './signup/claim-form';
import { LoginForm } from './login/login-form';

export type AuthMode = 'login' | 'signup';

/** Plain words for the essential actions: the page title, and the footer that offers the other form. */
const MODES: Record<AuthMode, { title: string; prompt: string; other: AuthMode; otherLabel: string }> = {
  login: {
    title: 'Log in',
    prompt: 'New to Howdy?',
    other: 'signup',
    otherLabel: 'Create account',
  },
  signup: {
    title: 'Create account',
    prompt: 'Already have an account?',
    other: 'login',
    otherLabel: 'Log in',
  },
};

/** Help is a plain email for now: there is no help centre yet. */
const FOOTER_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: `mailto:${LEGAL_FACTS.contactEmail}?subject=Help%20with%20Howdy`, label: 'Help' },
];

/**
 * One card for logging in and creating an account. The footer link swaps the form in place instead of navigating, and
 * the address follows along, so a refresh or a shared link opens the same form. It is a real link, so it still works
 * (as a page load) when opened in a new tab. Both addresses (/login and /signup) render this card.
 */
export function AuthCard({
  initial,
  invite,
}: {
  initial: AuthMode;
  /** Arrived through someone's invite link (ADR-045): sign-up sends the code along. */
  invite?: { code: string; invitedBy: string };
}) {
  const [active, setActive] = useState<AuthMode>(initial);
  const mode = MODES[active];

  function swap(e: MouseEvent<HTMLAnchorElement>) {
    // Modified clicks (new tab, new window) keep the browser's own behaviour.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setActive(mode.other);
    window.history.replaceState(null, '', `/${mode.other}`);
  }

  // The tab title follows the form, like the address does (same text as each page's own metadata title).
  useEffect(() => {
    document.title = `${mode.title} · Howdy`;
  }, [mode.title]);

  return (
    <>
      <Card className="flex flex-col gap-5 p-5 shadow-clay sm:p-7">
        {/* The brand mark leads the card (these pages have no top bar). min-h-11 keeps the link tappable. */}
        <Link
          href="/gate"
          className="inline-flex min-h-11 items-center self-center no-underline hover:no-underline"
        >
          <Img
            src="/brand/howdy-wordmark.png"
            width={766}
            height={243}
            alt="Howdy"
            loading="eager"
            className="h-auto w-28 sm:w-32"
          />
        </Link>
        {active === 'login' ? <LoginForm /> : <ClaimForm {...(invite ? { invite } : {})} />}
        <p className="border-t border-border pt-4 text-center text-caption text-text-secondary">
          {mode.prompt}{' '}
          <a
            href={`/${mode.other}`}
            onClick={swap}
            className="inline-flex min-h-11 items-center font-semibold text-auth-link no-underline hover:underline"
          >
            {mode.otherLabel}
          </a>
        </p>
      </Card>
      {/* These pages have no site footer, so the essentials sit right under the card. */}
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
    </>
  );
}
