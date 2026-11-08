'use client';

import Link from 'next/link';
import { useState, type ComponentType, type FormEvent } from 'react';
import type { IconBaseProps } from 'react-icons';
import { PiBug, PiChatCircle, PiLightbulb } from 'react-icons/pi';
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  type FeedbackKind,
} from '@/shared/validation/feedback';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { CheckCircleIcon } from '@/ui/icons';
import { Button, ClayCard, Textarea, buttonClasses } from '@/ui/primitives';

const KIND_ICON: Record<FeedbackKind, ComponentType<IconBaseProps>> = {
  idea: PiLightbulb,
  broken: PiBug,
  other: PiChatCircle,
};

const PLACEHOLDER: Record<FeedbackKind, string> = {
  idea: 'What would make Howdy better for you?',
  broken: 'What happened, and what did you expect instead?',
  other: 'Tell us anything.',
};

/**
 * The feedback form: what kind (three tiles, sunflower when chosen), the words, and Send. Text only. After sending,
 * a calm thank-you replaces the form.
 */
export function FeedbackForm({ page }: { page?: string }) {
  const [kind, setKind] = useState<FeedbackKind | undefined>();
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(undefined);
    if (!kind) return setErrors({ kind: 'Choose what kind of feedback it is.' });
    if (!body.trim()) return setErrors({ body: 'Write a few words first.' });
    setBusy(true);
    const res = await apiRequest('POST', '/api/feedback', { kind, body, ...(page ? { page } : {}) });
    setBusy(false);
    if (res.ok) setSent(true);
    else if (res.error?.fields && Object.keys(res.error.fields).length > 0) setErrors(res.error.fields);
    else setFormError(res.error?.message ?? 'That did not send. Try again.');
  }

  if (sent) {
    return (
      <ClayCard className="flex flex-col items-start gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-primary text-title text-on-primary">
          <CheckCircleIcon />
        </span>
        <h2 className="text-title text-text-primary">Thanks, we got it.</h2>
        <p className="text-body text-text-secondary">
          We read every message. If we need to know more, we’ll get in touch.
        </p>
        <Link href={page ?? '/home'} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          Back to Howdy
        </Link>
      </ClayCard>
    );
  }

  return (
    <ClayCard>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        <div className="flex flex-col gap-2">
          <p id="feedback-kind" className="text-caption font-semibold text-text-primary">
            What is it about?
          </p>
          <div role="group" aria-labelledby="feedback-kind" className="grid grid-cols-3 gap-2">
            {FEEDBACK_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              const chosen = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-caption transition-colors',
                    chosen
                      ? 'bg-primary font-semibold text-on-primary'
                      : 'bg-surface-sunken font-medium text-text-primary hover:bg-border',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {FEEDBACK_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
          {errors.kind && (
            <p role="alert" className="text-caption font-medium text-danger">
              {errors.kind}
            </p>
          )}
        </div>
        <Textarea
          label="Your message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={FEEDBACK_MAX}
          showCount
          rows={5}
          placeholder={kind ? PLACEHOLDER[kind] : 'Choose a kind above, then write here.'}
          error={errors.body}
        />
        <p className="text-metadata text-text-secondary">
          Sent from your account{page ? `, with the page you were on (${page})` : ''}. Please don’t include
          passwords or other people’s private messages.
        </p>
        <Button type="submit" loading={busy} className="self-start">
          Send feedback
        </Button>
      </form>
    </ClayCard>
  );
}
