'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  LIGHT_MINUTES,
  LIGHT_NOTE_MAX,
  switchOnLightSchema,
  type LightAudience,
  type LightMinutes,
} from '@/shared/validation/lights';
import type { PortraitTint } from '@/shared/validation/profile';
import { WhisperIcon } from '@/ui/icons';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Avatar, Button, Input, SwitchButton } from '@/ui/primitives';

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
const AUDIENCE_LABEL: Record<LightAudience, string> = { pals: 'All friends', close: 'Close friends' };
const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-text-secondary no-underline hover:bg-surface-sunken hover:text-text-primary';
const chip =
  'cursor-pointer rounded-pill border border-border px-3 py-1.5 text-caption text-text-primary transition-colors ' +
  'hover:bg-surface-sunken has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-on-accent ' +
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

/** The last time and audience used, so one tap on the switch means what it meant last time (this device only). */
const PREFS_KEY = 'howdy.light.prefs';
function readPrefs(): { minutes: LightMinutes; audience: LightAudience } | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as {
      minutes?: unknown;
      audience?: unknown;
    } | null;
    if (!p) return null;
    const minutes = LIGHT_MINUTES.find((m) => m === p.minutes);
    const audience = p.audience === 'close' || p.audience === 'pals' ? p.audience : undefined;
    return minutes && audience ? { minutes, audience } : null;
  } catch {
    return null;
  }
}
function savePrefs(minutes: LightMinutes, audience: LightAudience) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ minutes, audience }));
  } catch {
    /* private mode: it will use the defaults next time */
  }
}

/**
 * Free to talk (Porch Light, ADR-032): one row with the switch (sunflower when on, grey when off), one line saying how it
 * stands, and the friends who are free right now. Shown inside the header's "Free to talk" panel (or the phone's dialog),
 * which gives it its frame. One tap switches it on for as long, and for whom, as last time (1 hour, all friends the first
 * time); "Options" changes that before or after. Nobody is notified when a light comes on; it is only seen by those who
 * look, and it turns itself off.
 */
export function FreeToTalkPanel({
  lit,
  mine,
  label = 'Free to talk',
}: {
  lit: LitPalRow[];
  mine: MyLightState | null;
  /** The heading, which also names the switch. Inside a dialog already titled "Free to talk", say it another way. */
  label?: string;
}) {
  const router = useRouter();
  const headingId = useId();
  const statusId = useId();
  const [open, setOpen] = useState(false);
  // Last time's choice (read in the browser; the server has no storage and uses the defaults). Only the Options panel
  // shows these, and it starts closed, so the page the server sent and the one in the browser still match.
  const [minutes, setMinutes] = useState<LightMinutes>(() =>
    typeof window === 'undefined' ? 60 : (readPrefs()?.minutes ?? 60),
  );
  const [audience, setAudience] = useState<LightAudience>(
    () => mine?.audience ?? (typeof window === 'undefined' ? 'pals' : (readPrefs()?.audience ?? 'pals')),
  );
  const [note, setNote] = useState(mine?.note ?? '');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function switchOn(e?: FormEvent) {
    e?.preventDefault();
    setFormError(undefined);
    const parsed = switchOnLightSchema.safeParse({ minutes, audience, ...(note.trim() ? { note } : {}) });
    if (!parsed.success) {
      setOpen(true);
      setNoteError(parsed.error.issues[0]?.message);
      return;
    }
    setNoteError(undefined);
    setBusy(true);
    const res = await apiRequest('PUT', '/api/me/light', parsed.data);
    setBusy(false);
    if (res.ok) {
      savePrefs(minutes, audience);
      setOpen(false);
      router.refresh();
    } else if (res.error?.fields?.note) {
      setOpen(true);
      setNoteError(res.error.fields.note);
    } else setFormError(res.error?.message);
  }

  async function switchOff() {
    setFormError(undefined);
    setBusy(true);
    const res = await apiRequest('DELETE', '/api/me/light');
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setNote('');
      router.refresh();
    } else setFormError(res.error?.message);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <div className="flex items-center gap-1 pl-2">
        <h2
          id={headingId}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-metadata font-semibold tracking-wider text-text-secondary uppercase"
        >
          {label}
        </h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 shrink-0 rounded-md px-2 text-caption font-semibold text-link hover:bg-surface-sunken"
        >
          Options
        </button>
        <SwitchButton
          tone="highlight"
          checked={mine !== null}
          disabled={busy}
          onCheckedChange={(on) => void (on ? switchOn() : switchOff())}
          aria-labelledby={headingId}
          aria-describedby={statusId}
        />
      </div>

      <p id={statusId} className="px-2 text-caption [overflow-wrap:anywhere] text-text-secondary">
        {mine ? (
          <>
            On until <strong className="font-semibold text-text-primary">{mine.untilLabel}</strong> ·{' '}
            {mine.audience === 'close' ? 'close friends' : 'all friends'}
            {mine.note && <> · “{mine.note}”</>}
          </>
        ) : (
          `Off${lit.length === 0 ? ' · no friend is free right now' : ''}.`
        )}
      </p>

      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      {open && (
        <form
          onSubmit={switchOn}
          noValidate
          className="mt-2 flex flex-col gap-3 border-t border-border px-2 pt-3"
        >
          <p className="text-metadata text-text-muted">
            Lets your friends see you’re free to talk. Nobody is notified, and it turns itself off.
          </p>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-caption font-semibold text-text-primary">For how long?</legend>
            <div className="flex flex-wrap gap-1.5">
              {LIGHT_MINUTES.map((m) => (
                <label key={m} className={chip}>
                  <input
                    type="radio"
                    name="light-minutes"
                    className="sr-only"
                    checked={minutes === m}
                    onChange={() => setMinutes(m)}
                  />
                  {MINUTES_LABEL[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-caption font-semibold text-text-primary">Who sees it?</legend>
            <div className="flex flex-wrap gap-1.5">
              {(['pals', 'close'] as const).map((a) => (
                <label key={a} className={chip}>
                  <input
                    type="radio"
                    name="light-audience"
                    className="sr-only"
                    checked={audience === a}
                    onChange={() => setAudience(a)}
                  />
                  {AUDIENCE_LABEL[a]}
                </label>
              ))}
            </div>
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy}>
              {mine ? 'Update' : 'Switch on'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {lit.length > 0 && (
        <ul aria-label="Friends free to talk" className="mt-1 flex flex-col border-t border-border pt-1">
          {lit.map((p) => (
            <li key={p.handle} className="flex items-center gap-2.5 px-2">
              <Avatar name={p.displayName} tint={p.portraitTint} src={p.portraitUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption text-text-primary">
                  <Link href={`/profile/${p.handle}`} className="font-semibold">
                    {p.displayName}
                  </Link>{' '}
                  <span className="text-text-secondary">until {p.untilLabel}</span>
                </p>
                {p.note && (
                  <p className="text-metadata [overflow-wrap:anywhere] text-text-secondary">“{p.note}”</p>
                )}
              </div>
              <Link
                href={`/messages/${p.handle}`}
                aria-label={`Message to ${p.displayName}`}
                title="Message"
                className={iconButton}
              >
                <WhisperIcon className="size-5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
