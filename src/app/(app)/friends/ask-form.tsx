'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { handleParamSchema } from '@/shared/validation/profile';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { RailCard } from '@/ui/howdy/rail-card';
import { Button, Input } from '@/ui/primitives';

/**
 * Ask someone to join your Posse by call sign. It works for private Ranches too (which you cannot open), and it always
 * answers the same way, so it never reveals whether a call sign exists.
 */
export function AskForm({ id = 'ask-by-username' }: { id?: string }) {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [sent, setSent] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setSent(undefined);
    const cleaned = handle.trim().replace(/^@/, '');
    if (!handleParamSchema.safeParse(cleaned).success) {
      setFieldError('Enter a username: 3–24 letters, numbers or underscores.');
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const res = await postJson('/api/pals/ask', { handle: cleaned });
    setBusy(false);
    if (res.ok) {
      setSent(cleaned.toLowerCase());
      setHandle('');
      router.refresh();
    } else setFormError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <RailCard id={id} title="Send a friend request">
      <p className="text-caption text-text-secondary">
        Type their username (it&apos;s under their name, after the @) and we&apos;ll send them a request.
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        {sent && (
          <FormMessage tone="success">
            If @{sent} is out there, your request is on its way. Requests stay private until they say yes.
          </FormMessage>
        )}
        <Input
          label="Their username"
          hideLabel
          prefix="@"
          placeholder="username"
          name="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={fieldError}
          autoCapitalize="none"
          spellCheck={false}
          hint="Works for private profiles too."
        />
        <Button type="submit" size="sm" loading={busy} fullWidth>
          Send request
        </Button>
      </form>
    </RailCard>
  );
}
