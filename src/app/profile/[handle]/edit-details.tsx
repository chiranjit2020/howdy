'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { MyDetails } from '@/modules/profiles';
import {
  audiencesFor,
  DETAIL_LABEL,
  DETAIL_TEXT_MAX,
  EMAIL_MAX,
  MONTHS,
  PHONE_MAX,
  RELATIONSHIP_LABEL,
  RELATIONSHIPS,
  SOCIAL_LABEL,
  SOCIALS,
  WEBSITE_MAX,
  type DetailAudience,
  type DetailKey,
  type Relationship,
  type Social,
  type TextDetail,
} from '@/shared/validation/details';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { PencilIcon } from '@/ui/icons';
import { Button, Input, Modal, Select, useToast } from '@/ui/primitives';

const PLACEHOLDER: Record<TextDetail, string> = {
  livesIn: 'Kolkata',
  hometown: 'Siliguri',
  work: 'Designer at a studio',
  education: 'Jadavpur University',
  languages: 'Bengali, Hindi, English',
};

const SOCIAL_PLACEHOLDER: Record<Social, string> = {
  instagram: '@username',
  linkedin: 'your-name',
  x: '@username',
  youtube: '@channel',
  facebook: 'your.name',
};

/**
 * The picker's own words: short, so it fits at the end of a label row in half a popup. "Everyone" stands for Everyone on
 * Howdy (signed-out visitors never see details), so it can only ever overstate who sees a detail, never understate it.
 */
const PICKER_LABEL: Record<DetailAudience, string> = {
  members: 'Everyone',
  posse: 'Friends',
  only_me: 'Only me',
};

/** What a screen reader hears for each detail's audience picker. */
const WHO: Record<DetailKey, string> = {
  livesIn: 'Who sees where you live',
  hometown: 'Who sees where you are from',
  work: 'Who sees your work',
  education: 'Who sees your education',
  birthday: 'Who sees your birthday',
  languages: 'Who sees your languages',
  relationship: 'Who sees your relationship',
  website: 'Who sees your website',
  email: 'Who sees your email',
  phone: 'Who sees your phone number',
  socials: 'Who sees your social profiles',
};

/** Everything the form holds, as the person typed it. */
interface Values {
  text: Record<TextDetail, string>;
  day: string;
  month: string;
  relationship: Relationship | '';
  website: string;
  email: string;
  phone: string;
  socials: Record<Social, string>;
  audience: Record<DetailKey, DetailAudience>;
}

const valuesOf = (d: MyDetails): Values => ({
  text: {
    livesIn: d.livesIn ?? '',
    hometown: d.hometown ?? '',
    work: d.work ?? '',
    education: d.education ?? '',
    languages: d.languages ?? '',
  },
  day: d.birthday ? String(d.birthday.day) : '',
  month: d.birthday ? String(d.birthday.month) : '',
  relationship: d.relationship ?? '',
  website: d.website ?? '',
  email: d.email ?? '',
  phone: d.phone ?? '',
  socials: Object.fromEntries(SOCIALS.map((s) => [s, d.socials[s] ?? ''])) as Record<Social, string>,
  audience: d.audience,
});

/**
 * Four short steps instead of one long form. Each saves only its own details, so closing part-way keeps what was saved,
 * and "Skip" moves on changing nothing.
 */
const STEPS = [
  { id: 'about', title: 'About you', keys: ['livesIn', 'hometown', 'work', 'education'] },
  { id: 'personal', title: 'Personal', keys: ['birthday', 'languages', 'relationship'] },
  { id: 'contact', title: 'Contact', keys: ['website', 'email', 'phone'] },
  { id: 'social', title: 'Social', keys: ['socials'] },
] as const satisfies readonly { id: string; title: string; keys: readonly DetailKey[] }[];

/** The PATCH body for one step: its details and their audiences, nothing else. */
function payloadFor(step: number, v: Values): Record<string, unknown> {
  const keys: readonly DetailKey[] = STEPS[step]!.keys;
  const body: Record<string, unknown> = {
    audience: Object.fromEntries(keys.map((k) => [k, v.audience[k]])),
  };
  for (const k of keys) {
    if (k === 'birthday')
      body.birthday = v.day && v.month ? { day: Number(v.day), month: Number(v.month) } : null;
    else if (k === 'relationship') body.relationship = v.relationship || null;
    else if (k === 'socials') body.socials = v.socials;
    else if (k === 'website' || k === 'email' || k === 'phone') body[k] = v[k];
    else body[k] = v.text[k];
  }
  return body;
}

/** Server field names to the form's: "birthday.day" → birthday, "socials.x" → x, "audience.email" → email. */
const fieldOf = (path: string) => {
  const [head, next] = path.split('.');
  return head === 'socials' || head === 'audience' ? (next ?? head!) : head!;
};

/**
 * Your personal details, edited on your profile, in four steps: About you, Personal, Contact, Social profiles. Each
 * detail has its "who sees it" at the end of its label row (a phone number and email: Friends or Only me). Empty means
 * not shown. The server checks everything again.
 */
export function EditDetails({
  initial,
  label,
  look = 'button',
}: {
  initial: MyDetails;
  label: string;
  /** A small link-style button at the end of the profile's intro line, or an ordinary secondary button. */
  look?: 'button' | 'link';
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // What the server has (to tell an edited step from an untouched one, and to undo a skipped one), and the form.
  const [saved, setSaved] = useState<Values>(() => valuesOf(initial));
  const [v, setV] = useState<Values>(saved);
  const [changed, setChanged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const last = step === STEPS.length - 1;
  const dirty = JSON.stringify(payloadFor(step, v)) !== JSON.stringify(payloadFor(step, saved));

  function start() {
    setV(saved);
    setStep(0);
    setErrors({});
    setFormError(undefined);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    if (changed) {
      toast({ title: 'Details saved.', tone: 'success' });
      router.refresh();
      setChanged(false);
    }
  }
  function go(to: number) {
    setErrors({});
    setFormError(undefined);
    if (to >= STEPS.length) close();
    else setStep(to);
  }

  /** Save this step if it changed, then go to `to` (past the last step: close). */
  async function saveThen(to: number) {
    setErrors({});
    setFormError(undefined);
    if (STEPS[step]!.id === 'personal' && Boolean(v.day) !== Boolean(v.month)) {
      setErrors({ birthday: 'Choose both the day and the month, or neither.' });
      return;
    }
    if (dirty) {
      setBusy(true);
      const res = await apiRequest<{ details: MyDetails }>('PATCH', '/api/me/details', payloadFor(step, v));
      setBusy(false);
      if (!res.ok || !res.data) {
        if (res.error?.fields && Object.keys(res.error.fields).length > 0)
          setErrors(Object.fromEntries(Object.entries(res.error.fields).map(([k, m]) => [fieldOf(k), m])));
        else setFormError(res.error?.message ?? 'That did not save. Try again.');
        return;
      }
      // The server's own wording (a pasted link becomes its handle, "example.com" gets its https://), for every step,
      // keeping what is still being typed in the others.
      const fresh = valuesOf(res.data.details);
      setSaved(fresh);
      setV((cur) => mergeStep(step, cur, fresh));
      setChanged(true);
    }
    go(to);
  }

  /** "Skip": this step's edits are dropped, nothing is saved. */
  function skip() {
    setV((cur) => mergeStep(step, cur, saved));
    go(step + 1);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void saveThen(step + 1);
  }

  const audience = (key: DetailKey) => (
    <select
      aria-label={WHO[key]}
      value={v.audience[key]}
      onChange={(e) =>
        setV((cur) => ({ ...cur, audience: { ...cur.audience, [key]: e.target.value as DetailAudience } }))
      }
      className="min-h-11 rounded-md border border-border bg-surface px-2 text-metadata text-text-secondary pointer-fine:min-h-7"
    >
      {audiencesFor(key).map((a) => (
        <option key={a} value={a}>
          {PICKER_LABEL[a]}
        </option>
      ))}
    </select>
  );
  const text = (key: TextDetail) => (
    <Input
      key={key}
      label={DETAIL_LABEL[key]}
      labelAction={audience(key)}
      value={v.text[key]}
      onChange={(e) => setV((cur) => ({ ...cur, text: { ...cur.text, [key]: e.target.value } }))}
      maxLength={DETAIL_TEXT_MAX}
      placeholder={PLACEHOLDER[key]}
      error={errors[key]}
    />
  );

  const fields: Record<(typeof STEPS)[number]['id'], ReactNode> = {
    about: <div className="grid gap-3 sm:grid-cols-2">{STEPS[0].keys.map(text)}</div>,
    personal: (
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-caption font-semibold text-text-primary">
              Birthday <span className="font-normal text-text-secondary">· never the year</span>
            </legend>
            {audience('birthday')}
          </div>
          <div className="flex gap-2">
            <Select
              label="Day"
              hideLabel
              value={v.day}
              onChange={(e) => setV((cur) => ({ ...cur, day: e.target.value }))}
              className="w-24"
              aria-invalid={errors.birthday ? true : undefined}
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </Select>
            <Select
              label="Month"
              hideLabel
              value={v.month}
              onChange={(e) => setV((cur) => ({ ...cur, month: e.target.value }))}
              className="min-w-0 flex-1"
              aria-invalid={errors.birthday ? true : undefined}
            >
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          {errors.birthday && (
            <p role="alert" className="text-caption font-medium text-danger">
              {errors.birthday}
            </p>
          )}
        </fieldset>
        {text('languages')}
        <Select
          label={DETAIL_LABEL.relationship}
          labelAction={audience('relationship')}
          value={v.relationship}
          onChange={(e) => setV((cur) => ({ ...cur, relationship: e.target.value as Relationship | '' }))}
          error={errors.relationship}
        >
          <option value="">Not shown</option>
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABEL[r]}
            </option>
          ))}
        </Select>
      </div>
    ),
    contact: (
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={DETAIL_LABEL.website}
          labelAction={audience('website')}
          className="sm:col-span-2"
          type="url"
          inputMode="url"
          autoComplete="url"
          value={v.website}
          onChange={(e) => setV((cur) => ({ ...cur, website: e.target.value }))}
          maxLength={WEBSITE_MAX}
          placeholder="example.com"
          error={errors.website}
        />
        <Input
          label={DETAIL_LABEL.email}
          labelAction={audience('email')}
          type="email"
          autoComplete="email"
          value={v.email}
          onChange={(e) => setV((cur) => ({ ...cur, email: e.target.value }))}
          maxLength={EMAIL_MAX}
          placeholder="you@example.com"
          error={errors.email}
        />
        <Input
          label={DETAIL_LABEL.phone}
          labelAction={audience('phone')}
          type="tel"
          autoComplete="tel"
          value={v.phone}
          onChange={(e) => setV((cur) => ({ ...cur, phone: e.target.value }))}
          maxLength={PHONE_MAX}
          placeholder="+91 98765 43210"
          error={errors.phone}
        />
        <p className="text-metadata text-text-secondary sm:col-span-2">
          Email and phone are only ever for friends or only you, never for everyone.
        </p>
      </div>
    ),
    social: (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-text-secondary">Your username, or paste a link to your profile.</p>
          {audience('socials')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIALS.map((s) => (
            <Input
              key={s}
              label={SOCIAL_LABEL[s]}
              value={v.socials[s]}
              onChange={(e) => setV((cur) => ({ ...cur, socials: { ...cur.socials, [s]: e.target.value } }))}
              maxLength={200}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={SOCIAL_PLACEHOLDER[s]}
              error={errors[s]}
            />
          ))}
        </div>
      </div>
    ),
  };

  return (
    <>
      {look === 'link' ? (
        <button
          type="button"
          onClick={start}
          className="inline-flex min-h-11 items-center gap-1 text-caption font-semibold text-link hover:underline pointer-fine:min-h-0"
        >
          <PencilIcon aria-hidden="true" className="size-3.5" />
          {label}
        </button>
      ) : (
        <Button variant="secondary" size="sm" onClick={start}>
          {label}
        </Button>
      )}
      <Modal open={open} onClose={close} title="Your details">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {/* The steps: where you are, and a way straight to any of them (this one is saved first, if changed). */}
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => i !== step && void saveThen(i)}
                  disabled={busy}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex min-h-11 w-full flex-col gap-1 text-left pointer-fine:min-h-0',
                    i === step ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1 w-full rounded-pill',
                      i <= step ? 'bg-highlight' : 'bg-surface-sunken',
                    )}
                  />
                  <span className="truncate text-metadata font-semibold">
                    <span className="sr-only">
                      Step {i + 1} of {STEPS.length}:{' '}
                    </span>
                    {s.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-caption text-text-secondary">
            All optional. Leave one empty and it isn’t shown.
          </p>
          {formError && <FormMessage tone="error">{formError}</FormMessage>}
          {fields[STEPS[step]!.id]}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void saveThen(step - 1)}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="link" disabled={busy} onClick={skip}>
                Skip
              </Button>
              <Button type="submit" size="sm" loading={busy}>
                {last ? 'Save' : 'Next'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** `cur` with step `step`'s details (and their audiences) taken from `from`. */
function mergeStep(step: number, cur: Values, from: Values): Values {
  const next: Values = { ...cur, text: { ...cur.text }, audience: { ...cur.audience } };
  for (const k of STEPS[step]!.keys as readonly DetailKey[]) {
    next.audience[k] = from.audience[k];
    if (k === 'birthday') {
      next.day = from.day;
      next.month = from.month;
    } else if (k === 'relationship') next.relationship = from.relationship;
    else if (k === 'socials') next.socials = from.socials;
    else if (k === 'website' || k === 'email' || k === 'phone') next[k] = from[k];
    else next.text[k] = from.text[k];
  }
  return next;
}
