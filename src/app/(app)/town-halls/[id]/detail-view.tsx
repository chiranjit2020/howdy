'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { BanEntry, JoinRequest, MemberPage, MemberRef, TownHallDetail } from '@/modules/town-halls';
import { LIMITS } from '@/shared/limits';
import { handleParamSchema } from '@/shared/validation/profile';
import type { MemberAction } from '@/shared/validation/town-halls';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { TownHallCard } from '@/ui/howdy';
import { MoreIcon } from '@/ui/icons';
import { FeedSection, type InitialFeed, type InitialHeld } from './feed-section';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import {
  Avatar,
  Button,
  ClayCard,
  ConfirmationDialog,
  Dropdown,
  EmptyState,
  Input,
  Switch,
  useToast,
} from '@/ui/primitives';

const ROLE_LABEL = { owner: 'Owner', deputy: 'Deputy', member: undefined } as const;

// A round 44px icon button, like the Pals rows.
const iconButton =
  'inline-flex size-11 items-center justify-center rounded-pill text-title text-text-secondary hover:bg-surface hover:text-text-primary';

export function TownHallDetailView({
  townHall,
  initialMembers,
  initialFeed,
  initialHeld,
  initialRequests,
  initialBans,
}: {
  townHall: TownHallDetail;
  initialMembers: MemberPage | null;
  initialFeed: InitialFeed | null;
  initialHeld: InitialHeld | null;
  /** Waiting join requests: only for the owner and Deputies (ADR-041). */
  initialRequests: JoinRequest[] | null;
  /** Who is banned: only for the owner and Deputies (ADR-042). */
  initialBans: BanEntry[] | null;
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
  const staff = townHall.myRole === 'owner' || townHall.myRole === 'deputy';
  const owner = townHall.myRole === 'owner';

  // The list is this component's own state (it grows with "More members"), so a change is applied here as well as on
  // the server; refreshing the page alone would not reset it.
  const changed = (handle: string, role: MemberRef['role'] | null) => {
    // Handing the Town Hall over changes my own row too, and every control on the page: start again from the server.
    if (role === 'owner') return window.location.reload();
    setMembers((all) =>
      role === null
        ? all.filter((m) => m.handle !== handle)
        : all.map((m) => (m.handle === handle ? { ...m, role } : m)),
    );
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
    ) : townHall.membership === 'active' && !owner ? (
      <Button size="sm" variant="secondary" loading={busy === 'leave'} onClick={() => act('leave')}>
        Leave
      </Button>
    ) : townHall.canJoin ? (
      <Button size="sm" loading={busy === 'join'} onClick={() => act('join')}>
        Join
      </Button>
    ) : townHall.canAsk ? (
      <Button size="sm" loading={busy === 'join'} onClick={() => act('join')}>
        Ask to join
      </Button>
    ) : townHall.membership === 'requested' ? (
      // Never says whether it was answered: a "no" is not announced (ADR-041).
      <Button size="sm" variant="secondary" disabled>
        Requested
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
      {townHall.membership === 'requested' && (
        <p className="text-caption text-text-secondary">
          Your request is with the people who look after this Town Hall. If you are let in, you will get a
          Chime.
        </p>
      )}
      {townHall.canAsk && (
        <p className="text-caption text-text-secondary">New members are let in by the owner or a Deputy.</p>
      )}

      {staff && initialRequests && initialRequests.length > 0 && (
        <RequestsCard
          townHallId={townHall.id}
          requests={initialRequests}
          onAnswered={() => router.refresh()}
        />
      )}

      {townHall.membership === 'active' && initialFeed && (
        <FeedSection
          townHallId={townHall.id}
          isOwner={staff}
          initial={initialFeed}
          initialHeld={initialHeld}
        />
      )}

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
                  <span className="min-w-0 flex-1 text-body [overflow-wrap:anywhere] text-text-primary">
                    {m.displayName} <span className="text-text-secondary">@{m.handle}</span>
                  </span>
                  {ROLE_LABEL[m.role] && (
                    <span className="text-caption text-text-secondary">{ROLE_LABEL[m.role]}</span>
                  )}
                  <MemberMenu
                    townHallId={townHall.id}
                    member={m}
                    viewerRole={townHall.myRole}
                    onChanged={(role) => changed(m.handle, role)}
                  />
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

      {!owner && (
        <Button variant="ghost" size="sm" onClick={() => setReporting(true)} className="self-start">
          Flag this Town Hall…
        </Button>
      )}

      {staff && <InviteForm townHallId={townHall.id} onInvited={() => router.refresh()} />}

      {staff && initialBans && (
        // Remounted whenever the server's list changes (e.g. after "Ban…" in the Members list): its own state would
        // otherwise survive router.refresh().
        <BansCard
          key={initialBans.map((b) => b.handle).join(' ')}
          townHallId={townHall.id}
          initial={initialBans}
          onBanned={(handle) => changed(handle, null)}
        />
      )}

      {owner && townHall.visibility !== 'invite' && <JoinRuleCard townHall={townHall} />}

      {owner && (
        <ClayCard className="flex flex-col gap-3">
          <h2 className="text-title text-text-primary">Danger zone</h2>
          <p className="text-caption text-text-secondary">
            Deleting a Town Hall removes it and every membership in it. This cannot be undone. To step away
            without deleting it, make someone a Deputy, then hand it to them from the Members list.
          </p>
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} className="self-start">
            Delete this Town Hall
          </Button>
        </ClayCard>
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

const banDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Who may not join (ADR-042): ban someone by call sign, or lift a ban. The owner or a Deputy. A ban is never announced:
 * to the banned person this Town Hall just never answers their request.
 */
function BansCard({
  townHallId,
  initial,
  onBanned,
}: {
  townHallId: string;
  initial: BanEntry[];
  /** The roster lives in the parent's state: a ban removes the person from it too. */
  onBanned: (handle: string) => void;
}) {
  const [bans, setBans] = useState(initial);
  const [handle, setHandle] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const cleaned = handle.trim().replace(/^@/, '').toLowerCase();
    if (!handleParamSchema.safeParse(cleaned).success) {
      setFieldError('Enter a call sign: 3–24 letters, numbers or underscores.');
      return;
    }
    setFieldError(undefined);
    setConfirming(cleaned);
  }

  async function ban(target: string) {
    setBusy('ban');
    const res = await postJson(`/api/town-halls/${townHallId}/bans`, { handle: target });
    setBusy(undefined);
    setConfirming(undefined);
    if (!res.ok) return setError(res.error?.message ?? 'That did not work. Try again.');
    setHandle('');
    onBanned(target);
  }

  async function lift(target: string) {
    setBusy(`lift:${target}`);
    setError(undefined);
    const res = await apiRequest('DELETE', `/api/town-halls/${townHallId}/bans/${target}`);
    setBusy(undefined);
    if (!res.ok) return setError(res.error?.message ?? 'That did not work. Try again.');
    setBans((all) => all.filter((b) => b.handle !== target));
  }

  return (
    <ClayCard className="flex flex-col gap-3">
      <h2 className="text-title text-text-primary">Banned{bans.length > 0 && ` (${bans.length})`}</h2>
      <p className="text-caption text-text-secondary">
        A banned person cannot join or be invited. They are not told: to them, this Town Hall just never
        answers their request.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {bans.length > 0 && (
        <ul className="flex flex-col gap-3">
          {bans.map((b) => (
            <li key={b.handle} className="flex flex-wrap items-center gap-3">
              <Avatar name={b.displayName} tint={b.portraitTint} src={b.portraitUrl} size="sm" />
              <span className="min-w-0 flex-1 text-body [overflow-wrap:anywhere] text-text-primary">
                {b.displayName} <span className="text-text-secondary">@{b.handle}</span>
                <span className="block text-caption text-text-secondary">
                  {banDate(b.bannedAt)}
                  {b.bannedBy && ` · by @${b.bannedBy}`}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `lift:${b.handle}`}
                onClick={() => lift(b.handle)}
              >
                Lift ban
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Input
          label="Ban by call sign"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={fieldError}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITS.HANDLE_MAX}
        />
        <Button type="submit" size="sm" variant="secondary" className="self-start">
          Ban…
        </Button>
      </form>
      <ConfirmationDialog
        open={confirming !== undefined}
        destructive
        title={`Ban @${confirming ?? ''}?`}
        description="If they are in this Town Hall, they are removed. They cannot join or be invited again until the ban is lifted, and they are not told."
        confirmLabel="Ban"
        loading={busy === 'ban'}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => confirming && ban(confirming)}
      />
    </ClayCard>
  );
}

/** Waiting join requests, oldest first: let them in, or say no (which they are never told). */
function RequestsCard({
  townHallId,
  requests,
  onAnswered,
}: {
  townHallId: string;
  requests: JoinRequest[];
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  // Answered ones leave the list at once (the server's list is re-read on refresh too).
  const [gone, setGone] = useState<Set<string>>(new Set());

  async function answer(handle: string, action: 'approve' | 'decline') {
    setBusy(`${action}:${handle}`);
    setError(undefined);
    const res = await postJson(`/api/town-halls/${townHallId}/members/${handle}`, { action });
    setBusy(undefined);
    if (!res.ok) return setError(res.error?.message ?? 'That did not work. Try again.');
    setGone((s) => new Set(s).add(handle));
    onAnswered();
  }

  const waiting = requests.filter((r) => !gone.has(r.handle));
  if (waiting.length === 0) return null;
  return (
    <ClayCard className="flex flex-col gap-3">
      <h2 className="text-title text-text-primary">Asking to join ({waiting.length})</h2>
      <p className="text-caption text-text-secondary">
        Saying no is quiet: they are not told, and their request simply runs out after 30 days.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="flex flex-col gap-3">
        {waiting.map((r) => (
          <li key={r.handle} className="flex flex-wrap items-center gap-3">
            <Avatar name={r.displayName} tint={r.portraitTint} src={r.portraitUrl} size="sm" />
            <span className="min-w-0 flex-1 text-body [overflow-wrap:anywhere] text-text-primary">
              {r.displayName} <span className="text-text-secondary">@{r.handle}</span>
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={busy === `approve:${r.handle}`}
                onClick={() => answer(r.handle, 'approve')}
              >
                Let in
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `decline:${r.handle}`}
                onClick={() => answer(r.handle, 'decline')}
              >
                No
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ClayCard>
  );
}

/** "Anyone can join" or "Ask to join", for a listed Town Hall. Owner only. */
function JoinRuleCard({ townHall }: { townHall: TownHallDetail }) {
  const router = useRouter();
  const [approval, setApproval] = useState(townHall.joinRule === 'approval');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function set(next: boolean) {
    setBusy(true);
    setError(undefined);
    const res = await apiRequest('PATCH', `/api/town-halls/${townHall.id}`, {
      joinRule: next ? 'approval' : 'instant',
    });
    setBusy(false);
    if (!res.ok) return setError(res.error?.message ?? 'That did not save. Try again.');
    setApproval(next);
    router.refresh();
  }

  return (
    <ClayCard className="flex flex-col gap-2">
      <h2 className="text-title text-text-primary">Joining</h2>
      <Switch
        label="Ask to join"
        hint={
          approval
            ? 'New members ask; you or a Deputy let them in.'
            : 'Anyone can join with one tap. Switch on to approve each new member.'
        }
        checked={approval}
        disabled={busy}
        onCheckedChange={set}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </ClayCard>
  );
}

/**
 * What the viewer may do about one member (ADR-041). The owner: make or stand down a Deputy, hand the Town Hall to a
 * Deputy, remove anyone, ban ordinary members. A Deputy: remove or ban ordinary members (ADR-042). Nothing for anyone
 * else (no button at all).
 */
function MemberMenu({
  townHallId,
  member,
  viewerRole,
  onChanged,
}: {
  townHallId: string;
  member: MemberRef;
  viewerRole: TownHallDetail['myRole'];
  onChanged: (role: MemberRef['role'] | null) => void;
}) {
  const [confirming, setConfirming] = useState<'remove' | 'ban' | 'make_owner' | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const ownerView = viewerRole === 'owner';
  const mayRemove =
    member.role !== 'owner' && (ownerView || (viewerRole === 'deputy' && member.role === 'member'));
  if (!mayRemove && !(ownerView && member.role !== 'owner')) return null;

  async function run(action: MemberAction | 'remove' | 'ban') {
    setBusy(true);
    const path = `/api/town-halls/${townHallId}/members/${member.handle}`;
    const res =
      action === 'remove'
        ? await apiRequest('DELETE', path)
        : action === 'ban'
          ? await postJson(`/api/town-halls/${townHallId}/bans`, { handle: member.handle })
          : await postJson(path, { action });
    setBusy(false);
    setConfirming(null);
    if (!res.ok) {
      toast({ title: res.error?.message ?? 'That did not work.', tone: 'danger' });
      return;
    }
    if (action === 'remove' || action === 'ban') onChanged(null);
    else if (action === 'make_deputy') onChanged('deputy');
    else if (action === 'make_member') onChanged('member');
    else if (action === 'make_owner') {
      toast({ title: `@${member.handle} owns this Town Hall now. You are a Deputy.`, tone: 'success' });
      onChanged('owner');
    }
  }

  const items = [
    ...(ownerView && member.role === 'member'
      ? [{ id: 'deputy', label: 'Make a Deputy', onSelect: () => run('make_deputy') }]
      : []),
    ...(ownerView && member.role === 'deputy'
      ? [
          { id: 'member', label: 'Stand down as Deputy', onSelect: () => run('make_member') },
          { id: 'owner', label: 'Hand the Town Hall to them…', onSelect: () => setConfirming('make_owner') },
        ]
      : []),
    ...(mayRemove
      ? [{ id: 'remove', label: 'Remove…', danger: true, onSelect: () => setConfirming('remove') }]
      : []),
    // A Deputy must be stood down before they can be banned (ADR-042).
    ...(member.role === 'member' && mayRemove
      ? [{ id: 'ban', label: 'Ban…', danger: true, onSelect: () => setConfirming('ban') }]
      : []),
  ];

  return (
    <>
      <Dropdown
        label={`Options for @${member.handle}`}
        align="end"
        trigger={(t) => (
          <button
            type="button"
            aria-label={`Options for @${member.handle}`}
            className={iconButton}
            disabled={busy}
            {...t}
          >
            <MoreIcon />
          </button>
        )}
        items={items}
      />
      <ConfirmationDialog
        open={confirming === 'remove'}
        destructive
        title={`Remove @${member.handle}?`}
        description="They will no longer be a member of this Town Hall."
        confirmLabel="Remove"
        loading={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => run('remove')}
      />
      <ConfirmationDialog
        open={confirming === 'ban'}
        destructive
        title={`Ban @${member.handle}?`}
        description="They are removed, and cannot join or be invited again until the ban is lifted. They are not told: to them, this Town Hall just never answers their request."
        confirmLabel="Ban"
        loading={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => run('ban')}
      />
      <ConfirmationDialog
        open={confirming === 'make_owner'}
        destructive
        title={`Hand this Town Hall to @${member.handle}?`}
        description="They become its owner, with every power you have now, including deleting it. You stay on as a Deputy. Only they can give it back."
        confirmLabel="Hand it over"
        loading={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => run('make_owner')}
      />
    </>
  );
}
