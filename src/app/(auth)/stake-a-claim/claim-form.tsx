'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { PASSWORD_MIN, signUpSchema } from '@/shared/validation/auth';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { TermsCheckbox } from '@/ui/auth/terms-checkbox';
import { Button, Input } from '@/ui/primitives';

type Fields = { handle: string; displayName: string; email: string; password: string };
type Errors = Partial<Fields & { acceptTerms: string }>;

export function ClaimForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Fields>({ handle: '', displayName: '', email: '', password: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
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
    const parsed = signUpSchema.safeParse(
      displayName.trim() ? { ...rest, displayName, acceptTerms } : { ...rest, acceptTerms },
    );
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
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
      setErrors(res.error.fields as Errors);
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
      <div className="flex flex-col gap-4">
        <h1 className="text-title text-text-primary">Check your email</h1>
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
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div>
        <h1 className="text-title text-text-primary">Join Howdy</h1>
        <p className="text-body text-text-secondary">It only takes a minute.</p>
      </div>
      {formError && (
        <FormMessage tone="error" focusKey={attempt}>
          {formError}
        </FormMessage>
      )}
      <Input
        label="Choose a handle"
        name="handle"
        prefix="@"
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
        label="Display name (optional)"
        name="displayName"
        autoComplete="name"
        value={values.displayName}
        onChange={set('displayName')}
        error={errors.displayName}
        hint="Leave blank to use your handle."
      />
      <Input
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={values.email}
        onChange={set('email')}
        error={errors.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        hint={`Your secret knock: at least ${PASSWORD_MIN} characters.`}
      />
      <TermsCheckbox
        checked={acceptTerms}
        onChange={(v) => {
          setAcceptTerms(v);
          if (v) setErrors(({ acceptTerms: _, ...others }) => others);
        }}
        invalid={!!errors.acceptTerms}
      />
      {errors.acceptTerms && <FormMessage tone="error">{errors.acceptTerms}</FormMessage>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Create My Account
      </Button>
    </form>
  );
}
