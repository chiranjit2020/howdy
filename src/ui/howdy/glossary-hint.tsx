'use client';

import { GLOSSARY, type GlossaryKey } from '@/shared/glossary';
import { cn } from '../cn';
import { Popover } from '../primitives/popover';

/** Small "?" next to a term's first appearance; tap/click reveals a one-line plain-English definition. */
export function GlossaryHint({ term }: { term: GlossaryKey }) {
  const entry = GLOSSARY[term];
  return (
    <Popover
      label={`What is ${entry.term}?`}
      arrow
      // A compact bubble, never wider than the phone allows, rather than a full panel.
      className="w-max max-w-[min(17rem,calc(100vw-2rem))] rounded-md px-3.5 py-2.5"
      trigger={(props, { open }) => (
        <button
          {...props}
          type="button"
          aria-label={`What is ${entry.term}?`}
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
      <p className="text-caption text-text-primary">
        <strong className="font-semibold">{entry.term}:</strong> {entry.definition}
      </p>
    </Popover>
  );
}
