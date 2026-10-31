'use client';

import { GLOSSARY, type GlossaryKey } from '@/shared/glossary';
import { HelpTip } from '../primitives/help-tip';

/** A HelpTip for one of Howdy's own words (src/shared/glossary.ts): "Wall: The posts on a profile…". */
export function GlossaryHint({ term }: { term: GlossaryKey }) {
  const entry = GLOSSARY[term];
  return (
    <HelpTip label={`What is ${entry.term}?`}>
      <p>
        <strong className="font-semibold">{entry.term}:</strong> {entry.definition}
      </p>
    </HelpTip>
  );
}
