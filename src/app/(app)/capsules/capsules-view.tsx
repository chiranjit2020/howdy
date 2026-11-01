'use client';

import { useState, type FormEvent } from 'react';
import type { MyCapsules } from '@/modules/capsules';
import { dayOf, longDay } from '@/shared/calendar';
import { CAPSULE_MAX } from '@/shared/validation/capsules';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { PageFrame } from '@/ui/howdy/page-frame';
import { RailCard } from '@/ui/howdy/rail-card';
import { CapsuleIcon } from '@/ui/icons';
import {
  Avatar,
  Button,
  ClayCard,
  ConfirmationDialog,
  EmptyState,
  Input,
  Select,
  Textarea,
} from '@/ui/primitives';

export function CapsulesView({
  initial,
  pals,
  earliest,
  latest,
}: {
  initial: MyCapsules;
  pals: { handle: string; displayName: string }[];
  earliest: string;
  latest: string;
}) {
  // Lists are this component's own state, so removals are applied here as well as on the server.
  const [opened, setOpened] = useState(initial.opened);
  const [sealed, setSealed] = useState(initial.sealed);
  const [coming, setComing] = useState(initial.coming);

  // `router.refresh()` does not reset state held here, so after sealing the lists are read again explicitly.
  async function reload() {
    const res = await apiRequest<MyCapsules>('GET', '/api/capsules');
    if (!res.ok || !res.data) return;
    setOpened(res.data.opened);
    setSealed(res.data.sealed);
    setComing(res.data.coming);
  }
  const [removing, setRemoving] = useState<{ id: string; kind: 'take-back' | 'delete' } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const res = await apiRequest('DELETE', `/api/capsules/${removing.id}`);
    setBusy(false);
    // A capsule to myself is in two lists (sealed by me, and coming to me): read them all again.
    if (res.ok) await reload();
    else setError(res.error?.message ?? 'That did not work. Try again.');
    setRemoving(undefined);
  }

  // The right panel: what is on its way to me, and what I sealed (which I can still take back).
  const rail =
    coming.length > 0 || sealed.length > 0 ? (
      <>
        {coming.length > 0 && (
          <RailCard id="coming-heading" title="Coming to you">
            <ul className="flex flex-col gap-3">
              {coming.map((c, i) => (
                <li key={`${c.from?.handle ?? 'me'}-${c.openOn}-${i}`} className="flex items-center gap-3">
                  {c.from ? (
                    <Avatar
                      name={c.from.displayName}
                      tint={c.from.portraitTint}
                      src={c.from.portraitUrl}
                      size="sm"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-pill bg-surface-sunken text-text-secondary"
                    >
                      <CapsuleIcon />
                    </span>
                  )}
                  <p className="min-w-0 text-caption [overflow-wrap:anywhere] text-text-primary">
                    {c.from ? `From ${c.from.displayName}` : 'From your past self'}
                    <span className="block text-text-secondary">Opens {longDay(c.openOn)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </RailCard>
        )}
        {sealed.length > 0 && (
          <RailCard id="sealed-heading" title="Sealed by you">
            <ul className="-my-1 flex flex-col divide-y divide-border">
              {sealed.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1">
                  <p className="min-w-0 text-caption [overflow-wrap:anywhere] text-text-primary">
                    For {c.to ? c.to.displayName : 'your future self'}
                    <span className="block text-text-secondary">Opens {longDay(c.openOn)}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="link"
                    className="shrink-0"
                    onClick={() => setRemoving({ id: c.id, kind: 'take-back' })}
                  >
                    Take back
                  </Button>
                </li>
              ))}
            </ul>
          </RailCard>
        )}
      </>
    ) : undefined;

  return (
    <PageFrame rail={rail} railLabel="Your Time Capsules">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading text-text-primary">Time Capsules</h1>
        <p className="text-caption text-text-secondary">
          Seal a few words for your future self or one of your friends. Nobody can read them — not even you —
          until the day they open.
        </p>
      </div>
      <SealForm pals={pals} earliest={earliest} latest={latest} onSealed={reload} />
      {error && <FormMessage tone="error">{error}</FormMessage>}

      <section aria-labelledby="opened-heading" className="flex flex-col gap-3">
        <h2 id="opened-heading" className="text-title text-text-primary">
          Opened
        </h2>
        {opened.length === 0 ? (
          <ClayCard>
            <EmptyState
              as="h3"
              icon={<CapsuleIcon className="text-text-muted" />}
              title="Nothing opened yet"
              description="When a Time Capsule for you opens, you can read it here."
            />
          </ClayCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {opened.map((c) => (
              <li key={c.id}>
                <ClayCard className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-caption text-text-secondary">
                      {c.from ? `From ${c.from.displayName}` : 'From your past self'}, sealed{' '}
                      {longDay(dayOf(new Date(c.sealedAt)))}, opened {longDay(c.openOn)}
                    </p>
                    <Button
                      size="sm"
                      variant="link"
                      className="shrink-0"
                      onClick={() => setRemoving({ id: c.id, kind: 'delete' })}
                    >
                      Delete
                    </Button>
                  </div>
                  <p className="text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-text-primary">
                    {c.body}
                  </p>
                </ClayCard>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmationDialog
        open={removing !== undefined}
        destructive
        title={removing?.kind === 'delete' ? 'Delete this Time Capsule?' : 'Take this Time Capsule back?'}
        description={
          removing?.kind === 'delete'
            ? 'It is deleted for good.'
            : 'It will never open, and its words are deleted. Nobody is told.'
        }
        confirmLabel={removing?.kind === 'delete' ? 'Delete it' : 'Take it back'}
        loading={busy}
        onCancel={() => setRemoving(undefined)}
        onConfirm={remove}
      />
    </PageFrame>
  );
}

function SealForm({
  pals,
  earliest,
  latest,
  onSealed,
}: {
  pals: { handle: string; displayName: string }[];
  earliest: string;
  latest: string;
  onSealed: () => void;
}) {
  const [to, setTo] = useState('me');
  const [openOn, setOpenOn] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | undefined>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setFields({});
    setDone(undefined);
    if (!openOn) return setFields({ openOn: 'Pick the day it opens.' });
    if (!body.trim()) return setFields({ body: 'Write something to seal.' });
    setBusy(true);
    const res = await apiRequest<{ openOn: string }>('POST', '/api/capsules', { to, body, openOn });
    setBusy(false);
    if (res.ok && res.data) {
      setDone(res.data.openOn);
      setBody('');
      setOpenOn('');
      onSealed();
    } else {
      setFields(res.error?.fields ?? {});
      if (!res.error?.fields) setError(res.error?.message ?? 'That did not seal. Try again.');
    }
  }

  return (
    <ClayCard>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">Seal a Time Capsule</h2>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {done && (
          <FormMessage tone="success">Sealed. It opens on {longDay(done)}, and not a day before.</FormMessage>
        )}
        <Select label="For" value={to} onChange={(e) => setTo(e.target.value)} error={fields.to}>
          <option value="me">My future self</option>
          {pals.map((p) => (
            <option key={p.handle} value={p.handle}>
              {p.displayName} (@{p.handle})
            </option>
          ))}
        </Select>
        <Input
          label="Opens on"
          type="date"
          min={earliest}
          max={latest}
          value={openOn}
          onChange={(e) => setOpenOn(e.target.value)}
          error={fields.openOn}
          hint="Any day from tomorrow to 5 years from now."
        />
        <Textarea
          label="Your words"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={CAPSULE_MAX}
          showCount
          rows={4}
          error={fields.body}
        />
        <Button type="submit" loading={busy} className="self-start">
          Seal it
        </Button>
      </form>
    </ClayCard>
  );
}
