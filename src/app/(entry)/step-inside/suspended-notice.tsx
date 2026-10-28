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
 * The suspension, in plain words, and the one appeal it allows. They have no session, so the appeal carries the ticket
 * their complete sign-in returned (ADR-040): short-lived, and checked by the server before it accepts anything.
 */
export function SuspendedNotice({ suspension, ticket }: { suspension: Suspension; ticket: string }) {
  const [appeal, setAppeal] = useState(suspension.appeal);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Deletion is a right a suspension does not take away (ADR-027): two steps, then the same result as the Workshop.
  const [leaving, setLeaving] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [closedOn, setClosedOn] = useState<string | undefined>();
  const [leaveError, setLeaveError] = useState<string | undefined>();

  async function leave() {
    setLeaving('busy');
    setLeaveError(undefined);
    const res = await postJson<{ deleteOn: string }>('/api/auth/close', { ticket });
    setLeaving('idle');
    if (res.ok && res.data) setClosedOn(res.data.deleteOn);
    else setLeaveError(res.error?.message ?? 'That did not work. Try again.');
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError('Say why the suspension should be lifted.');
    setBusy(true);
    setError(undefined);
    const res = await postJson('/api/auth/appeal', { ticket, text });
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
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {closedOn ? (
          <FormMessage tone="success">
            Your account is closed and will be deleted for good on {longDate(closedOn)}. Signing in before
            then lets you keep it.
          </FormMessage>
        ) : leaving === 'idle' ? (
          <Button variant="ghost" className="self-start" onClick={() => setLeaving('confirm')}>
            Delete my account instead…
          </Button>
        ) : (
          <>
            <p className="text-caption text-text-primary">
              Your account closes now and is deleted for good after 14 days, with your Porch, Post Cards,
              Whispers and photo. Reports about it are kept for a while, without your name.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" loading={leaving === 'busy'} onClick={leave}>
                Yes, delete my account
              </Button>
              <Button variant="ghost" onClick={() => setLeaving('idle')}>
                Cancel
              </Button>
            </div>
          </>
        )}
        {leaveError && <FormMessage tone="error">{leaveError}</FormMessage>}
      </div>
    </section>
  );
}
