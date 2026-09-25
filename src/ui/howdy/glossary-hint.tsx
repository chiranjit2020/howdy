'use client';

import { GLOSSARY, type GlossaryKey } from '@/shared/glossary';
import { Popover } from '../primitives/popover';

/** Small "?" next to a term's first appearance; tap/click reveals a one-line plain-English definition. */
export function GlossaryHint({ term }: { term: GlossaryKey }) {
  const entry = GLOSSARY[term];
  return (
    <Popover
      label={`What is ${entry.term}?`}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`What is ${entry.term}?`}
          // A 44px touch target around a 24px circle; the negative margins keep the heading row from growing.
          className="group -my-2.5 -mr-2.5 -ml-1 inline-grid size-11 shrink-0 place-items-center rounded-full align-middle"
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full text-metadata font-semibold text-text-secondary transition-colors group-hover:bg-surface-sunken group-hover:text-text-primary"
          >
            ?
          </span>
        </button>
      )}
    >
      <p className="max-w-64 text-body text-text-primary">{entry.definition}</p>
    </Popover>
  );
}
