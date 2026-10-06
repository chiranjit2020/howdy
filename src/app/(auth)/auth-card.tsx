'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/ui/cn';
import { ClayCard } from '@/ui/primitives';
import { ClaimForm } from './stake-a-claim/claim-form';
import { LoginForm } from './step-inside/login-form';

export type AuthMode = 'step-inside' | 'stake-a-claim';

/** The Howdy name leads; the plain words underneath say what it means, so nobody has to guess. */
const TABS: { id: AuthMode; label: string; plain: string }[] = [
  { id: 'step-inside', label: 'Step Inside', plain: 'Sign in' },
  { id: 'stake-a-claim', label: 'Stake a Claim', plain: 'Create account' },
];

/**
 * One card for signing in and creating an account. The tabs switch forms in place (with a short slide) instead of
 * navigating, and the address follows along, so a refresh or a shared link opens the same form. Both addresses
 * (/step-inside and /stake-a-claim) render this card, starting on their own tab.
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
  // No slide on first paint: only a switch the person made animates.
  const [slide, setSlide] = useState<'from-left' | 'from-right' | undefined>();
  const refs = useRef<Partial<Record<AuthMode, HTMLButtonElement | null>>>({});

  function select(next: AuthMode) {
    if (next === active) return;
    const from = TABS.findIndex((t) => t.id === active);
    const to = TABS.findIndex((t) => t.id === next);
    setSlide(to > from ? 'from-right' : 'from-left');
    setActive(next);
    window.history.replaceState(null, '', `/${next}`);
  }

  // The tab title follows the form, like the address does (same text as each page's own metadata title).
  useEffect(() => {
    const tab = TABS.find((t) => t.id === active);
    if (tab) document.title = `${tab.label} · Howdy`;
  }, [active]);

  // WAI-ARIA tabs with automatic activation: Left/Right/Home/End move and select; only the active tab is focusable.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === active);
    let n: number | undefined;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    const target = n === undefined ? undefined : TABS[n];
    if (!target) return;
    e.preventDefault();
    select(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <ClayCard className="flex flex-col gap-4 p-4 min-[360px]:p-5 sm:p-6">
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-1 rounded-pill bg-surface-sunken p-1"
      >
        {TABS.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`auth-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="auth-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center rounded-pill px-2 py-1 transition-colors min-[360px]:px-3',
                selected
                  ? 'bg-surface text-text-primary shadow-clay-sm'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <span className="text-caption font-semibold whitespace-nowrap">{t.label}</span>
              <span className="text-metadata whitespace-nowrap text-text-secondary">{t.plain}</span>
            </button>
          );
        })}
      </div>
      <div
        key={active}
        id="auth-panel"
        role="tabpanel"
        aria-labelledby={`auth-tab-${active}`}
        className={cn(
          slide === 'from-right' && 'animate-slide-from-right',
          slide === 'from-left' && 'animate-slide-from-left',
        )}
      >
        {active === 'step-inside' ? <LoginForm /> : <ClaimForm {...(invite ? { invite } : {})} />}
      </div>
    </ClayCard>
  );
}
