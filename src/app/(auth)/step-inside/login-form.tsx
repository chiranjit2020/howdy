'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { AuthCard } from '@/ui/auth/auth-card';
import { AuthField } from '@/ui/auth/auth-field';
import { FormMessage } from '@/ui/auth/form-parts';
import { TrailArt } from '@/ui/auth/illustrations';
import { SocialButtons } from '@/ui/auth/social-buttons';
import { ArrowRightIcon, LockIcon, MailIcon, UserIcon } from '@/ui/icons';
import { Button } from '@/ui/primitives';

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
    <AuthCard scene="trail" art={<TrailArt />} logo="lg" className="gap-8 pb-28 sm:pb-24">
      <p className="text-title font-normal text-auth-text">
        Real people. Small circles.
        <br />
        Big moments.
      </p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-headline text-brand-ink">Step Inside</h1>
          <p className="text-body text-auth-text">Welcome back! Log in to your Howdy account.</p>
        </div>
        {error && (
          <FormMessage tone="error" focusKey={attempt}>
            {error}
          </FormMessage>
        )}
        {needsVerify && (
          <div className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-4">
            <AuthField
              label="Email to send the link to"
              placeholder="Email address"
              icon={<MailIcon />}
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
        <AuthField
          label="Handle or email"
          placeholder="Handle or email"
          icon={<UserIcon />}
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <AuthField
          label="Secret knock"
          placeholder="Secret knock"
          icon={<LockIcon />}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="cta" size="lg" fullWidth loading={busy} className="min-h-14">
          Step Inside <ArrowRightIcon />
        </Button>
        <SocialButtons />
        <div className="flex items-center justify-between gap-4 text-caption text-auth-text sm:pl-40">
          <Link href="/lost-your-key" className="inline-flex min-h-11 items-center text-auth-link">
            Lost your key?
          </Link>
          <Link href="/stake-a-claim" className="inline-flex min-h-11 items-center gap-1.5 text-auth-link">
            Stake a claim <ArrowRightIcon />
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
