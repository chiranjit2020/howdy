'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, ConfirmationDialog } from '@/ui/primitives';
import { IdentityCheck, identityReady, type IdentityCheckProps } from './identity-check';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * "Burn the Deed" (ADR-027): close my account and have it deleted after 14 days. Asks for the password (or a Google
 * confirmation, for someone with no password), then confirms once more. Afterwards every session is gone, so this card
 * simply says what happens next.
 */
export function DeleteAccount({ identity }: { identity: Omit<IdentityCheckProps, 'next'> }) {
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [deleteOn, setDeleteOn] = useState<string | undefined>();

  function ask(e: FormEvent) {
    e.preventDefault();
    if (identity.hasPassword && !password) return setError('Enter your password.');
    setError(undefined);
    setConfirming(true);
  }

  async function burn() {
    setBusy(true);
    const res = await apiRequest<{ deleteOn: string }>('POST', '/api/me/delete-account', { password });
    setBusy(false);
    setConfirming(false);
    setPassword('');
    if (res.ok && res.data) setDeleteOn(res.data.deleteOn);
    else setError(res.error?.fields?.password ?? res.error?.message ?? 'That did not work. Try again.');
  }

  if (deleteOn) {
    return (
      <ClayCard className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">Your account is closed</h2>
        <FormMessage tone="success">
          It will be deleted for good on {longDate(deleteOn)}. Changed your mind? Log in before then and
          choose &ldquo;Keep my account&rdquo;. We have emailed you the same.
        </FormMessage>
        <Link href="/" className="inline-flex min-h-11 items-center self-start">
          Back to the Gate
        </Link>
      </ClayCard>
    );
  }

  return (
    <ClayCard id="delete" className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-title text-text-primary">Delete account</h2>
      <p className="text-caption text-text-secondary">
        Delete your account. It closes at once: you are signed out everywhere and your profile disappears.
        After 14 days it is deleted for good, with your posts, messages, friends and photo. Until then,
        stepping inside lets you keep it.
      </p>
      <form onSubmit={ask} noValidate className="flex flex-col gap-3">
        <IdentityCheck
          {...identity}
          next="/settings/account#delete"
          password={password}
          onPassword={setPassword}
          error={error}
        />
        {identityReady(identity) && (
          <Button type="submit" variant="danger" className="self-start">
            Delete my account…
          </Button>
        )}
      </form>
      <ConfirmationDialog
        open={confirming}
        destructive
        title="Delete your account?"
        description="You will be signed out everywhere and your profile will disappear now. In 14 days everything is deleted for good."
        confirmLabel="Yes, delete it"
        loading={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={burn}
      />
    </ClayCard>
  );
}
