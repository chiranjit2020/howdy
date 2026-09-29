'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Art } from '@/ui/art/glyph';
import { MoreIcon } from '@/ui/icons';
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
}: {
  handle: string;
  displayName: string;
  initial: RelationshipState;
  /** The Howdy team account: it cannot be blocked (the server refuses too), so Block is not offered. */
  official?: boolean;
  /** They have a photo I can see: offer to flag the photo itself (ADR-025). */
  hasPhoto?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rel, setRel] = useState(initial);
  const [busy, setBusy] = useState<RelationshipAction | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirm, setConfirm] = useState<'block' | 'leave' | undefined>();
  const [reporting, setReporting] = useState<'person' | 'photo' | false>(false);

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
        {rel.posse === 'member' && <Badge tone="success">Pals</Badge>}
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
              ? [{ id: 'leave', label: 'Stop being Pals…', onSelect: () => setConfirm('leave') }]
              : []),
            {
              id: 'mute',
              label: rel.muted ? 'Turn the noise back up' : 'Turn down the noise',
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
          Ask to be Pals
        </Button>
      )}
      {rel.posse === 'sent' && (
        <Button variant="secondary" fullWidth loading={busy === 'cancel'} onClick={() => run('cancel')}>
          Cancel request
        </Button>
      )}
      {rel.posse === 'received' && (
        <>
          <p className="text-body text-text-secondary">@{handle} wants to be your Pal.</p>
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
        <Link href={`/whispers/${handle}`} className={buttonClasses({ fullWidth: true })}>
          <Art name="nav-whispers" size="free" className="size-6" /> Whisper
        </Link>
      )}

      {/* The private toggles: same shape, side by side. */}
      <div className="flex flex-wrap gap-2">
        {rel.posse === 'member' && (
          <Chip selected={rel.closeByMe} onSelect={() => run(rel.closeByMe ? 'unclose' : 'close')}>
            Close Pal
          </Chip>
        )}
        <Chip selected={rel.scouting} onSelect={() => run(rel.scouting ? 'unscout' : 'scout')}>
          Scouting
        </Chip>
      </div>
      <p className="text-metadata text-text-muted">
        Only you can see Scouting, Close Pal, Mute{official ? ' and Restrict' : ', Restrict and Block'}.{' '}
        {displayName} is never told about them.
      </p>

      <ConfirmationDialog
        open={confirm === 'block'}
        destructive
        title={`Block @${handle}?`}
        description="You will both disappear from each other. If you are Pals, that ends, along with any requests and scouting between you. They are not told."
        confirmLabel="Block"
        loading={busy === 'block'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() =>
          run('block', () => {
            setConfirm(undefined);
            toast({
              title: `@${handle} is blocked`,
              description: 'You can undo this in the Workshop.',
              tone: 'success',
            });
            router.push('/home');
          })
        }
      />
      <ConfirmationDialog
        open={confirm === 'leave'}
        title="Stop being Pals?"
        description={`You and @${handle} will no longer be Pals. They are not told.`}
        confirmLabel="Stop being Pals"
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
