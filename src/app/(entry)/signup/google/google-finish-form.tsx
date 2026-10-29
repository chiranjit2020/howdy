'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import { googleSignUpSchema } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { TermsCheckbox } from '@/ui/auth/terms-checkbox';
import { Button, Input } from '@/ui/primitives';
import { useHandleStatus } from '../signup-aids';

type Errors = Partial<Record<'handle' | 'acceptTerms', string>>;

/**
 * Username (suggested from the Google name, checked live) and the box. The display name is not asked for: the server
 * uses the name Google gave, and it can be changed later in Settings.
 */
export function GoogleFinishForm({ email, suggested }: { email: string; suggested: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [handle, setHandle] = useState(suggested);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const status = useHandleStatus(handle);

  const handleError =
    errors.handle ??
    (status.state === 'taken'
      ? 'That username is taken.'
      : status.state === 'invalid'
        ? status.message
        : undefined);
  const handleHint =
    status.state === 'checking'
      ? 'Checking…'
      : status.state === 'available'
        ? `@${handle.trim().toLowerCase()} is available.`
        : `${LIMITS.HANDLE_MIN}–${LIMITS.HANDLE_MAX} characters: letters, numbers and underscores.`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = googleSignUpSchema.safeParse({ handle, acceptTerms });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(next);
      setAttempt((n) => n + 1);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await postJson('/api/auth/google/complete', parsed.data);
    if (res.ok) {
      router.push('/home');
      router.refresh();
      return;
    }
    setBusy(false);
    if (res.error?.fields) {
      setErrors(res.error.fields as Errors);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    } else setFormError(res.error?.message ?? 'Something went wrong. Try again.');
    setAttempt((n) => n + 1);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text-primary">Almost there</h1>
        <p className="text-caption font-normal [overflow-wrap:anywhere] text-text-secondary">
          Signing up as <strong className="font-semibold text-text-primary">{email}</strong>. Pick a username
          and you are in.
        </p>
      </div>
      {formError && (
        <FormMessage tone="error" focusKey={attempt}>
          {formError}
        </FormMessage>
      )}
      <Input
        label="Username"
        name="handle"
        prefix="@"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={LIMITS.HANDLE_MAX}
        value={handle}
        onChange={(e) => {
          setHandle(e.target.value);
          if (errors.handle) setErrors(({ handle: _fixed, ...rest }) => rest);
        }}
        error={handleError}
        hint={handleError ? undefined : handleHint}
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
      <Button type="submit" fullWidth loading={busy}>
        Create account
      </Button>
    </form>
  );
}
