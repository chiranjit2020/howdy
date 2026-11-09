'use client';

import { useState } from 'react';
import type { MyInvite } from '@/modules/invites';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { RAIL_TEXT, RailCard } from '@/ui/howdy/rail-card';
import { Button, ConfirmationDialog } from '@/ui/primitives';

/**
 * My personal invite link (ADR-045): share it anywhere. Whoever joins through it sends me a Pal request once they confirm
 * their email — nothing more. Resetting it makes the old link stop working.
 */
export function InviteCard({
  initial,
  origin,
  id = 'invite-friends',
}: {
  initial: MyInvite;
  origin: string;
  /** The heading's id; a page that renders the card twice (phone and wide layouts) gives each its own. */
  id?: string;
}) {
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

  // Short (2026-11-10): one line of words, the link and Share on one row, Reset and the week's count in the foot.
  return (
    <RailCard
      id={id}
      title="Invite someone new"
      foot={
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span>{invite.joinedThisWeek > 0 ? `${invite.joinedThisWeek} joined with it this week` : ''}</span>
          <Button size="sm" variant="link" className="-mx-1" onClick={() => setConfirming(true)}>
            Reset link…
          </Button>
        </div>
      }
    >
      <p className={RAIL_TEXT}>When they join, you get their request.</p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-md bg-surface-sunken px-3 py-2 font-mono text-caption text-text-primary">
          {/* Shown without https:// so more of it fits; Share sends the whole link. */}
          {link.replace(/^https?:\/\//, '')}
        </p>
        <Button size="sm" className="shrink-0" onClick={share}>
          <span aria-live="polite">{copied ? 'Copied!' : 'Share'}</span>
        </Button>
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
