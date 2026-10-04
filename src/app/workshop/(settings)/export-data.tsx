'use client';

import { useState, type FormEvent } from 'react';
import type { ApiError } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, Input } from '@/ui/primitives';

/** The file name the server chose (Content-Disposition), or a plain fallback. */
function fileNameOf(res: Response): string {
  const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
  return match?.[1] ?? 'howdy-data.zip';
}

/**
 * "Download my data" (ADR-037): a ZIP with everything I gave Howdy and what it shows me, built on the spot. Asks for the
 * password again (a phone left signed in must not be enough), then saves the file.
 */
export function ExportData() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  async function download(e: FormEvent) {
    e.preventDefault();
    if (!password) return setError('Enter your password.');
    setError(undefined);
    setDone(false);
    setBusy(true);
    try {
      const res = await fetch('/api/me/export', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: ApiError } | null;
        setError(body?.error?.fields?.password ?? body?.error?.message ?? 'That did not work. Try again.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameOf(res);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPassword('');
      setDone(true);
    } catch {
      setError('Could not reach Howdy. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClayCard className="flex flex-col gap-3">
      <h2 className="text-title text-text-primary">Download my data</h2>
      <p className="text-caption text-text-secondary">
        A ZIP with your account, settings, Pals, Post Cards, Whispers from the last week, Tributes, Capsules,
        Town Hall posts and your photos. Other people appear only as Howdy already shows them to you.
      </p>
      <form onSubmit={download} noValidate className="flex flex-col gap-3">
        <Input
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" variant="secondary" loading={busy} className="self-start">
          Download my data
        </Button>
      </form>
      {done && <FormMessage tone="success">Your download has started.</FormMessage>}
    </ClayCard>
  );
}
