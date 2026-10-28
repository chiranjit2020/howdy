'use client';

import Link from 'next/link';
import { useState } from 'react';
import { postJson } from '@/ui/auth/api';
import { EntryHeading } from '@/ui/auth/entry-shell';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, buttonClasses } from '@/ui/primitives';

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
      <>
        <EntryHeading title="Account created">Your email is confirmed. Welcome to Howdy.</EntryHeading>
        <Link href="/login" className={buttonClasses({ fullWidth: true })}>
          Log in
        </Link>
      </>
    );
  }

  return (
    <>
      <EntryHeading title="Confirm your email">One tap and your account is ready.</EntryHeading>
      {state === 'failed' && (
        <FormMessage tone="error" focusKey={1}>
          {message} <Link href="/login">Log in</Link> and we can send a new link.
        </FormMessage>
      )}
      <Button fullWidth onClick={confirm} loading={state === 'busy'}>
        Confirm my email
      </Button>
    </>
  );
}
