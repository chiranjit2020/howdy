'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { passwordSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { Button, ClayCard, Input } from '@/ui/primitives';

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
      <ClayCard className="flex flex-col gap-4 p-8">
        <h1 className="text-heading text-text-primary">New knock set</h1>
        <p className="text-body text-text-secondary">
          Your secret knock was changed and every device was signed out.
        </p>
        <Link href="/step-inside" className="inline-flex min-h-11 items-center font-semibold">
          Step Inside
        </Link>
      </ClayCard>
    );
  }

  return (
    <ClayCard className="p-8">
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <h1 className="text-heading text-text-primary">Choose a new secret knock</h1>
          <p className="text-body text-text-secondary">This will sign you out everywhere else.</p>
        </div>
        {formError && (
          <FormMessage tone="error" focusKey={attempt}>
            {formError} <Link href="/lost-your-key">Ask for a new link</Link>
          </FormMessage>
        )}
        <Input
          label="New secret knock (at least 10 characters)"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
          hint="A short phrase works well."
        />
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Save new knock
        </Button>
      </form>
    </ClayCard>
  );
}
