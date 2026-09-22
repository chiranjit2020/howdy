'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, Input } from '@/ui/primitives';

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNeedsVerify(false);
    setResent(false);
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError('Enter your email or call sign and your secret knock.');
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    const res = await postJson('/api/auth/login', parsed.data);
    if (res.ok) {
      router.push('/home');
      router.refresh();
      return;
    }
    setBusy(false);
    if (res.error?.code === 'EMAIL_NOT_VERIFIED') {
      setNeedsVerify(true);
      setVerifyEmail(parsed.data.identifier.includes('@') ? parsed.data.identifier : '');
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

  return (
    <ClayCard className="p-8">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <h1 className="text-heading text-text-primary">Step Inside</h1>
          <p className="text-body text-text-secondary">Welcome back! Log in to your Howdy account.</p>
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
          label="Secret knock"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Step Inside
        </Button>
        <div className="flex flex-col items-center gap-1 text-caption text-text-secondary">
          <Link href="/lost-your-key" className="inline-flex min-h-11 items-center">
            Lost your key?
          </Link>
          <span>
            New here? <Link href="/stake-a-claim">Stake a Claim</Link>
          </span>
        </div>
      </form>
    </ClayCard>
  );
}
