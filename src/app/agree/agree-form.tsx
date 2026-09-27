'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ACCEPT_TERMS_MESSAGE } from '@/shared/validation/auth';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button } from '@/ui/primitives';
import { TermsCheckbox } from '@/ui/auth/terms-checkbox';

export function AgreeForm() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checked) {
      setError(ACCEPT_TERMS_MESSAGE);
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    setError(undefined);
    const res = await postJson('/api/me/legal', {});
    if (!res.ok) {
      setBusy(false);
      setError(res.error?.message ?? 'That did not work. Try again.');
      setAttempt((n) => n + 1);
      return;
    }
    router.replace('/home');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && (
        <FormMessage tone="error" focusKey={attempt}>
          {error}
        </FormMessage>
      )}
      <TermsCheckbox checked={checked} onChange={setChecked} invalid={!!error && !checked} />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Agree and carry on
      </Button>
    </form>
  );
}
