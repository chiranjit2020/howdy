'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { MoreIcon, WhisperIcon } from '@/ui/icons';
import {
  Badge,
  Button,
  buttonClasses,
  Chip,
  ClayCard,
  ConfirmationDialog,
  Dropdown,
  useToast,
} from '@/ui/primitives';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { SwitchButton } from '@/ui/primitives/controls';
import type { RelationshipAction } from '@/shared/validation/relationships';

export interface RelationshipState {
  posse: 'none' | 'sent' | 'received' | 'member';
  closeByMe: boolean;
  scouting: boolean;
  muted: boolean;
  restricted: boolean;
  blocked: boolean;
}

/** What I can do about my relationship with this person. Every button sends one `{ action }`; the server decides. */
export function RelationshipBar({
  handle,
  displayName,
  initial,
  official = false,
  hasPhoto = false,
  canFollow = false,
  describe,
}: {
  handle: string;
  displayName: string;
  initial: RelationshipState;
  /** "Describe them" (ADR-052), when this viewer may pick a word for them. */
  describe?: ReactNode;
  /** The Howdy team account: it cannot be blocked (the server refuses too), so Block is not offered. */
  official?: boolean;
  /** They have a photo I can see: offer to flag the photo itself (ADR-025). */
  hasPhoto?: boolean;
  /** I may read their wall, so following them would bring their posts to my Home (ADR-053). */
  canFollow?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rel, setRel] = useState(initial);
  const [busy, setBusy] = useState<RelationshipAction | undefined>();
  const closeLabel = useId();
  const closeHint = useId();
  const [error, setError] = useState<string | undefined>();
  const [confirm, setConfirm] = useState<'block' | 'leave' | undefined>();
  const [reporting, setReporting] = useState<'person' | 'photo' | false>(false);
  const friend = rel.posse === 'member';
  const showFollow = rel.scouting || (!friend && canFollow);

  async function run(action: RelationshipAction, then?: () => void) {
    setBusy(action);
    setError(undefined);
    const res = await apiRequest<{ relationship: RelationshipState }>(
      'POST',
      `/api/relationships/${handle}`,
      { action },
    );
    setBusy(undefined);
    if (res.ok && res.data) {
      setRel(res.data.relationship);
      if (then) then();
      else router.refresh();
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <ClayCard className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-title [overflow-wrap:anywhere] text-text-primary">
          You and {displayName}
        </h2>
        {rel.posse === 'member' && <Badge tone="sunflower">Friends</Badge>}
        {rel.posse === 'sent' && <Badge tone="info">Requested</Badge>}
        <Dropdown
          label={`More about ${displayName}`}
          align="end"
          trigger={(p) => (
            <button
              type="button"
              aria-label="More"
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-title text-text-secondary hover:bg-surface-sunken"
              {...p}
            >
              <MoreIcon />
            </button>
          )}
          items={[
            ...(rel.posse === 'member'
              ? [{ id: 'leave', label: 'Stop being friends…', onSelect: () => setConfirm('leave') }]
              : []),
            {
              id: 'mute',
              label: rel.muted ? 'Unmute' : 'Mute',
              onSelect: () => run(rel.muted ? 'unmute' : 'mute'),
            },
            {
              id: 'restrict',
              label: rel.restricted ? 'Lift the restriction' : 'Restrict',
              onSelect: () => run(rel.restricted ? 'unrestrict' : 'restrict'),
            },
            { id: 'report', label: 'Flag trouble…', onSelect: () => setReporting('person') },
            ...(hasPhoto
              ? [{ id: 'report-photo', label: 'Flag their photo…', onSelect: () => setReporting('photo') }]
              : []),
            ...(official
              ? []
              : [{ id: 'block', label: 'Block…', danger: true, onSelect: () => setConfirm('block') }]),
          ]}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}

      {/* One main action, full width. */}
      {rel.posse === 'none' && (
        <Button fullWidth loading={busy === 'request'} onClick={() => run('request')}>
          Ask to be friends
        </Button>
      )}
      {rel.posse === 'sent' && (
        <Button variant="secondary" fullWidth loading={busy === 'cancel'} onClick={() => run('cancel')}>
          Cancel request
        </Button>
      )}
      {rel.posse === 'received' && (
        <>
          <p className="text-body text-text-secondary">@{handle} wants to be your friend.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button loading={busy === 'accept'} onClick={() => run('accept')}>
              Accept
            </Button>
            <Button variant="secondary" loading={busy === 'decline'} onClick={() => run('decline')}>
              Decline
            </Button>
          </div>
        </>
      )}
      {rel.posse === 'member' && (
        <Link href={`/messages/${handle}`} className={buttonClasses({ fullWidth: true })}>
          <WhisperIcon className="size-5" /> Message
        </Link>
      )}

      {/* Friends: Close friend, a switch that says what it does. */}
      {friend && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p id={closeLabel} className="text-body font-semibold text-text-primary">
              Close friend
            </p>
            <p id={closeHint} className="text-caption text-text-secondary">
              Share Stories and Free to talk with close friends only. {displayName} isn’t told.
            </p>
          </div>
          <SwitchButton
            checked={rel.closeByMe}
            onCheckedChange={(on) => run(on ? 'close' : 'unclose')}
            disabled={busy !== undefined}
            aria-labelledby={closeLabel}
            aria-describedby={closeHint}
          />
        </div>
      )}
      {/* Everyone else: Follow, where it brings something (ADR-053). Always there to undo a follow. */}
      {showFollow && !friend && (
        <div className="flex flex-col gap-2">
          <Chip
            selected={rel.scouting}
            onSelect={() => run(rel.scouting ? 'unscout' : 'scout')}
            className="self-start"
          >
            {rel.scouting ? 'Following' : 'Follow'}
          </Chip>
          <p className="text-metadata text-text-muted">
            Follow to see {displayName}’s posts on your Home. Only you can see who you follow, Mute
            {official ? ' and Restrict' : ', Restrict and Block'}. {displayName} is never told about them.
          </p>
        </div>
      )}
      {describe}

      <ConfirmationDialog
        open={confirm === 'block'}
        destructive
        title={`Block @${handle}?`}
        description="You will both disappear from each other. If you are friends, that ends, along with any requests and follows between you. They are not told."
        confirmLabel="Block"
        loading={busy === 'block'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() =>
          run('block', () => {
            setConfirm(undefined);
            toast({
              title: `@${handle} is blocked`,
              description: 'You can undo this in Settings.',
              tone: 'success',
            });
            router.push('/home');
          })
        }
      />
      <ConfirmationDialog
        open={confirm === 'leave'}
        title="Stop being friends?"
        description={`You and @${handle} will no longer be friends. They are not told.`}
        confirmLabel="Stop being friends"
        loading={busy === 'leave'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() =>
          run('leave', () => {
            setConfirm(undefined);
            router.refresh();
          })
        }
      />
      <ReportDialog
        open={reporting !== false}
        title={reporting === 'photo' ? `Flag @${handle}'s photo` : `Flag trouble with @${handle}`}
        endpoint={
          reporting === 'photo' ? `/api/reports/portrait/${encodeURIComponent(handle)}` : '/api/reports'
        }
        {...(reporting === 'photo' ? {} : { extra: { handle } })}
        onClose={() => setReporting(false)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
    </ClayCard>
  );
}
