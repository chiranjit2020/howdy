'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import { setSignalSchema } from '@/shared/validation/profile';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, Textarea } from '@/ui/primitives';

/**
 * The Howdy team account only: write or remove the "What's new" note that everyone sees on Home (stored as the team
 * account's Signal; members no longer have one). It stays until removed. The box is for a new note: it starts empty and
 * empties again once one is posted; the live note is shown above it.
 */
export function SignalEditor({ current }: { current: string | undefined }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState<'set' | 'clear' | undefined>();

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = setSignalSchema.safeParse({ text });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setBusy('set');
    const res = await apiRequest('PUT', '/api/me/signal', parsed.data);
    setBusy(undefined);
    if (res.ok) {
      setText('');
      router.refresh();
    } else if (res.error?.fields?.text) setFieldError(res.error.fields.text);
    else setFormError(res.error?.message);
  }

  async function remove() {
    setFormError(undefined);
    setBusy('clear');
    const res = await apiRequest('DELETE', '/api/me/signal');
    setBusy(undefined);
    if (res.ok) router.refresh();
    else setFormError(res.error?.message);
  }

  return (
    <ClayCard>
      <form onSubmit={save} noValidate className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">What’s new note</h2>
        {current && (
          <p className="text-caption text-text-secondary">
            Showing on everyone’s Home: <span className="text-text-primary">{current}</span>
          </p>
        )}
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        <Textarea
          label="What’s new on Howdy?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.SIGNAL_MAX}
          showCount
          rows={2}
          error={fieldError}
          hint="Shown on everyone’s Home until you remove it. Plain text only, no links."
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy === 'set'}>
            Post note
          </Button>
          {current && (
            <Button variant="secondary" loading={busy === 'clear'} onClick={remove}>
              Remove note
            </Button>
          )}
        </div>
      </form>
    </ClayCard>
  );
}
