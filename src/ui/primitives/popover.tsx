'use client';

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { cn } from '../cn';
import { useDismiss } from './use-dismiss';

export interface TriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-haspopup': 'dialog';
}

/** Space kept between an opened panel and the edge of the screen. */
const EDGE = 16;

/**
 * Non-modal floating panel anchored to its trigger. Closes on Escape / outside press and returns focus to the trigger.
 * Opens below the trigger, start- or end-aligned, then slides sideways if that would cross the edge of the screen (a
 * "?" near the right edge of a phone would otherwise push its panel off it). `arrow` adds a small pointer that stays
 * over the trigger wherever the panel ends up.
 */
export function Popover({
  trigger,
  children,
  label,
  align = 'start',
  arrow = false,
  closeOnPick = false,
  className,
}: {
  trigger: (props: TriggerProps, state: { open: boolean }) => ReactNode;
  children: ReactNode;
  /** Accessible name of the panel. */
  label: string;
  align?: 'start' | 'end';
  arrow?: boolean;
  /** Close (and return focus to the trigger) once any button inside the panel is pressed — for pickers. */
  closeOnPick?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismiss(open, [rootRef], close);

  // Measured before paint, and written straight onto the element, so the panel never shows in the wrong place first.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const button = triggerRef.current;
    if (!open || !panel || !button) return;
    const box = panel.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    let dx = 0;
    if (box.right > width - EDGE) dx = width - EDGE - box.right;
    if (box.left + dx < EDGE) dx = EDGE - box.left;
    panel.style.translate = `${dx}px 0`;
    const t = button.getBoundingClientRect();
    panel.style.setProperty('--arrow-x', `${t.left + t.width / 2 - (box.left + dx)}px`);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger(
        {
          ref: triggerRef,
          onClick: () => setOpen((o) => !o),
          'aria-expanded': open,
          'aria-controls': panelId,
          'aria-haspopup': 'dialog',
        },
        { open },
      )}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          onClick={
            closeOnPick
              ? (e) => {
                  if ((e.target as HTMLElement).closest('button')) close();
                }
              : undefined
          }
          className={cn(
            'absolute top-full z-30 mt-2 bg-surface-raised shadow-float',
            align === 'end' ? 'right-0' : 'left-0',
            // `cn` does not merge, so a caller's own size and padding replace the defaults rather than fight them.
            className ?? 'min-w-56 rounded-lg p-4',
          )}
        >
          {arrow && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 left-[calc(var(--arrow-x,1.25rem)-0.375rem)] size-3 rotate-45 rounded-tl-[2px] bg-surface-raised"
            />
          )}
          {children}
        </div>
      )}
    </div>
  );
}
