'use client';

import { useState } from 'react';
import type { MyInvite } from '@/modules/invites';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { RailCard } from '@/ui/howdy/rail-card';
import { Button, ConfirmationDialog } from '@/ui/primitives';

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
        await navigator.share({ title: 'Howdy', text: 'Join me on Howdy.', url: link });
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
    <RailCard id="invite-friends" title="Invite friends">
      <p className="text-caption text-text-secondary">
        Whoever joins with your link sends you a friend request once they confirm their email. You decide.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <p className="rounded-md bg-surface-sunken px-3 py-2 font-mono text-caption [overflow-wrap:anywhere] text-text-primary">
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
    </RailCard>
  );
}
