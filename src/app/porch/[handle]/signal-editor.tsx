'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import { setSignalSchema } from '@/shared/validation/profile';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, Textarea } from '@/ui/primitives';

/**
 * Owner-only: set or remove the Signal. It expires 12 hours after it is set. The live Signal is shown in its own card
 * above, so this box is only for writing a new one: it starts empty and empties again once a Signal is set.
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
        <h2 className="text-title text-text-primary">Your Signal</h2>
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        <Textarea
          label="What is the vibe right now?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.SIGNAL_MAX}
          showCount
          rows={2}
          error={fieldError}
          hint="Fades after 12 hours. Plain text only, no links."
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy === 'set'}>
            Set Signal
          </Button>
          {current && (
            <Button variant="secondary" loading={busy === 'clear'} onClick={remove}>
              Remove Signal
            </Button>
          )}
        </div>
      </form>
    </ClayCard>
  );
}
