'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { handleParamSchema } from '@/shared/validation/profile';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, Input } from '@/ui/primitives';

/**
 * Ask someone to join your Posse by call sign. It works for private Ranches too (which you cannot open), and it always
 * answers the same way, so it never reveals whether a call sign exists.
 */
export function AskForm() {
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
      setFieldError('Enter a call sign: 3–24 letters, numbers or underscores.');
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
    <ClayCard>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">Ask someone to be your Pal</h2>
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        {sent && (
          <FormMessage tone="success">
            If @{sent} is out there, your request is on its way. Requests stay private until they say yes.
          </FormMessage>
        )}
        <Input
          label="Their call sign"
          name="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={fieldError}
          autoCapitalize="none"
          spellCheck={false}
          hint="You can ask people whose Porch is private, too."
        />
        <Button type="submit" loading={busy} className="self-start">
          Ask to be Pals
        </Button>
      </form>
    </ClayCard>
  );
}
