'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '../cn';
import { currentActivity, dismissActivity, onIslandChange, type IslandActivity } from './store';

/**
 * The Dynamic Island: a dark pill that floats just under the top bar and shows one activity at a time (see store.ts).
 * Compact, it is an icon and a few words; tapping it opens the expanded face in place (the pill grows into a card);
 * × sends the activity away. Escape or a tap outside closes the expanded face. Rendered once, by PwaBoot.
 */
export function DynamicIsland() {
  const activity = useSyncExternalStore(onIslandChange, currentActivity, () => null);
  if (!activity) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-40 flex justify-center px-4">
      {/* Keyed: a different activity starts afresh (compact, with its own auto-open timer). */}
      <IslandBody key={activity.id} activity={activity} />
    </div>
  );
}

function IslandBody({ activity }: { activity: IslandActivity }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);

  // One that asks to opens by itself once, a moment after it arrives — not again when its content is re-described.
  const autoOpenMs = useRef(activity.expanded ? activity.autoExpandMs : undefined);
  useEffect(() => {
    const ms = autoOpenMs.current;
    if (ms === undefined) return;
    const t = window.setTimeout(() => setOpen(true), ms);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const dismiss = () => {
    activity.onDismiss?.();
    dismissActivity(activity.id);
  };

  return (
    <div
      ref={box}
      role="region"
      aria-label="Howdy island"
      className={cn(
        'pointer-events-auto animate-island-in overflow-hidden bg-island text-on-island shadow-float',
        'ring-1 ring-on-island/10 transition-[border-radius] duration-300 ease-out motion-reduce:transition-none',
        open ? 'w-full max-w-sm rounded-3xl' : 'max-w-full rounded-pill',
      )}
    >
      <div className="flex items-center gap-1 p-1">
        {activity.expanded ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-pill py-1 pr-2 pl-1.5 text-left focus-visible:outline-2 focus-visible:outline-on-island"
          >
            <Face icon={activity.icon} label={activity.label} />
          </button>
        ) : (
          <p className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1 pr-2 pl-1.5">
            <Face icon={activity.icon} label={activity.label} />
          </p>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Dismiss: ${activity.label}`}
          className="grid size-11 shrink-0 place-items-center rounded-full text-title text-on-island-muted hover:bg-island-raised hover:text-on-island focus-visible:outline-2 focus-visible:outline-on-island"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {open && activity.expanded && (
        <div id={panelId} className="animate-flip-in px-4 pt-1 pb-4">
          {activity.expanded(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Face({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-island-raised [&_img]:size-full"
      >
        {icon}
      </span>
      <span className="truncate text-caption font-semibold">{label}</span>
    </>
  );
}
