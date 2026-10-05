'use client';

import { useState, type FormEvent } from 'react';
import type {
  AppealItem,
  AppealsPage,
  ModAccount,
  ModPersonRef,
  QueueItem,
  QueuePage,
} from '@/modules/moderation';
import {
  REPORT_REASONS,
  SUSPENSION_LENGTHS,
  type AppealDecision,
  type ReportAction,
  type ReportReason,
  type ReportStatus,
  type ReportSubject,
  type SuspensionLength,
} from '@/shared/validation/moderation';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Img } from '@/ui/art/img';
import { RelativeTime } from '@/ui/howdy';
import { Badge, Button, ClayCard, EmptyState, Input, Select, type Tone } from '@/ui/primitives';

const REASON: Record<QueueItem['reason'], string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  impersonation: 'Impersonation',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

/** How each kind of report reads to a moderator, and the one removal it allows (ADR-025). */
const SUBJECT: Record<
  ReportSubject,
  { label: string; said: string; gone: string; remove: { action: ReportAction; label: string } | null }
> = {
  person: { label: 'Account', said: '', gone: '', remove: null },
  card: {
    label: 'Post Card',
    said: 'The reported Post Card said:',
    gone: 'The card has already been removed.',
    remove: { action: 'remove_card', label: 'Remove card' },
  },
  portrait: {
    label: 'Photo',
    said: '',
    gone: 'The photo has since been changed or removed.',
    remove: { action: 'remove_portrait', label: 'Remove photo' },
  },
  card_photo: {
    label: 'Card photo',
    said: '',
    gone: 'The photo has since been removed.',
    remove: { action: 'remove_card_photo', label: 'Remove photo' },
  },
  whisper: {
    label: 'Whisper',
    said: 'The reported Whisper said:',
    gone: 'The Whisper is gone (removed, burned, or 7 days old).',
    remove: { action: 'remove_whisper', label: 'Remove Whisper' },
  },
  town_hall: {
    label: 'Town Hall',
    said: 'The reported Town Hall is called, and says:',
    gone: 'The Town Hall has already been removed.',
    remove: { action: 'remove_town_hall', label: 'Remove Town Hall' },
  },
  hall_post: {
    label: 'Town Hall post',
    said: 'The reported Town Hall post said:',
    gone: 'The post has already been removed.',
    remove: { action: 'remove_hall_post', label: 'Remove post' },
  },
};

const LENGTH_LABEL: Record<SuspensionLength, string> = {
  '7d': '7 days',
  '30d': '30 days',
  indefinite: 'Until lifted',
};

const shortDate = (d: Date | string) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  actioned: 'Acted on',
  dismissed: 'Dismissed',
};

const ACCOUNT_TONE: Record<ModPersonRef['status'], Tone> = {
  active: 'success',
  suspended: 'danger',
  pending_deletion: 'warning',
};
const ACCOUNT_LABEL: Record<ModPersonRef['status'], string> = {
  active: 'Active',
  suspended: 'Suspended',
  pending_deletion: 'Leaving',
};

/**
 * The queue (filtered by status, paged), the open appeals, and a lookup to suspend or reinstate an account directly.
 */
export function ModerationView({ initial, appeals }: { initial: QueuePage; appeals: AppealsPage }) {
  return (
    <>
      <Queue initial={initial} />
      <Appeals initial={appeals} />
      <AccountLookup />
    </>
  );
}

/**
 * The second step of suspending: what the person will be told (the reason) and for how long. Both are required, so a
 * suspension is never a single stray click.
 */
function SuspendStep({
  handle,
  defaultReason,
  busy,
  onConfirm,
  onCancel,
}: {
  handle: string;
  defaultReason: ReportReason;
  busy: boolean;
  onConfirm: (how: { reason: ReportReason; length: SuspensionLength }) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>(defaultReason);
  const [length, setLength] = useState<SuspensionLength>('7d');
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3">
      <div className="flex flex-wrap gap-3">
        <Select
          label="Reason they will see"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
          className="min-w-0 flex-1"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON[r]}
            </option>
          ))}
        </Select>
        <Select
          label="For how long"
          value={length}
          onChange={(e) => setLength(e.target.value as SuspensionLength)}
          className="min-w-0 flex-1"
        >
          {SUSPENSION_LENGTHS.map((l) => (
            <option key={l} value={l}>
              {LENGTH_LABEL[l]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" loading={busy} onClick={() => onConfirm({ reason, length })}>
          Yes, suspend @{handle}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Person({ who, gone }: { who: ModPersonRef | null; gone: string }) {
  if (!who) return <span className="text-text-secondary">{gone}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-semibold text-text-primary">@{who.handle}</span>
      {who.status !== 'active' && <Badge tone={ACCOUNT_TONE[who.status]}>{ACCOUNT_LABEL[who.status]}</Badge>}
    </span>
  );
}

function Queue({ initial }: { initial: QueuePage }) {
  const [status, setStatus] = useState<ReportStatus>('open');
  const [items, setItems] = useState<QueueItem[]>(initial.reports);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [busy, setBusy] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function load(s: ReportStatus, cursor?: string) {
    setBusy(cursor ? '__more__' : '__load__');
    setError(undefined);
    const query = new URLSearchParams({ status: s, ...(cursor ? { cursor } : {}) });
    const res = await apiRequest<QueuePage>('GET', `/api/moderation/reports?${query}`);
    setBusy(undefined);
    if (!res.ok || !res.data) return setError(res.error?.message ?? 'Could not load the queue.');
    const page = res.data;
    setItems((all) =>
      cursor ? [...all, ...page.reports.filter((m) => !all.some((r) => r.id === m.id))] : page.reports,
    );
    setNext(page.nextCursor);
  }

  async function act(
    id: string,
    action: ReportAction,
    how?: { reason: ReportReason; length: SuspensionLength },
  ) {
    setBusy(`${id}:${action}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/moderation/reports/${id}`, { action, ...how });
    setConfirming(undefined);
    setBusy(undefined);
    // Acted on, or someone else closed it first (409): either way it no longer belongs in the open list.
    if (res.ok || res.status === 409) setItems((all) => all.filter((r) => r.id !== id));
    if (!res.ok) setError(res.error?.message ?? 'That did not work. Try again.');
  }

  const open = status === 'open' || status === 'reviewing';

  return (
    <section aria-labelledby="queue-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="queue-heading" className="text-title text-text-primary">
          Reports
        </h2>
        <Select
          label="Show"
          value={status}
          onChange={(e) => {
            const s = e.target.value as ReportStatus;
            setStatus(s);
            void load(s);
          }}
          className="w-44"
        >
          {(['open', 'actioned', 'dismissed'] as const).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      {items.length === 0 ? (
        <ClayCard>
          <EmptyState
            as="h3"
            icon="🛡️"
            title={open ? 'Nothing waiting' : `No ${STATUS_LABEL[status].toLowerCase()} reports`}
            description={open ? 'Every report has been handled.' : 'Closed reports will show up here.'}
          />
        </ClayCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((r) => (
            <li key={r.id}>
              <ClayCard className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone="warning">{REASON[r.reason]}</Badge>
                    <Badge tone="neutral">{SUBJECT[r.subject].label}</Badge>
                    {open && r.targetHeld && <Badge tone="info">Writing held for review</Badge>}
                  </span>
                  <RelativeTime date={r.createdAt} className="text-metadata text-text-secondary" />
                </div>
                {r.automatic ? (
                  <p className="text-body text-text-secondary">
                    The photo check held a photo by{' '}
                    <Person who={r.target} gone="an account that no longer exists" />. Only they can see it
                    until you decide: Dismiss shows it to everyone again.
                  </p>
                ) : (
                  <p className="text-body text-text-secondary">
                    <Person who={r.reporter} gone="A former member" /> reported{' '}
                    <Person who={r.target} gone="an account that no longer exists" />
                  </p>
                )}
                {(r.cardHasPhoto || (r.subject === 'card_photo' && r.canRemove)) && (
                  <Img
                    src={`/api/moderation/reports/${r.id}/card-photo`}
                    width={240}
                    height={240}
                    alt={`The photo on the reported card by @${r.target?.handle ?? 'someone'}`}
                    className="max-h-60 w-auto max-w-full rounded-md object-contain"
                  />
                )}
                {r.subject === 'portrait' && r.canRemove && (
                  <Img
                    src={`/api/moderation/reports/${r.id}/portrait`}
                    width={128}
                    height={128}
                    alt={`The reported photo of @${r.target?.handle ?? 'someone'}`}
                    className="size-32 rounded-md object-cover"
                  />
                )}
                {r.evidenceText && (
                  <blockquote className="rounded-md border-l-4 border-border bg-surface-sunken px-3 py-2 text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-text-primary">
                    <span className="sr-only">{SUBJECT[r.subject].said} </span>
                    {r.evidenceText}
                  </blockquote>
                )}
                {!r.canRemove && SUBJECT[r.subject].remove && (
                  <p className="text-caption text-text-secondary">{SUBJECT[r.subject].gone}</p>
                )}
                {r.details && <p className="text-body text-text-primary">{r.details}</p>}
                {open ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === `${r.id}:dismiss`}
                      onClick={() => act(r.id, 'dismiss')}
                    >
                      Dismiss
                    </Button>
                    {r.canRemove && SUBJECT[r.subject].remove && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === `${r.id}:${SUBJECT[r.subject].remove!.action}`}
                        onClick={() => act(r.id, SUBJECT[r.subject].remove!.action)}
                      >
                        {SUBJECT[r.subject].remove!.label}
                      </Button>
                    )}
                    {r.target?.status === 'active' && confirming !== r.id && (
                      <Button size="sm" variant="danger" onClick={() => setConfirming(r.id)}>
                        Suspend…
                      </Button>
                    )}
                  </div>
                ) : null}
                {open && r.target?.status === 'active' && confirming === r.id ? (
                  <SuspendStep
                    handle={r.target.handle}
                    defaultReason={r.reason}
                    busy={busy === `${r.id}:suspend`}
                    onConfirm={(how) => act(r.id, 'suspend', how)}
                    onCancel={() => setConfirming(undefined)}
                  />
                ) : null}
                {open ? null : (
                  <p className="text-caption text-text-secondary">
                    {STATUS_LABEL[r.status]}
                    {r.reviewedBy && <> by @{r.reviewedBy.handle}</>}
                    {r.reviewedAt && (
                      <>
                        {' '}
                        <RelativeTime date={r.reviewedAt} />
                      </>
                    )}
                  </p>
                )}
              </ClayCard>
            </li>
          ))}
        </ul>
      )}

      {next && (
        <Button
          variant="secondary"
          loading={busy === '__more__'}
          onClick={() => load(status, next)}
          className="self-center"
        >
          More reports
        </Button>
      )}
    </section>
  );
}

function Appeals({ initial }: { initial: AppealsPage }) {
  const [items, setItems] = useState<AppealItem[]>(initial.appeals);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function more() {
    if (!next) return;
    setBusy('__more__');
    const res = await apiRequest<AppealsPage>(
      'GET',
      `/api/moderation/appeals?${new URLSearchParams({ cursor: next })}`,
    );
    setBusy(undefined);
    if (!res.ok || !res.data) return setError(res.error?.message ?? 'Could not load more appeals.');
    const page = res.data;
    setItems((all) => [...all, ...page.appeals.filter((a) => !all.some((b) => b.id === a.id))]);
    setNext(page.nextCursor);
  }

  async function decide(id: string, decision: AppealDecision) {
    setBusy(`${id}:${decision}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/moderation/appeals/${id}`, { decision });
    setBusy(undefined);
    // Answered, or someone else answered it first (409): either way it is no longer waiting.
    if (res.ok || res.status === 409) setItems((all) => all.filter((a) => a.id !== id));
    if (!res.ok) setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <section aria-labelledby="appeals-heading" className="flex flex-col gap-4">
      <h2 id="appeals-heading" className="text-title text-text-primary">
        Appeals
      </h2>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {items.length === 0 ? (
        <ClayCard>
          <EmptyState
            as="h3"
            icon="📨"
            title="No appeals waiting"
            description="When a suspended person appeals, it shows up here."
          />
        </ClayCard>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((a) => (
            <li key={a.id}>
              <ClayCard className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Person who={a.person} gone="An account that no longer exists" />
                  <RelativeTime date={a.appealedAt} className="text-metadata text-text-secondary" />
                </div>
                <p className="text-caption text-text-secondary">
                  Suspended {shortDate(a.suspendedAt)} for {REASON[a.reason].toLowerCase()}
                  {a.suspendedBy && <> by @{a.suspendedBy.handle}</>},{' '}
                  {a.endsAt ? `until ${shortDate(a.endsAt)}` : 'until lifted'}.
                </p>
                <blockquote className="rounded-md border-l-4 border-border bg-surface-sunken px-3 py-2 text-body text-text-primary">
                  <span className="sr-only">Their appeal says: </span>
                  {a.text}
                </blockquote>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === `${a.id}:grant`}
                    onClick={() => decide(a.id, 'grant')}
                  >
                    Lift suspension
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === `${a.id}:uphold`}
                    onClick={() => decide(a.id, 'uphold')}
                  >
                    Keep suspension
                  </Button>
                </div>
              </ClayCard>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Button variant="secondary" loading={busy === '__more__'} onClick={more} className="self-center">
          More appeals
        </Button>
      )}
    </section>
  );
}

type AccountActionBody =
  { action: 'reinstate' } | { action: 'suspend'; reason: ReportReason; length: SuspensionLength };

function AccountLookup() {
  const [handle, setHandle] = useState('');
  const [found, setFound] = useState<ModAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function fetchAccount(h: string) {
    const res = await apiRequest<{ account: ModAccount }>(
      'GET',
      `/api/moderation/accounts/${encodeURIComponent(h)}`,
    );
    setFound(res.ok && res.data ? res.data.account : null);
    if (!res.ok) setError(res.status === 404 ? 'No account with that call sign.' : res.error?.message);
  }

  async function lookUp(e: FormEvent) {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, '');
    if (!h) return;
    setBusy(true);
    setError(undefined);
    setConfirming(false);
    await fetchAccount(h);
    setBusy(false);
  }

  async function act(body: AccountActionBody) {
    if (!found) return;
    setBusy(true);
    setError(undefined);
    const res = await apiRequest(
      'POST',
      `/api/moderation/accounts/${encodeURIComponent(found.handle)}`,
      body,
    );
    if (res.ok) {
      setConfirming(false);
      // Read it back rather than guess: the server sets the end date.
      await fetchAccount(found.handle);
    } else {
      setError(res.error?.message ?? 'That did not work. Try again.');
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="lookup-heading">
      <ClayCard className="flex flex-col gap-3">
        <h2 id="lookup-heading" className="text-title text-text-primary">
          Look up an account
        </h2>
        <form onSubmit={lookUp} className="flex flex-wrap items-end gap-2">
          <Input
            label="Call sign"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" loading={busy && !found}>
            Look up
          </Button>
        </form>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {found && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2 text-body">
                <span className="font-semibold text-text-primary">{found.displayName}</span>
                <span className="text-text-secondary">@{found.handle}</span>
                <Badge tone={ACCOUNT_TONE[found.status]}>{ACCOUNT_LABEL[found.status]}</Badge>
              </p>
              {found.status === 'active' && !confirming && (
                <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                  Suspend…
                </Button>
              )}
              {found.status === 'suspended' && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => act({ action: 'reinstate' })}
                >
                  Reinstate
                </Button>
              )}
            </div>
            {found.suspension && (
              <p className="text-caption text-text-secondary">
                Suspended {shortDate(found.suspension.since)} for{' '}
                {REASON[found.suspension.reason].toLowerCase()},{' '}
                {found.suspension.endsAt ? `until ${shortDate(found.suspension.endsAt)}` : 'until lifted'}.
              </p>
            )}
            {found.status === 'active' && confirming && (
              <SuspendStep
                handle={found.handle}
                defaultReason="other"
                busy={busy}
                onConfirm={(how) => act({ action: 'suspend', ...how })}
                onCancel={() => setConfirming(false)}
              />
            )}
          </div>
        )}
      </ClayCard>
    </section>
  );
}
