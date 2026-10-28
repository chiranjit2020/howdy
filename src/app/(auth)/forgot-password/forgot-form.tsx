'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { emailOnlySchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { EntryHeading } from '@/ui/auth/entry-shell';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Input } from '@/ui/primitives';

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
      <>
        <EntryHeading title="Check your email">
          If there is a Howdy account for that address, a link to choose a new password is on its way. It
          works once and expires in 1 hour.
        </EntryHeading>
        <Link href="/login" className="inline-flex min-h-11 items-center justify-center text-caption">
          Back to log in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <EntryHeading title="Forgot password?">
        Enter your email and we will send you a link to choose a new one.
      </EntryHeading>
      {error && (
        <FormMessage tone="error" focusKey={attempt}>
          {error}
        </FormMessage>
      )}
      <Input
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" fullWidth loading={busy}>
        Send the link
      </Button>
      <Link href="/login" className="inline-flex min-h-11 items-center justify-center text-caption">
        Back to log in
      </Link>
    </form>
  );
}
