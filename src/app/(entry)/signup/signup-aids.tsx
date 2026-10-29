'use client';

import { useEffect, useState } from 'react';
import { LIMITS } from '@/shared/limits';
import {
  PASSWORD_MIN,
  handleSchema,
  isCommonPassword,
  passwordMatchesIdentity,
} from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { cn } from '@/ui/cn';

/**
 * A username made from the email's first part ("Rick.Sen+howdy@…" → "rick_sen"), so most people never have to think
 * of one. Only a suggestion: it fills the box until the person types their own. Empty when nothing usable is left.
 */
export function suggestHandle(email: string): string {
  return handleFromText((email.split('@')[0] ?? '').split('+')[0] ?? '');
}

/** A username made from any words ("Rick Sen" → "rick_sen"): letters and digits kept, everything else one underscore. */
export function handleFromText(text: string): string {
  let h = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents off: "José" → "jose"
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, LIMITS.HANDLE_MAX);
  if (h && h.length < LIMITS.HANDLE_MIN) h = `${h}_howdy`.slice(0, LIMITS.HANDLE_MAX);
  return h;
}

export type HandleStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'invalid'; message: string };

/**
 * Checks the username as it is typed: the format at once (same rules as the server), and whether it is free after a
 * short pause, so a taken name is known before submitting. Only the latest answer counts.
 */
export function useHandleStatus(handle: string): HandleStatus {
  const parsed = handle.trim() ? handleSchema.safeParse(handle) : undefined;
  const wanted = parsed?.success ? parsed.data : undefined;
  // The server's answer, remembered with the (normalised) name it was for. `null`: the check itself failed.
  const [answer, setAnswer] = useState<{ for: string; available: boolean | null } | undefined>();

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await postJson<{ available: boolean }>('/api/auth/handle-available', { handle: wanted });
      if (live) setAnswer({ for: wanted, available: res.ok && res.data ? res.data.available : null });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wanted]);

  if (!parsed) return { state: 'idle' };
  if (!parsed.success) {
    return { state: 'invalid', message: parsed.error.issues[0]?.message ?? 'Check this username.' };
  }
  if (!answer || answer.for !== wanted) return { state: 'checking' };
  // If the check itself failed (offline, too many checks), say nothing: sign-up still checks for real.
  if (answer.available === null) return { state: 'idle' };
  return { state: answer.available ? 'available' : 'taken' };
}

/**
 * The password rules as three chips, ticked off live: grey before anything is typed, then a red ✕ or a green ✓ each.
 * The short words fit a phone; screen readers hear the full rule and whether it is met. Not announced on every key
 * press (it is the field's hint).
 */
export function PasswordChecklist({
  password,
  email,
  handle,
}: {
  password: string;
  email: string;
  handle: string;
}) {
  const typed = password.length > 0;
  const rules = [
    {
      ok: password.length >= PASSWORD_MIN,
      short: `${PASSWORD_MIN}+ chars`,
      full: `At least ${PASSWORD_MIN} characters`,
    },
    { ok: typed && !isCommonPassword(password), short: 'Not common', full: 'Not a common password' },
    {
      ok: typed && !passwordMatchesIdentity(password, email, handle),
      short: 'Not your name',
      full: 'Does not contain your email or username',
    },
  ];
  return (
    <ul className="grid grid-cols-3 gap-1.5 pt-0.5">
      {rules.map((r) => (
        <li
          key={r.short}
          className={cn(
            'flex min-w-0 items-center justify-center gap-1 rounded-md border px-1 py-1 font-mono text-metadata whitespace-nowrap transition-colors',
            !typed
              ? 'border-border bg-surface-sunken text-text-secondary'
              : r.ok
                ? 'border-accent/40 bg-accent-soft font-semibold text-success-text'
                : 'border-danger/30 bg-danger-soft text-danger',
          )}
        >
          <span aria-hidden="true">{!typed ? '•' : r.ok ? '✓' : '✕'}</span>
          <span aria-hidden="true" className="truncate">
            {r.short}
          </span>
          <span className="sr-only">
            {r.full}
            {typed ? (r.ok ? ': done' : ': not yet') : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
