'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { emailOnlySchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { AuthCard } from '@/ui/auth/auth-card';
import { AuthField } from '@/ui/auth/auth-field';
import { FormMessage } from '@/ui/auth/form-parts';
import { MailIcon } from '@/ui/icons';
import { Button } from '@/ui/primitives';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    const res = await postJson('/api/auth/forgot-password', parsed.data);
    setBusy(false);
    if (res.ok) setDone(true);
    else {
      setError(res.error?.message);
      setAttempt((n) => n + 1);
    }
  }

  if (done) {
    return (
      <AuthCard className="gap-4">
        <h1 className="font-display text-headline text-brand-ink">Check your email</h1>
        <p className="text-body text-auth-text">
          If there is a Howdy account for that address, a link to choose a new secret knock is on its way. It
          works once and expires in 1 hour.
        </p>
        <Link href="/step-inside" className="inline-flex min-h-11 items-center text-auth-link">
          Back to Step Inside
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-headline text-brand-ink">Lost your key?</h1>
          <p className="text-body text-auth-text">Misplaced it? We will send a link to your email.</p>
        </div>
        {error && (
          <FormMessage tone="error" focusKey={attempt}>
            {error}
          </FormMessage>
        )}
        <AuthField
          label="Email address"
          placeholder="Email address"
          icon={<MailIcon />}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="cta" size="lg" fullWidth loading={busy} className="min-h-14">
          Send the link
        </Button>
        <Link
          href="/step-inside"
          className="inline-flex min-h-11 items-center justify-center text-caption text-auth-link"
        >
          Back to Step Inside
        </Link>
      </form>
    </AuthCard>
  );
}
