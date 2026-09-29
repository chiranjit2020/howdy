'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  APPEAL_MAX,
  REPORT_REASON_LABEL,
  REPORT_REASONS,
  type ReportReason,
} from '@/shared/validation/moderation';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Textarea } from '@/ui/primitives';

/** What sign-in shows a suspended person (only ever after their password was proven). ADR-023. */
export interface Suspension {
  reason: ReportReason;
  endsAt: string | null;
  appeal: 'available' | 'open' | 'upheld';
}

/** Read the `data` of an ACCOUNT_SUSPENDED error defensively: anything unexpected falls back to the plain facts. */
export function readSuspension(data: Record<string, string | null> | undefined): Suspension {
  const reason = (REPORT_REASONS as readonly string[]).includes(data?.reason ?? '')
    ? (data?.reason as ReportReason)
    : 'other';
  const appeal = data?.appeal === 'open' || data?.appeal === 'upheld' ? data.appeal : 'available';
  const endsAt = data?.endsAt && !Number.isNaN(Date.parse(data.endsAt)) ? data.endsAt : null;
  return { reason, endsAt, appeal };
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The suspension, in plain words, and the one appeal it allows. The appeal re-sends the sign-in details the person just
 * typed: they have no session, and the server checks the password again before it accepts anything.
 */
export function SuspendedNotice({
  suspension,
  identifier,
  password,
}: {
  suspension: Suspension;
  identifier: string;
  password: string;
}) {
  const [appeal, setAppeal] = useState(suspension.appeal);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError('Say why the suspension should be lifted.');
    setBusy(true);
    setError(undefined);
    const res = await postJson('/api/auth/appeal', { identifier, password, text });
    setBusy(false);
    // 409: an appeal is already waiting (sent from another tab, say) — the outcome is the same.
    if (res.ok || res.status === 409) setAppeal('open');
    else setError(res.error?.fields?.text ?? res.error?.message ?? 'That did not send. Try again.');
  }

  return (
    <section
      aria-labelledby="suspended-heading"
      className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4"
    >
      <h2 id="suspended-heading" className="text-body font-semibold text-text-primary">
        Your account is suspended
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
        <dt className="text-text-secondary">Reason</dt>
        <dd className="text-text-primary">{REPORT_REASON_LABEL[suspension.reason]}</dd>
        <dt className="text-text-secondary">Until</dt>
        <dd className="text-text-primary">
          {suspension.endsAt ? longDate(suspension.endsAt) : 'A moderator lifts it'}
        </dd>
      </dl>
      <p className="text-caption text-text-secondary">
        While it lasts, your Porch and Post Cards are hidden and you cannot sign in. See the{' '}
        <Link href="/campfire-rules">Campfire Rules</Link>.
      </p>
      {appeal === 'open' && (
        <FormMessage tone="success">
          Your appeal has been sent. A moderator will read it; sign in again later to see the answer.
        </FormMessage>
      )}
      {appeal === 'upheld' && (
        <FormMessage tone="info">A moderator has read your appeal and the suspension stands.</FormMessage>
      )}
      {appeal === 'available' && (
        <form onSubmit={send} noValidate className="flex flex-col gap-3">
          <Textarea
            label="Appeal (you can send one)"
            hint="Tell a moderator why you think this was a mistake."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={APPEAL_MAX}
            showCount
            rows={4}
            error={error}
          />
          <Button type="submit" variant="secondary" loading={busy}>
            Send appeal
          </Button>
        </form>
      )}
    </section>
  );
}
