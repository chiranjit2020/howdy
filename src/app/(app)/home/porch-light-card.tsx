'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  LIGHT_MINUTES,
  LIGHT_NOTE_MAX,
  switchOnLightSchema,
  type LightAudience,
  type LightMinutes,
} from '@/shared/validation/lights';
import type { PortraitTint } from '@/shared/validation/profile';
import { Art, Glyph } from '@/ui/art/glyph';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Avatar, Button, Input, Radio } from '@/ui/primitives';

/** Times are formatted on the server (Howdy's calendar), so the page and the browser never disagree about them. */
export interface LitPalRow {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  portraitUrl?: string;
  note: string | null;
  untilLabel: string;
}
export interface MyLightState {
  audience: LightAudience;
  note: string | null;
  untilLabel: string;
}

const MINUTES_LABEL: Record<LightMinutes, string> = { 30: '30 min', 60: '1 hour', 120: '2 hours' };
const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-text-secondary no-underline hover:bg-surface hover:text-text-primary';

/**
 * Porch Light (ADR-032) on Home: the Pals who are free to talk right now, and my own switch. Nobody is notified when a
 * light comes on; it is only seen by those who look, and it turns itself off.
 */
export function PorchLightCard({ lit, mine }: { lit: LitPalRow[]; mine: MyLightState | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<LightMinutes>(60);
  const [audience, setAudience] = useState<LightAudience>('pals');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function switchOn(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = switchOnLightSchema.safeParse({ minutes, audience, ...(note.trim() ? { note } : {}) });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message);
      return;
    }
    setNoteError(undefined);
    setBusy(true);
    const res = await apiRequest('PUT', '/api/me/light', parsed.data);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setNote('');
      router.refresh();
    } else if (res.error?.fields?.note) setNoteError(res.error.fields.note);
    else setFormError(res.error?.message);
  }

  async function switchOff() {
    setFormError(undefined);
    setBusy(true);
    const res = await apiRequest('DELETE', '/api/me/light');
    setBusy(false);
    if (res.ok) router.refresh();
    else setFormError(res.error?.message);
  }

  return (
    <section aria-labelledby="porch-light-heading" className="clay flex flex-col gap-3 p-4 sm:p-5">
      <h2
        id="porch-light-heading"
        className="flex items-center gap-1.5 text-metadata font-semibold tracking-wider text-text-secondary uppercase"
      >
        <Glyph emoji="💡" size="free" className="size-5" />
        Porch Lights
      </h2>

      {lit.length > 0 && (
        <ul aria-label="Pals free to talk" className="flex flex-col gap-2">
          {lit.map((p) => (
            <li key={p.handle} className="flex items-center gap-3">
              <Avatar name={p.displayName} tint={p.portraitTint} src={p.portraitUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-body [overflow-wrap:anywhere] text-text-primary">
                  <Link href={`/porch/${p.handle}`} className="font-semibold">
                    {p.displayName}
                  </Link>{' '}
                  <span className="text-caption text-text-secondary">is free until {p.untilLabel}</span>
                </p>
                {p.note && (
                  <p className="text-caption [overflow-wrap:anywhere] text-text-secondary">“{p.note}”</p>
                )}
              </div>
              <Link
                href={`/whispers/${p.handle}`}
                aria-label={`Whisper to ${p.displayName}`}
                title="Whisper"
                className={iconButton}
              >
                <Art name="nav-whispers" size="free" className="size-7" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      {mine ? (
        <div className="flex flex-col gap-2 rounded-md bg-warning/20 p-3">
          <p className="text-body text-text-primary">
            Your light is on until <strong>{mine.untilLabel}</strong>, for{' '}
            {mine.audience === 'close' ? 'your Close Pals' : 'all your Pals'}.
          </p>
          {mine.note && (
            <p className="text-caption [overflow-wrap:anywhere] text-text-secondary">“{mine.note}”</p>
          )}
          <Button variant="secondary" size="sm" loading={busy} onClick={switchOff} className="self-start">
            Switch off
          </Button>
        </div>
      ) : open ? (
        <form onSubmit={switchOn} noValidate className="flex flex-col gap-3">
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-caption font-semibold text-text-primary">For how long?</legend>
            <div className="flex flex-wrap gap-x-4">
              {LIGHT_MINUTES.map((m) => (
                <Radio
                  key={m}
                  name="light-minutes"
                  label={MINUTES_LABEL[m]}
                  checked={minutes === m}
                  onChange={() => setMinutes(m)}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-caption font-semibold text-text-primary">Who sees it?</legend>
            <Radio
              name="light-audience"
              label="All Pals"
              checked={audience === 'pals'}
              onChange={() => setAudience('pals')}
            />
            <Radio
              name="light-audience"
              label="Close Pals only"
              checked={audience === 'close'}
              onChange={() => setAudience('close')}
            />
          </fieldset>
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={LIGHT_NOTE_MAX}
            placeholder="free for chai ☕"
            error={noteError}
            hint="No links."
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>
              Switch on
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          {lit.length === 0 && (
            <p className="text-caption text-text-secondary">No Pal has their light on right now.</p>
          )}
          <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
            Switch on your Porch Light
          </Button>
          <p className="text-metadata text-text-muted">
            Lets your Pals see you’re free to talk. Nobody is notified, and it turns itself off.
          </p>
        </div>
      )}
    </section>
  );
}
