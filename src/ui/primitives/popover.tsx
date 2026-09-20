'use client';

import { useCallback, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { cn } from '../cn';
import { useDismiss } from './use-dismiss';

export interface TriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-haspopup': 'dialog';
}

/**
 * Non-modal floating panel anchored to its trigger. Closes on Escape / outside press and returns focus to the trigger.
 * Placement is CSS-only (below the trigger, start- or end-aligned); no collision detection.
 */
export function Popover({
  trigger,
  children,
  label,
  align = 'start',
  className,
}: {
  trigger: (props: TriggerProps, state: { open: boolean }) => ReactNode;
  children: ReactNode;
  /** Accessible name of the panel. */
  label: string;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismiss(open, [rootRef], close);

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
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute top-full z-30 mt-2 min-w-56 rounded-lg bg-surface-raised p-4 shadow-float',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
