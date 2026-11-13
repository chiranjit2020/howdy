'use client';

import { useState } from 'react';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard } from '@/ui/primitives';

/**
 * For the Howdy team only (the page shows it to admins): send the scheduled announcement to your own devices first, to
 * see it on your phone. It does not count as the real send.
 */
export function AnnouncementPreview({ body, when }: { body: string; when: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | undefined>();

  async function send() {
    setBusy(true);
    setNote(undefined);
    const res = await postJson<{ devices: number }>('/api/admin/announce-preview', {});
    setBusy(false);
    if (!res.ok || !res.data) {
      setNote({ tone: 'error', text: res.error?.message ?? 'That did not work. Try again.' });
    } else if (res.data.devices === 0) {
      setNote({
        tone: 'error',
        text: 'Nothing was sent: notifications are not on for this account. Switch them on above, then try again.',
      });
    } else {
      setNote({
        tone: 'success',
        text: `Sent to ${res.data.devices === 1 ? 'your device' : `your ${res.data.devices} devices`}. Check your phone.`,
      });
    }
  }

  return (
    <ClayCard className="flex flex-col gap-3">
      <h2 className="text-title text-text-primary">Team: scheduled announcement</h2>
      <p className="text-caption text-text-secondary">
        Goes to everyone with notifications on, {when}. Send it to yourself first to see how it looks.
      </p>
      <blockquote className="rounded-md bg-surface-sunken p-3 text-caption text-text-primary">
        <span className="font-semibold">Howdy</span>
        <br />
        {body}
      </blockquote>
      {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
      <Button size="sm" className="self-start" loading={busy} onClick={() => void send()}>
        Send it to me
      </Button>
    </ClayCard>
  );
}
