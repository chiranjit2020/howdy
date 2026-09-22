'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { signUpSchema } from '@/shared/validation/auth';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { AuthCard } from '@/ui/auth/auth-card';
import { AuthField } from '@/ui/auth/auth-field';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { RanchArt } from '@/ui/auth/illustrations';
import { ArrowRightIcon, LockIcon, MailIcon, UserIcon } from '@/ui/icons';
import { Button } from '@/ui/primitives';

type Fields = { handle: string; displayName: string; email: string; password: string };

export function ClaimForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Fields>({ handle: '', displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Fields>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    // A blank Display name is not an error: the Ranch is simply named after the call sign.
    const { displayName, ...rest } = values;
    const parsed = signUpSchema.safeParse(displayName.trim() ? { ...rest, displayName } : rest);
    if (!parsed.success) {
      const next: Partial<Fields> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Fields;
        next[key] ??= issue.message;
      }
      setErrors(next);
      setAttempt((n) => n + 1);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await postJson('/api/auth/signup', parsed.data);
    setBusy(false);
    if (res.ok) {
      setSentTo(parsed.data.email);
      return;
    }
    if (res.error?.fields) {
      setErrors(res.error.fields as Partial<Fields>);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    } else {
      setFormError(res.error?.message);
    }
    setAttempt((n) => n + 1);
  }

  async function resend() {
    if (!sentTo) return;
    await postJson('/api/auth/resend-verification', { email: sentTo });
    setResent(true);
  }

  if (sentTo) {
    return (
      <AuthCard scene="ranch" art={<RanchArt />} className="gap-4">
        <h1 className="mt-10 font-display text-headline text-brand-ink sm:mt-16">Check your email</h1>
        <p className="text-body text-auth-text">
          If <strong className="text-text-primary">{sentTo}</strong> can be used for a new Howdy account, a
          confirmation link is on its way. It works once and expires in 24 hours.
        </p>
        {resent && <FormMessage tone="success">Sent again, if there is anything to send.</FormMessage>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={resend}>
            Send it again
          </Button>
          <Link href="/step-inside" className="inline-flex min-h-11 items-center text-body text-auth-link">
            Step Inside
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard scene="ranch" art={<RanchArt />}>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="mt-10 flex flex-col gap-1 sm:mt-16">
          <h1 className="font-display text-headline text-brand-ink">Stake a Claim</h1>
          <p className="text-body text-auth-text">
            Join Howdy and start your journey.
            <br />
            It only takes a minute.
          </p>
        </div>
        {formError && (
          <FormMessage tone="error" focusKey={attempt}>
            {formError}
          </FormMessage>
        )}
        <AuthField
          label="Choose a handle"
          placeholder="Choose a handle"
          suffix="@yourname"
          icon={<UserIcon />}
          name="handle"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITS.HANDLE_MAX}
          value={values.handle}
          onChange={set('handle')}
          error={errors.handle}
        />
        <AuthField
          label="Display name (optional)"
          placeholder="Display name"
          icon={<UserIcon />}
          name="displayName"
          autoComplete="name"
          value={values.displayName}
          onChange={set('displayName')}
          error={errors.displayName}
        />
        <AuthField
          label="Email address"
          placeholder="Email address"
          icon={<MailIcon />}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <AuthField
          label="Secret knock (at least 10 characters)"
          placeholder="Secret knock"
          icon={<LockIcon />}
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
        />
        <Button type="submit" variant="cta-success" size="lg" fullWidth loading={busy} className="min-h-14">
          Create My Account <ArrowRightIcon />
        </Button>
        <p className="text-center text-caption text-auth-text">
          By continuing, you agree to our Terms of Service
          <br className="hidden sm:block" /> and Privacy Policy.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 border-t border-field-border pt-4 text-caption text-auth-text">
          <span>Already have an account?</span>
          <Link href="/step-inside" className="inline-flex min-h-11 items-center gap-1.5 text-auth-link">
            Step Inside <ArrowRightIcon />
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
