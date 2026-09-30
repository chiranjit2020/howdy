'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { MemberPage, MemberRef, TownHallDetail } from '@/modules/town-halls';
import { LIMITS } from '@/shared/limits';
import { handleParamSchema } from '@/shared/validation/profile';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { TownHallCard } from '@/ui/howdy';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { Avatar, Button, ClayCard, ConfirmationDialog, EmptyState, Input, useToast } from '@/ui/primitives';

export function TownHallDetailView({
  townHall,
  initialMembers,
}: {
  townHall: TownHallDetail;
  initialMembers: MemberPage | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [members, setMembers] = useState<MemberRef[]>(initialMembers?.members ?? []);
  const [next, setNext] = useState<string | null>(initialMembers?.nextCursor ?? null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  // The list is this component's own state (it grows with "More members"), so a removal is applied here as well as
  // on the server; refreshing the page alone would not reset it.
  const removed = (handle: string) => {
    setMembers((all) => all.filter((m) => m.handle !== handle));
    router.refresh();
  };

  async function act(action: 'join' | 'leave' | 'accept' | 'decline') {
    setBusy(action);
    setError(undefined);
    const res = await apiRequest('POST', `/api/town-halls/${townHall.id}`, { action });
    setBusy(undefined);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  async function loadMore() {
    if (!next) return;
    setBusy('more');
    const res = await apiRequest<MemberPage>('GET', `/api/town-halls/${townHall.id}/members?cursor=${next}`);
    setBusy(undefined);
    if (res.ok && res.data) {
      setMembers((all) => [...all, ...res.data!.members]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load more.');
  }

  async function confirmDeletion() {
    setDeleting(true);
    const res = await apiRequest('DELETE', `/api/town-halls/${townHall.id}`);
    setDeleting(false);
    setConfirmDelete(false);
    if (res.ok) {
      toast({ title: 'Town Hall deleted.', tone: 'success' });
      router.push('/town-halls');
    } else setError(res.error?.message ?? 'Could not delete it.');
  }

  const primaryAction =
    townHall.membership === 'invited' ? (
      <div className="flex gap-2">
        <Button size="sm" loading={busy === 'accept'} onClick={() => act('accept')}>
          Join
        </Button>
        <Button size="sm" variant="secondary" loading={busy === 'decline'} onClick={() => act('decline')}>
          Decline
        </Button>
      </div>
    ) : townHall.membership === 'active' && !townHall.isOwner ? (
      <Button size="sm" variant="secondary" loading={busy === 'leave'} onClick={() => act('leave')}>
        Leave
      </Button>
    ) : townHall.canJoin ? (
      <Button size="sm" loading={busy === 'join'} onClick={() => act('join')}>
        Join
      </Button>
    ) : undefined;

  return (
    <>
      <TownHallCard
        headingLevel={1}
        name={townHall.name}
        description={townHall.description}
        visibility={townHall.visibility}
        joined={townHall.membership === 'active'}
        action={primaryAction}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}

      {townHall.membership === 'active' && (
        <ClayCard className="flex flex-col gap-4">
          <h2 className="text-title text-text-primary">Members</h2>
          {members.length === 0 ? (
            <EmptyState as="h3" icon="🏛️" title="Just you so far" />
          ) : (
            <ul className="flex flex-col gap-3">
              {members.map((m) => (
                <li key={m.handle} className="flex items-center gap-3">
                  <Avatar name={m.displayName} tint={m.portraitTint} src={m.portraitUrl} size="sm" />
                  <span className="min-w-0 flex-1 text-body text-text-primary">
                    {m.displayName} <span className="text-text-secondary">@{m.handle}</span>
                  </span>
                  {m.role === 'owner' && <span className="text-caption text-text-secondary">Owner</span>}
                  {townHall.isOwner && m.role !== 'owner' && (
                    <RemoveMemberButton
                      townHallId={townHall.id}
                      member={m}
                      onRemoved={() => removed(m.handle)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {next && (
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'more'}
              onClick={loadMore}
              className="self-center"
            >
              More members
            </Button>
          )}
        </ClayCard>
      )}

      {!townHall.isOwner && (
        <Button variant="ghost" size="sm" onClick={() => setReporting(true)} className="self-start">
          Flag this Town Hall…
        </Button>
      )}

      {townHall.isOwner && (
        <>
          <InviteForm townHallId={townHall.id} onInvited={() => router.refresh()} />
          <ClayCard className="flex flex-col gap-3">
            <h2 className="text-title text-text-primary">Danger zone</h2>
            <p className="text-caption text-text-secondary">
              Deleting a Town Hall removes it and every membership in it. This cannot be undone.
            </p>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} className="self-start">
              Delete this Town Hall
            </Button>
          </ClayCard>
        </>
      )}

      <ReportDialog
        open={reporting}
        title="Flag this Town Hall"
        endpoint={`/api/reports/town-hall/${townHall.id}`}
        onClose={() => setReporting(false)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
      <ConfirmationDialog
        open={confirmDelete}
        destructive
        title="Delete this Town Hall?"
        description="It is removed for everyone, along with every membership in it. This cannot be undone."
        confirmLabel="Delete it"
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={confirmDeletion}
      />
    </>
  );
}

function InviteForm({ townHallId, onInvited }: { townHallId: string; onInvited: () => void }) {
  const [handle, setHandle] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSent(undefined);
    const cleaned = handle.trim().replace(/^@/, '');
    if (!handleParamSchema.safeParse(cleaned).success) {
      setFieldError('Enter a call sign: 3–24 letters, numbers or underscores.');
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const res = await postJson(`/api/town-halls/${townHallId}/invite`, { handle: cleaned });
    setBusy(false);
    if (res.ok) {
      setSent(cleaned.toLowerCase());
      setHandle('');
      onInvited();
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <ClayCard>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">Invite someone</h2>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {sent && (
          <FormMessage tone="success">Invited @{sent}. They will see it waiting for them.</FormMessage>
        )}
        <Input
          label="Their call sign"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={fieldError}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITS.HANDLE_MAX}
        />
        <Button type="submit" size="sm" loading={busy} className="self-start">
          Send invite
        </Button>
      </form>
    </ClayCard>
  );
}

function RemoveMemberButton({
  townHallId,
  member,
  onRemoved,
}: {
  townHallId: string;
  member: MemberRef;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function confirmRemove() {
    setBusy(true);
    const res = await apiRequest('DELETE', `/api/town-halls/${townHallId}/members/${member.handle}`);
    setBusy(false);
    setConfirming(false);
    if (res.ok) onRemoved();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Remove
      </Button>
      <ConfirmationDialog
        open={confirming}
        destructive
        title={`Remove @${member.handle}?`}
        description="They will no longer be a member of this Town Hall."
        confirmLabel="Remove"
        loading={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={confirmRemove}
      />
    </>
  );
}
