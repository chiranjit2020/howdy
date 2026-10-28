'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginSchema } from '@/shared/validation/auth';
import { postJson, type ApiResult } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import {
  usePasskeysSupported,
  signWithPasskey,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@/ui/auth/passkey';
import { Button, Input } from '@/ui/primitives';
import { readSuspension, SuspendedNotice, type Suspension } from './suspended-notice';

type Creds = { identifier: string; password: string };
/** What proves the person to the server: password (+ code), or the ticket a complete sign-in handed back (ADR-040). */
type Proof = (Creds & { code?: string }) | { ticket: string };

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
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const canPasskey = usePasskeysSupported();
  // ADR-040: the password was right and two-step is on — ask for the second step.
  const [secondStep, setSecondStep] = useState<(Creds & { passkey: boolean }) | null>(null);
  const [code, setCode] = useState('');
  const [suspended, setSuspended] = useState<(Suspension & { ticket: string }) | null>(null);
  // ADR-027: the owner asked to delete this account; it can still be kept until `deleteOn`.
  const [closing, setClosing] = useState<{ deleteOn: string | null; ticket: string } | null>(null);
  const [keeping, setKeeping] = useState(false);

  function reset() {
    setError(undefined);
    setNeedsVerify(false);
    setResent(false);
    setSuspended(null);
    setClosing(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    reset();
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError('Enter your handle or email and your password.');
      setAttempt((n) => n + 1);
      return;
    }
    await signIn(parsed.data);
  }

  async function onSecondStep(e: FormEvent) {
    e.preventDefault();
    if (!secondStep) return;
    if (!code.trim()) {
      setError('Enter the code.');
      setAttempt((n) => n + 1);
      return;
    }
    setError(undefined);
    await signIn({ identifier: secondStep.identifier, password: secondStep.password, code: code.trim() });
  }

  async function signIn(proof: Proof) {
    setBusy(true);
    const res = await postJson('/api/auth/login', proof);
    if (res.ok) return done();
    setBusy(false);
    if (res.error?.code === 'SECOND_STEP_REQUIRED' && 'password' in proof) {
      setSecondStep({
        identifier: proof.identifier,
        password: proof.password,
        passkey: res.error.data?.passkey === 'yes',
      });
      setCode('');
      return;
    }
    onFailure(res);
  }

  async function signInWithPasskey() {
    reset();
    setPasskeyBusy(true);
    const start = await postJson<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>(
      '/api/auth/passkey/options',
      {},
    );
    if (!start.ok || !start.data) {
      setPasskeyBusy(false);
      return onFailure(start);
    }
    const answer = await signWithPasskey(start.data.options);
    if (!answer.ok) {
      setPasskeyBusy(false);
      setError(answer.message);
      setAttempt((n) => n + 1);
      return;
    }
    const res = await postJson('/api/auth/passkey/login', {
      challengeId: start.data.challengeId,
      response: answer.response,
    });
    if (res.ok) return done();
    setPasskeyBusy(false);
    onFailure(res);
  }

  function done() {
    router.push('/home');
    router.refresh();
  }

  /** Whatever stands in the way after a complete sign-in, or the error to show. */
  function onFailure(res: ApiResult) {
    const ticket = res.error?.data?.ticket ?? '';
    if (res.error?.code === 'ACCOUNT_SUSPENDED') {
      // Not an error to fix: show what happened, and the appeal, instead of a red message.
      setSecondStep(null);
      setSuspended({ ...readSuspension(res.error.data), ticket });
      return;
    }
    if (res.error?.code === 'ACCOUNT_CLOSING') {
      const at = res.error.data?.deleteOn;
      setSecondStep(null);
      setClosing({ deleteOn: at && !Number.isNaN(Date.parse(at)) ? at : null, ticket });
      return;
    }
    if (res.error?.code === 'EMAIL_NOT_VERIFIED') {
      setSecondStep(null);
      setNeedsVerify(true);
      setVerifyEmail(identifier.includes('@') ? identifier.trim() : '');
    }
    setError(res.error?.fields?.code ?? res.error?.message ?? 'Something went wrong. Try again.');
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
    const { ticket } = closing;
    const res = await postJson('/api/auth/keep', { ticket });
    setKeeping(false);
    setClosing(null);
    if (!res.ok) {
      setError(res.error?.message ?? 'That did not work. Try again.');
      setAttempt((n) => n + 1);
      return;
    }
    // Kept: sign straight in with the same ticket (a suspended account is shown its suspension, as before it closed).
    await signIn({ ticket });
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
        <SuspendedNotice suspension={suspended} ticket={suspended.ticket} />
        <Button variant="ghost" onClick={() => setSuspended(null)}>
          Sign in with another account
        </Button>
      </div>
    );
  }

  if (secondStep) {
    return (
      <form onSubmit={onSecondStep} noValidate className="flex flex-col gap-3">
        <div>
          <h1 className="text-title text-text-primary">One more step</h1>
          <p className="text-body text-text-secondary">
            Two-step sign-in is on for this account. Enter the 6-digit code from your authenticator app, or
            one of your recovery codes.
          </p>
        </div>
        {error && (
          <FormMessage tone="error" focusKey={attempt}>
            {error}
          </FormMessage>
        )}
        <Input
          label="Code"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Step Inside
        </Button>
        {secondStep.passkey && canPasskey && (
          <Button variant="secondary" fullWidth loading={passkeyBusy} onClick={signInWithPasskey}>
            Use a passkey instead
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setSecondStep(null);
            setError(undefined);
            setPassword('');
          }}
        >
          Back
        </Button>
        <p className="text-caption text-text-secondary">
          Lost your phone and your recovery codes? We can’t switch two-step off for you: that is what keeps
          someone who gets into your email out.
        </p>
      </form>
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
      {canPasskey && (
        <Button variant="secondary" size="lg" fullWidth loading={passkeyBusy} onClick={signInWithPasskey}>
          Sign in with a passkey
        </Button>
      )}
      <div className="flex justify-center text-caption">
        <Link href="/lost-your-key" className="inline-flex min-h-11 items-center">
          Lost your key? Reset your password
        </Link>
      </div>
    </form>
  );
}
