'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { ChevronDownIcon } from '@/ui/icons';
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
import { ReportDialog } from './report-dialog';
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
}: {
  handle: string;
  displayName: string;
  initial: RelationshipState;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rel, setRel] = useState(initial);
  const [busy, setBusy] = useState<RelationshipAction | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirm, setConfirm] = useState<'block' | 'leave' | undefined>();
  const [reporting, setReporting] = useState(false);

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
    <ClayCard className="flex flex-col gap-4">
      <h2 className="text-title text-text-primary">You and {displayName}</h2>
      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="flex flex-wrap items-center gap-3">
        {rel.posse === 'none' && (
          <Button loading={busy === 'request'} onClick={() => run('request')}>
            Ask to join Posse
          </Button>
        )}
        {rel.posse === 'sent' && (
          <>
            <Badge tone="info">Requested</Badge>
            <Button variant="secondary" size="sm" loading={busy === 'cancel'} onClick={() => run('cancel')}>
              Cancel request
            </Button>
          </>
        )}
        {rel.posse === 'received' && (
          <>
            <span className="text-body text-text-secondary">@{handle} asked to join your Posse.</span>
            <Button loading={busy === 'accept'} onClick={() => run('accept')}>
              Accept
            </Button>
            <Button variant="secondary" loading={busy === 'decline'} onClick={() => run('decline')}>
              Decline
            </Button>
          </>
        )}
        {rel.posse === 'member' && (
          <>
            <Badge tone="success">In your Posse</Badge>
            <Link href={`/whispers/${handle}`} className={buttonClasses()}>
              Whisper
            </Link>
            <Chip selected={rel.closeByMe} onSelect={() => run(rel.closeByMe ? 'unclose' : 'close')}>
              Close Posse
            </Chip>
            <Button variant="ghost" size="sm" onClick={() => setConfirm('leave')}>
              Leave Posse
            </Button>
          </>
        )}
        <Chip selected={rel.scouting} onSelect={() => run(rel.scouting ? 'unscout' : 'scout')}>
          Scouting
        </Chip>
        <Dropdown
          label={`More about ${displayName}`}
          align="end"
          trigger={(p) => (
            <Button variant="ghost" size="sm" {...p}>
              More <ChevronDownIcon />
            </Button>
          )}
          items={[
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
            { id: 'report', label: 'Flag trouble…', onSelect: () => setReporting(true) },
            { id: 'block', label: 'Block…', danger: true, onSelect: () => setConfirm('block') },
          ]}
        />
      </div>
      <p className="text-metadata text-text-muted">
        Only you can see Scouting, Close Posse, Mute, Restrict and Block. {displayName} is never told about
        them.
      </p>

      <ConfirmationDialog
        open={confirm === 'block'}
        destructive
        title={`Block @${handle}?`}
        description="You will both disappear from each other. Any Posse, requests and scouting between you end. They are not told."
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
        title="Leave this Posse?"
        description={`You and @${handle} will no longer be in each other's Posse. They are not told.`}
        confirmLabel="Leave Posse"
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
        open={reporting}
        title={`Flag trouble with @${handle}`}
        endpoint="/api/reports"
        extra={{ handle }}
        onClose={() => setReporting(false)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
    </ClayCard>
  );
}
