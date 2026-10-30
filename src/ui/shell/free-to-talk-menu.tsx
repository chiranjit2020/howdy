'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../cn';
import { FreeToTalkPanel, type LitPalRow, type MyLightState } from '../howdy/free-to-talk';
import { Modal } from '../primitives';
import { useDismiss } from '../primitives/use-dismiss';
import { OPEN_FREE_TO_TALK } from './shell-events';

export interface FreeToTalkState {
  lit: LitPalRow[];
  mine: MyLightState | null;
}

/** What the pill and the phone's menu item say, for eyes and for screen readers. */
export function freeToTalkSummary({ lit, mine }: FreeToTalkState) {
  const friends = lit.length;
  return {
    label: mine ? `Free until ${mine.untilLabel}` : 'Free to talk',
    spoken:
      // Starts with the words on screen, so voice control users can say what they see.
      (mine ? `Free until ${mine.untilLabel}, free to talk is on` : 'Free to talk, off') +
      (friends > 0 ? `, ${friends} ${friends === 1 ? 'friend' : 'friends'} free now` : ''),
  };
}

/** The status dot: sunflower while my light is on, grey while it is off. */
export function FreeDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        on ? 'bg-highlight ring-1 ring-on-highlight/40' : 'bg-border-strong',
      )}
    />
  );
}

/**
 * "Free to talk" in the top bar (wide screens), just before the bell: a labelled pill, not a bare toggle, so it never
 * reads as a light/dark switch. The dot says whether my light is on (sunflower) or off (grey); a sunflower count says how
 * many friends are free right now. It opens a small panel with the switch, Options and those friends. Phones have it in
 * the More menu instead (see ShellMoreMenu).
 */
export function FreeToTalkPill({ state }: { state: FreeToTalkState }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  useDismiss(open, [root], close);
  // Pages can ask for the panel (Home's "Switch yours on").
  useEffect(() => {
    const show = () => {
      setOpen(true);
      // Put the keyboard on the switch, the thing the page asked for.
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="switch"]')?.focus());
    };
    window.addEventListener(OPEN_FREE_TO_TALK, show);
    return () => window.removeEventListener(OPEN_FREE_TO_TALK, show);
  }, []);
  const { label, spoken } = freeToTalkSummary(state);
  const friends = state.lit.length;

  return (
    <div ref={root} className="relative hidden md:block">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={spoken}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 rounded-pill border border-border bg-surface px-3 text-caption pointer-fine:min-h-9 font-semibold whitespace-nowrap text-text-primary shadow-clay-sm hover:bg-surface-sunken"
      >
        <FreeDot on={state.mine !== null} />
        {label}
        {friends > 0 && (
          <span className="grid min-w-5 place-items-center rounded-pill bg-highlight px-1 text-metadata font-bold text-on-highlight">
            {friends > 99 ? '99+' : friends}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-40 mt-2 w-80 rounded-lg border border-border border-t-4 border-t-accent bg-surface p-3 shadow-float"
        >
          <FreeToTalkPanel lit={state.lit} mine={state.mine} />
        </div>
      )}
    </div>
  );
}

/** The same panel for phones, opened from the More menu. */
export function FreeToTalkDialog({
  state,
  open,
  onClose,
}: {
  state: FreeToTalkState;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Free to talk">
      <FreeToTalkPanel lit={state.lit} mine={state.mine} label="Let friends know" />
    </Modal>
  );
}
