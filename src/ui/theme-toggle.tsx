'use client';

import { useState } from 'react';
import { Chip } from './primitives';
import { applyTheme, type Theme } from './theme';

type Choice = Theme | 'system';
const CHOICES: { id: Choice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'daylight', label: 'Daylight' },
  { id: 'dusk', label: 'Dusk' },
];

/** Daylight / Dusk / System. */
export function ThemeToggle({ initial }: { initial?: Theme | undefined }) {
  const [choice, setChoice] = useState<Choice>(initial ?? 'system');

  return (
    <div role="group" aria-label="Theme" className="flex flex-wrap gap-2">
      {CHOICES.map((c) => (
        <Chip
          key={c.id}
          selected={choice === c.id}
          onSelect={() => {
            setChoice(c.id);
            applyTheme(c.id);
          }}
        >
          {c.label}
        </Chip>
      ))}
    </div>
  );
}
