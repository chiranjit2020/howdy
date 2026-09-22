'use client';

import Link from 'next/link';
import { useState } from 'react';
import { postJson } from '@/ui/auth/api';
import { Glyph } from '@/ui/art/glyph';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard } from '@/ui/primitives';

/**
 * Confirming needs a deliberate click (a POST), not just opening the link: mail scanners and link previewers fetch
 * URLs automatically and would otherwise burn the one-time token before the person ever sees it.
 */
export function VerifyPanel({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [message, setMessage] = useState<string | undefined>();

  async function confirm() {
    setState('busy');
    const res = await postJson('/api/auth/verify-email', { token });
    if (res.ok) setState('done');
    else {
      setMessage(res.error?.message);
      setState('failed');
    }
  }

  if (state === 'done') {
    return (
      <ClayCard className="flex flex-col items-center gap-3 p-8 text-center">
        <Glyph emoji="📜" size="hero" />
        <h1 className="text-heading text-text-primary">Deed granted!</h1>
        <p className="text-body text-text-secondary">Your email is confirmed. Welcome to Howdy.</p>
        <Link href="/step-inside" className="inline-flex min-h-11 items-center font-semibold">
          Step Inside
        </Link>
      </ClayCard>
    );
  }

  return (
    <ClayCard className="flex flex-col gap-4 p-8">
      <h1 className="text-heading text-text-primary">Confirm your email</h1>
      <p className="text-body text-text-secondary">One tap and your claim is official.</p>
      {state === 'failed' && (
        <FormMessage tone="error" focusKey={1}>
          {message} <Link href="/step-inside">Step Inside</Link> and we can send a new link.
        </FormMessage>
      )}
      <Button size="lg" fullWidth onClick={confirm} loading={state === 'busy'}>
        Confirm my email
      </Button>
    </ClayCard>
  );
}
