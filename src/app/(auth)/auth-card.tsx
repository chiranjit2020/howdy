'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { Card } from '@/ui/primitives';
import { ClaimForm } from './stake-a-claim/claim-form';
import { LoginForm } from './step-inside/login-form';

export type AuthMode = 'step-inside' | 'stake-a-claim';

/** Plain words for the essential actions: the page title, and the footer that offers the other form. */
const MODES: Record<AuthMode, { title: string; prompt: string; other: AuthMode; otherLabel: string }> = {
  'step-inside': {
    title: 'Log in',
    prompt: 'New to Howdy?',
    other: 'stake-a-claim',
    otherLabel: 'Create account',
  },
  'stake-a-claim': {
    title: 'Create account',
    prompt: 'Already have an account?',
    other: 'step-inside',
    otherLabel: 'Log in',
  },
};

/**
 * One card for logging in and creating an account. The footer link swaps the form in place instead of navigating, and
 * the address follows along, so a refresh or a shared link opens the same form. It is a real link, so it still works
 * (as a page load) when opened in a new tab. Both addresses (/step-inside and /stake-a-claim) render this card.
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
    <Card className="flex flex-col gap-5 p-5 shadow-clay sm:p-7">
      {active === 'step-inside' ? <LoginForm /> : <ClaimForm {...(invite ? { invite } : {})} />}
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
  );
}
