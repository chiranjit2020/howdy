'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loginSchema } from '@/shared/validation/auth';
import { postJson, type ApiResult } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { GoogleButton } from '@/ui/auth/google-button';
import {
  usePasskeysSupported,
  signWithPasskey,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@/ui/auth/passkey';
import { KeyIcon } from '@/ui/icons';
import { Button, Checkbox, Input, PasswordInput } from '@/ui/primitives';
import { readSuspension, SuspendedNotice, type Suspension } from './suspended-notice';

/** "Remember this device": a 30-day session when ticked, one that ends with the browser when not. */
function RememberDevice({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Checkbox
        name="remember"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        label={<span className="text-caption font-normal">Remember this device</span>}
      />
      <span aria-hidden="true" className="pt-2 text-metadata text-text-secondary">
        30 days
      </span>
    </div>
  );
}

/** A hairline with "or" on it, between the password form and the other way in. */
function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-metadata text-text-secondary" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

type Creds = { identifier: string; password: string };
/**
 * What proves the person to the server: password (+ code), the ticket a complete sign-in handed back (ADR-040), or
 * "Google already proved me" (ADR-048: the proof itself is a cookie the server set; only a code may be added).
 */
type Proof = (Creds & { code?: string }) | { ticket: string } | { google: true; code?: string };

/** Why Google sent the person back here without signing them in (`?google=…`, set by the callback). */
const GOOGLE_MESSAGE: Record<string, string> = {
  failed: 'Google sign-in did not finish. Please try again.',
  cancelled: 'Google sign-in was cancelled.',
  busy: 'Too many tries just now. Wait a few minutes and try again.',
  // Not a Gmail or Google Workspace address: Google cannot vouch for it today (see googleIsAuthoritative).
  'use-email':
    'Google can only sign you in with a Gmail or Google Workspace address. Log in or sign up with your email and password instead.',
};

export function LoginForm({ google = false }: { google?: boolean } = {}) {
  const router = useRouter();
  const googleParam = useSearchParams().get('google');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(
    googleParam ? GOOGLE_MESSAGE[googleParam] : undefined,
  );
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [resent, setResent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Back from Google with an account proven: finishing (two-step, suspension …) starts at once.
  const [busy, setBusy] = useState(googleParam === 'continue');
  // Ticked by default: most people sign in on their own phone. Unticked, the session ends with the browser.
  const [remember, setRemember] = useState(true);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const canPasskey = usePasskeysSupported();
  // ADR-040: the password was right and two-step is on — ask for the second step.
  const [secondStep, setSecondStep] = useState<((Creds | { google: true }) & { passkey: boolean }) | null>(
    null,
  );
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
      setError('Enter your email or username and your password.');
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
    await signIn(
      'google' in secondStep
        ? { google: true, code: code.trim() }
        : { identifier: secondStep.identifier, password: secondStep.password, code: code.trim() },
    );
  }

  async function signIn(proof: Proof) {
    setBusy(true);
    await submitProof(proof);
  }

  /** Send a proof and act on the answer. Google's "remember" was chosen before leaving for Google (it is in the cookie). */
  async function submitProof(proof: Proof) {
    const res = await postJson('/api/auth/login', 'google' in proof ? proof : { ...proof, remember });
    if (res.ok) return done();
    setBusy(false);
    if (res.error?.code === 'SECOND_STEP_REQUIRED' && ('password' in proof || 'google' in proof)) {
      const passkey = res.error.data?.passkey === 'yes';
      setSecondStep(
        'google' in proof
          ? { google: true, passkey }
          : { identifier: proof.identifier, password: proof.password, passkey },
      );
      setCode('');
      return;
    }
    onFailure(res);
  }

  // Back from Google: finish once (a development re-run must not spend the proof twice), and tidy the address.
  const googleStarted = useRef(false);
  useEffect(() => {
    if (!googleParam || googleStarted.current) return;
    googleStarted.current = true;
    window.history.replaceState(null, '', '/login');
    if (googleParam === 'continue') void submitProof({ google: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, for the address it arrived with
  }, []);

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
      remember,
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
        <Button type="submit" fullWidth loading={busy}>
          Log in
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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-body font-semibold text-text-primary">Welcome back</h1>
        <p className="text-caption font-normal text-text-secondary">Log in to your Howdy account.</p>
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
        label="Email or username"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com or username"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <PasswordInput
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        labelAction={
          // -my-3: still a 44px tap target, but it overhangs the label row instead of making it (and so the gap to
          // the box) taller than the other fields'.
          <Link
            href="/forgot-password"
            className="-my-3 inline-flex min-h-11 items-center text-metadata font-semibold text-auth-link no-underline hover:underline"
          >
            Forgot password?
          </Link>
        }
      />
      <RememberDevice checked={remember} onChange={setRemember} />
      <Button type="submit" fullWidth loading={busy}>
        {busy ? 'Logging in…' : 'Log in'}
      </Button>
      {(google || canPasskey) && <OrDivider />}
      {google && <GoogleButton remember={remember} />}
      {canPasskey && (
        <Button variant="secondary" fullWidth loading={passkeyBusy} onClick={signInWithPasskey}>
          {!passkeyBusy && <KeyIcon className="text-text-secondary" />}
          Log in with a passkey
        </Button>
      )}
    </form>
  );
}
