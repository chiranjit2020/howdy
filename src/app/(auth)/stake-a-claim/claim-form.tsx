'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { signUpSchema } from '@/shared/validation/auth';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { Button, ClayCard, Input } from '@/ui/primitives';

type Fields = { email: string; handle: string; password: string };

export function ClaimForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Fields>({ email: '', handle: '', password: '' });
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
    const parsed = signUpSchema.safeParse(values);
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
      <ClayCard className="flex flex-col gap-4 p-8">
        <h1 className="text-heading text-text-primary">Check your email</h1>
        <p className="text-body text-text-secondary">
          If <strong className="text-text-primary">{sentTo}</strong> can be used for a new Howdy account, a
          confirmation link is on its way. It works once and expires in 24 hours.
        </p>
        {resent && <FormMessage tone="success">Sent again, if there is anything to send.</FormMessage>}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={resend}>
            Send it again
          </Button>
          <Link href="/step-inside" className="inline-flex min-h-11 items-center text-body">
            Step Inside
          </Link>
        </div>
      </ClayCard>
    );
  }

  return (
    <ClayCard className="p-8">
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <h1 className="text-heading text-text-primary">Stake a Claim</h1>
          <p className="text-body text-text-secondary">Pick a call sign and get your own Ranch.</p>
        </div>
        {formError && (
          <FormMessage tone="error" focusKey={attempt}>
            {formError}
          </FormMessage>
        )}
        <Input
          label="Call sign"
          name="handle"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITS.HANDLE_MAX}
          value={values.handle}
          onChange={set('handle')}
          error={errors.handle}
          hint={`${LIMITS.HANDLE_MIN}–${LIMITS.HANDLE_MAX} letters, numbers or underscores.`}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Input
          label="Secret Knock"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 10 characters. A short phrase works well."
        />
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Stake your claim
        </Button>
        <p className="text-center text-caption text-text-secondary">
          Already have a patch of ground? <Link href="/step-inside">Step Inside</Link>
        </p>
      </form>
    </ClayCard>
  );
}
