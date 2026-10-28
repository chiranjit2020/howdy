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

/** The password rules, ticked off live as they are met. Not announced on every key press (it is the field's hint). */
export function PasswordChecklist({
  password,
  email,
  handle,
}: {
  password: string;
  email: string;
  handle: string;
}) {
  const rules = [
    { ok: password.length >= PASSWORD_MIN, text: `At least ${PASSWORD_MIN} characters` },
    { ok: !!password && !isCommonPassword(password), text: 'Not a common password' },
    {
      ok: !!password && !passwordMatchesIdentity(password, email, handle),
      text: 'Doesn’t contain your email or username',
    },
  ];
  return (
    <ul className="flex flex-col gap-0.5">
      {rules.map((r) => (
        <li
          key={r.text}
          className={cn('flex items-center gap-1.5', r.ok ? 'text-success-text' : 'text-text-secondary')}
        >
          <span aria-hidden="true" className="w-3 text-center">
            {r.ok ? '✓' : '•'}
          </span>
          {r.text}
          <span className="sr-only">{r.ok ? ' (done)' : ''}</span>
        </li>
      ))}
    </ul>
  );
}
