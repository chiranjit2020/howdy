'use client';

import { useState } from 'react';
import type { MyInvite } from '@/modules/invites';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Art } from '@/ui/art/glyph';
import { Button, ClayCard, ConfirmationDialog } from '@/ui/primitives';

/**
 * My personal invite link (ADR-045): share it anywhere. Whoever joins through it sends me a Pal request once they confirm
 * their email — nothing more. Resetting it makes the old link stop working.
 */
export function InviteCard({ initial, origin }: { initial: MyInvite; origin: string }) {
  const [invite, setInvite] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const link = `${origin}/i/${invite.code}`;

  async function share() {
    setError(undefined);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Howdy', text: 'Come sit on the porch with me on Howdy.', url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  }

  async function reset() {
    setBusy(true);
    setError(undefined);
    const res = await apiRequest<{ invite: MyInvite }>('POST', '/api/me/invite');
    setBusy(false);
    setConfirming(false);
    if (res.ok && res.data) setInvite(res.data.invite);
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <ClayCard className="flex flex-col gap-3 bg-accent-soft/40">
      <div className="flex items-center gap-3">
        <Art name="mailbox" size="free" className="w-10 shrink-0" />
        <h2 className="text-title text-text-primary">Invite friends to Howdy</h2>
      </div>
      <p className="text-caption text-text-secondary">
        Share your link anywhere. Whoever joins with it sends you a Pal request once they confirm their email
        — you decide whether to accept.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <p className="rounded-md bg-surface px-3 py-2.5 font-mono text-caption [overflow-wrap:anywhere] text-text-primary shadow-clay-pressed">
        {link}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={share}>
          <span aria-live="polite">{copied ? 'Link copied!' : 'Share my link'}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          Reset link…
        </Button>
        {invite.joinedThisWeek > 0 && (
          <span className="text-caption text-text-secondary">
            {invite.joinedThisWeek} joined with it this week
          </span>
        )}
      </div>
      <ConfirmationDialog
        open={confirming}
        title="Reset your invite link?"
        description="You get a new link, and the old one stops working at once. Anyone who already joined with it is unaffected."
        confirmLabel="Reset it"
        loading={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={reset}
      />
    </ClayCard>
  );
}
