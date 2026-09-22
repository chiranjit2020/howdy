'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { passwordSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { AuthCard } from '@/ui/auth/auth-card';
import { AuthField } from '@/ui/auth/auth-field';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { LockIcon } from '@/ui/icons';
import { Button } from '@/ui/primitives';

export function ResetForm({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const res = await postJson('/api/auth/reset-password', { token, password });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    if (res.error?.fields?.password) {
      setFieldError(res.error.fields.password);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    } else {
      setFormError(res.error?.message);
      setAttempt((n) => n + 1);
    }
  }

  if (done) {
    return (
      <AuthCard className="gap-4">
        <h1 className="font-display text-headline text-brand-ink">New knock set</h1>
        <p className="text-body text-auth-text">
          Your secret knock was changed and every device was signed out.
        </p>
        <Link href="/step-inside" className="inline-flex min-h-11 items-center font-semibold text-auth-link">
          Step Inside
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-headline text-brand-ink">Choose a new secret knock</h1>
          <p className="text-body text-auth-text">This will sign you out everywhere else.</p>
        </div>
        {formError && (
          <FormMessage tone="error" focusKey={attempt}>
            {formError} <Link href="/lost-your-key">Ask for a new link</Link>
          </FormMessage>
        )}
        <AuthField
          label="New secret knock (at least 10 characters)"
          placeholder="New secret knock"
          icon={<LockIcon />}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
        />
        <Button type="submit" variant="cta" size="lg" fullWidth loading={busy} className="min-h-14">
          Save new knock
        </Button>
      </form>
    </AuthCard>
  );
}
