'use client';

import { useRef, useState, type FormEvent } from 'react';
import { emailSchema, signUpSchema } from '@/shared/validation/auth';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { GoogleButton } from '@/ui/auth/google-button';
import { TermsCheckbox } from '@/ui/auth/terms-checkbox';
import { Button, Input, PasswordInput } from '@/ui/primitives';
import { PasswordChecklist, suggestHandle, useHandleStatus } from './signup-aids';

type Fields = { handle: string; displayName: string; email: string; password: string };
type Errors = Partial<Fields & { acceptTerms: string }>;

export function ClaimForm({
  invite,
  google = false,
}: { invite?: { code: string; invitedBy: string }; google?: boolean } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Fields>({ handle: '', displayName: '', email: '', password: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  // The username follows the email (suggestHandle) until the person types one of their own.
  const [handleEdited, setHandleEdited] = useState(false);
  const handleStatus = useHandleStatus(values.handle);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  const onHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHandleEdited(value !== '');
    setValues((v) => ({ ...v, handle: value }));
    if (errors.handle) setErrors(({ handle: _fixed, ...rest }) => rest);
  };

  // The email is checked as soon as you leave the box (not only on submit), with the same rule the server uses; once
  // an error is showing, it clears the moment the address is fixed. Nothing typed is ever cleared.
  const emailError = (value: string) => {
    const r = emailSchema.safeParse(value);
    return r.success ? undefined : r.error.issues[0]?.message;
  };
  const checkEmail = () => {
    if (values.email.trim()) setErrors((e) => ({ ...e, email: emailError(values.email) }));
  };
  const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, email: value, ...(handleEdited ? {} : { handle: suggestHandle(value) }) }));
    if (errors.email && !emailError(value)) setErrors(({ email: _fixed, ...rest }) => rest);
  };

  // What the username box says under itself: the live check, unless submitting already put an error there.
  const handleError =
    errors.handle ??
    (handleStatus.state === 'taken'
      ? 'That username is taken.'
      : handleStatus.state === 'invalid' && handleEdited
        ? handleStatus.message
        : undefined);
  const handleHint =
    handleStatus.state === 'checking'
      ? 'Checking…'
      : handleStatus.state === 'available'
        ? `@${values.handle.trim().toLowerCase()} is available.`
        : `${LIMITS.HANDLE_MIN}–${LIMITS.HANDLE_MAX} characters: letters, numbers and underscores.`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    // A blank Display name is not an error: the Ranch is simply named after the call sign.
    const { displayName, ...rest } = values;
    const parsed = signUpSchema.safeParse({
      ...rest,
      ...(displayName.trim() ? { displayName } : {}),
      acceptTerms,
      ...(invite ? { invite: invite.code } : {}),
    });
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
        <div className="flex flex-col gap-1">
          <h1 className="text-body font-semibold text-text-primary">Check your email</h1>
          <p className="text-caption font-normal text-text-secondary">
            If <strong className="font-semibold text-text-primary">{sentTo}</strong> can be used for a new
            Howdy account, a confirmation link is on its way. It works once and expires in 24 hours.
          </p>
        </div>
        {resent && <FormMessage tone="success">Sent again, if there is anything to send.</FormMessage>}
        <Button variant="secondary" fullWidth onClick={resend}>
          Send it again
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-body font-semibold text-text-primary">Create your account</h1>
        <p className="text-caption font-normal text-text-secondary">
          Join Howdy and connect with your people.
        </p>
      </div>
      {invite && (
        // Says exactly what will happen, and nothing more is granted (ADR-045).
        <p className="rounded-md border border-border bg-accent-soft px-3 py-2 text-caption font-normal text-text-primary">
          <strong className="font-semibold">{invite.invitedBy}</strong> invited you. Once you confirm your
          email, they get a friend request from you.
        </p>
      )}
      {google && (
        // The quickest way in: one tap, then just a username (ADR-048).
        <>
          <GoogleButton invite={invite?.code} />
          <div className="flex items-center gap-3 text-metadata text-text-secondary" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or sign up with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      {formError && (
        <FormMessage tone="error" focusKey={attempt}>
          {formError}
        </FormMessage>
      )}
      {/* Email first: the username is suggested from it, so most people only type an email and a password. */}
      <Input
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={onEmailChange}
        onBlur={checkEmail}
        error={errors.email}
      />
      <Input
        label="Username"
        name="handle"
        prefix="@"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={LIMITS.HANDLE_MAX}
        value={values.handle}
        onChange={onHandleChange}
        error={handleError}
        hint={handleError ? undefined : handleHint}
      />
      <PasswordInput
        label="Password"
        name="password"
        autoComplete="new-password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        hint={<PasswordChecklist password={values.password} email={values.email} handle={values.handle} />}
      />
      <Input
        label="Display name (optional)"
        name="displayName"
        autoComplete="name"
        value={values.displayName}
        onChange={set('displayName')}
        error={errors.displayName}
        hint="Shown on your profile. Leave blank to use your username."
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
