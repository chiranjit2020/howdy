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
          className="ml-1.5 inline-grid size-6 shrink-0 place-items-center rounded-full align-middle text-metadata font-semibold text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
        >
          <span aria-hidden="true">?</span>
        </button>
      )}
    >
      <p className="max-w-64 text-body text-text-primary">{entry.definition}</p>
    </Popover>
  );
}
