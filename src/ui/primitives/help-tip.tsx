'use client';

import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Popover } from './popover';

/**
 * The small "?" that explains something in place: next to a heading, a setting or a word people may not know. A tap or
 * click opens a compact bubble with the explanation; Escape, a click outside or the "?" again closes it. One look for
 * every hint in the app. `label` is what a screen reader hears for the button and the bubble ("What is a wall?").
 * Keep the content to a sentence or two.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover
      label={label}
      arrow
      // A compact bubble, never wider than the phone allows, rather than a full panel.
      className="w-max max-w-[min(17rem,calc(100vw-2rem))] rounded-md px-3.5 py-2.5"
      trigger={(props, { open }) => (
        <button
          {...props}
          type="button"
          aria-label={label}
          // A 44px touch target around a 22px circle; the negative margins keep the heading row from growing.
          className="group -my-2.5 -mr-2.5 inline-grid size-11 shrink-0 place-items-center rounded-full align-middle"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-5.5 place-items-center rounded-full border text-metadata leading-none font-bold transition-colors',
              open
                ? 'border-text-primary bg-text-primary text-background'
                : 'border-border bg-surface text-text-secondary group-hover:border-text-secondary group-hover:text-text-primary',
            )}
          >
            ?
          </span>
        </button>
      )}
    >
      <div className="text-caption text-text-primary">{children}</div>
    </Popover>
  );
}
