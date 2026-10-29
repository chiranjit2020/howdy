'use client';

import { useRef, useState, type FormEvent } from 'react';
import { emailSchema, signUpSchema } from '@/shared/validation/auth';
import { LEGAL_FACTS } from '@/shared/legal';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { FormMessage, focusFirstInvalid } from '@/ui/auth/form-parts';
import { GoogleButton } from '@/ui/auth/google-button';
import { ArrowRightIcon, CheckCircleIcon, XCircleIcon } from '@/ui/icons';
import { Button, Input, PasswordInput } from '@/ui/primitives';
import { ConsentBoxes } from './consent-boxes';
import { PasswordChecklist, suggestHandle, useHandleStatus } from './signup-aids';

type Fields = { handle: string; displayName: string; email: string; password: string };
type Errors = Partial<Fields & { acceptTerms: string; age: string }>;

const AGE_MESSAGE = `Please confirm you are ${LEGAL_FACTS.minimumAge} or older.`;
const TERMS_MESSAGE = 'Please agree to the Terms of Service and Privacy Policy.';

export function ClaimForm({
  invite,
  google = false,
}: { invite?: { code: string; invitedBy: string }; google?: boolean } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Fields>({ handle: '', displayName: '', email: '', password: '' });
  // Two boxes on the page, one agreement on the server (`acceptTerms` needs both).
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
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
  // The live check, at the end of the label row (as in the design); the rule itself stays under the box.
  const handleNote = handleError ? (
    <span className="flex items-center gap-1 font-mono text-metadata font-semibold text-danger">
      <XCircleIcon className="size-3.5" />
      {handleStatus.state === 'taken' && !errors.handle ? 'Taken' : 'Not valid'}
    </span>
  ) : handleStatus.state === 'available' ? (
    <span className="flex items-center gap-1 font-mono text-metadata font-semibold text-success-text">
      <CheckCircleIcon className="size-3.5" />
      Available
    </span>
  ) : handleStatus.state === 'checking' ? (
    <span className="font-mono text-metadata text-text-secondary">Checking…</span>
  ) : undefined;
  const handleHint = `${LIMITS.HANDLE_MIN}–${LIMITS.HANDLE_MAX} characters: lowercase letters, numbers and underscores.`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    // A blank Display name is not an error: the Ranch is simply named after the call sign.
    const { displayName, ...rest } = values;
    const parsed = signUpSchema.safeParse({
      ...rest,
      ...(displayName.trim() ? { displayName } : {}),
      acceptTerms: ageOk && termsOk,
      ...(invite ? { invite: invite.code } : {}),
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      // The schema has one box; the page has two, so say which one is missing.
      if (next.acceptTerms) {
        if (!ageOk) next.age = AGE_MESSAGE;
        if (termsOk) delete next.acceptTerms;
        else next.acceptTerms = TERMS_MESSAGE;
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
        <h1 className="text-heading font-bold tracking-tight text-text-primary">Start your Howdy journey</h1>
        <p className="text-caption font-normal text-text-secondary">
          Claim your unique username and connect instantly.
        </p>
      </div>
      {invite && (
        // Says exactly what will happen, and nothing more is granted (ADR-045).
        <p className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-caption font-normal text-text-primary">
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
      <Input
        look="entry"
        label="Username"
        labelAction={handleNote}
        name="handle"
        prefix="@"
        placeholder="yourname"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={LIMITS.HANDLE_MAX}
        value={values.handle}
        onChange={onHandleChange}
        error={handleError}
        hint={handleError ? undefined : handleHint}
      />
      <Input
        look="entry"
        label="Display name"
        labelAction={
          <span className="font-mono text-metadata tracking-wider text-text-secondary uppercase">
            Optional
          </span>
        }
        name="displayName"
        placeholder="e.g. Priya Sharma"
        autoComplete="name"
        value={values.displayName}
        onChange={set('displayName')}
        error={errors.displayName}
      />
      <Input
        look="entry"
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@example.com"
        value={values.email}
        onChange={onEmailChange}
        onBlur={checkEmail}
        error={errors.email}
      />
      <PasswordInput
        look="entry"
        label="Password"
        name="password"
        placeholder="Create a strong password"
        autoComplete="new-password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        hint={<PasswordChecklist password={values.password} email={values.email} handle={values.handle} />}
      />
      <ConsentBoxes
        age={ageOk}
        terms={termsOk}
        onAge={(v) => {
          setAgeOk(v);
          if (v) setErrors(({ age: _, ...others }) => others);
        }}
        onTerms={(v) => {
          setTermsOk(v);
          if (v) setErrors(({ acceptTerms: _, ...others }) => others);
        }}
        ageError={errors.age}
        termsError={errors.acceptTerms}
      />
      <Button type="submit" fullWidth loading={busy} className="min-h-12">
        {busy ? (
          'Creating account…'
        ) : (
          <>
            Create free account
            <ArrowRightIcon className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
