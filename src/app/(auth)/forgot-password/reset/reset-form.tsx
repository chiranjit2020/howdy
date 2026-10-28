'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { PASSWORD_MIN, passwordSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { EntryHeading } from '@/ui/auth/entry-shell';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { Button, buttonClasses, PasswordInput } from '@/ui/primitives';

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
      <>
        <EntryHeading title="Password changed">
          Your password was changed and every device was signed out.
        </EntryHeading>
        <Link href="/login" className={buttonClasses({ fullWidth: true })}>
          Log in
        </Link>
      </>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <EntryHeading title="Choose a new password">This will sign you out everywhere else.</EntryHeading>
      {formError && (
        <FormMessage tone="error" focusKey={attempt}>
          {formError} <Link href="/forgot-password">Ask for a new link</Link>
        </FormMessage>
      )}
      <PasswordInput
        label="New password"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldError}
        hint={`At least ${PASSWORD_MIN} characters. A short phrase works well.`}
      />
      <Button type="submit" fullWidth loading={busy}>
        Save new password
      </Button>
    </form>
  );
}
