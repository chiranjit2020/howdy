'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Input } from '@/ui/primitives';
import { readSuspension, SuspendedNotice, type Suspension } from './suspended-notice';

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [resent, setResent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [suspended, setSuspended] = useState<(Suspension & { identifier: string; password: string }) | null>(
    null,
  );
  // ADR-027: the owner asked to delete this account; it can still be kept until `deleteOn`.
  const [closing, setClosing] = useState<{
    deleteOn: string | null;
    identifier: string;
    password: string;
  } | null>(null);
  const [keeping, setKeeping] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNeedsVerify(false);
    setResent(false);
    setSuspended(null);
    setClosing(null);
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError('Enter your handle or email and your password.');
      setAttempt((n) => n + 1);
      return;
    }
    await signIn(parsed.data);
  }

  async function signIn(creds: { identifier: string; password: string }) {
    setBusy(true);
    const res = await postJson('/api/auth/login', creds);
    if (res.ok) {
      router.push('/home');
      router.refresh();
      return;
    }
    setBusy(false);
    if (res.error?.code === 'ACCOUNT_SUSPENDED') {
      // Not an error to fix: show what happened, and the appeal, instead of a red message.
      setSuspended({ ...readSuspension(res.error.data), ...creds });
      return;
    }
    if (res.error?.code === 'ACCOUNT_CLOSING') {
      const at = res.error.data?.deleteOn;
      setClosing({ deleteOn: at && !Number.isNaN(Date.parse(at)) ? at : null, ...creds });
      return;
    }
    if (res.error?.code === 'EMAIL_NOT_VERIFIED') {
      setNeedsVerify(true);
      setVerifyEmail(creds.identifier.includes('@') ? creds.identifier : '');
    }
    setError(res.error?.message ?? 'Something went wrong. Try again.');
    setAttempt((n) => n + 1);
  }

  async function resend() {
    const email = verifyEmail.trim();
    if (!email) return;
    await postJson('/api/auth/resend-verification', { email });
    setResent(true);
  }

  async function keep() {
    if (!closing) return;
    setKeeping(true);
    const creds = { identifier: closing.identifier, password: closing.password };
    const res = await postJson('/api/auth/keep', creds);
    setKeeping(false);
    if (!res.ok) {
      setClosing(null);
      setError(res.error?.message ?? 'That did not work. Try again.');
      setAttempt((n) => n + 1);
      return;
    }
    setClosing(null);
    // Kept: sign straight in (a suspended account is shown its suspension, as before it closed).
    await signIn(creds);
  }

  if (closing) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title text-text-primary">Welcome back</h1>
        <section
          aria-labelledby="closing-heading"
          className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4"
        >
          <h2 id="closing-heading" className="text-body font-semibold text-text-primary">
            Your account is closing
          </h2>
          <p className="text-body text-text-primary">
            You asked us to delete it.
            {closing.deleteOn &&
              ` It will be deleted for good on ${new Date(closing.deleteOn).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}.`}{' '}
            Until then you can keep it, just as it was.
          </p>
          <Button onClick={keep} loading={keeping}>
            Keep my account
          </Button>
        </section>
        <Button variant="ghost" onClick={() => setClosing(null)}>
          Sign in with another account
        </Button>
      </div>
    );
  }

  // Shown instead of the form, not inside it: the appeal is a form of its own.
  if (suspended) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title text-text-primary">Welcome back</h1>
        <SuspendedNotice
          suspension={suspended}
          identifier={suspended.identifier}
          password={suspended.password}
        />
        <Button variant="ghost" onClick={() => setSuspended(null)}>
          Sign in with another account
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div>
        <h1 className="text-title text-text-primary">Welcome back</h1>
        <p className="text-body text-text-secondary">Sign in to your Howdy account.</p>
      </div>
      {error && (
        <FormMessage tone="error" focusKey={attempt}>
          {error}
        </FormMessage>
      )}
      {needsVerify && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4">
          <Input
            label="Email to send the link to"
            type="email"
            autoComplete="email"
            value={verifyEmail}
            onChange={(e) => setVerifyEmail(e.target.value)}
          />
          <Button variant="secondary" onClick={resend}>
            Send the link again
          </Button>
          {resent && (
            <FormMessage tone="success">
              If that account still needs confirming, a fresh link is on its way.
            </FormMessage>
          )}
        </div>
      )}
      <Input
        label="Handle or email"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Step Inside
      </Button>
      <div className="flex justify-center text-caption">
        <Link href="/lost-your-key" className="inline-flex min-h-11 items-center">
          Lost your key? Reset your password
        </Link>
      </div>
    </form>
  );
}
