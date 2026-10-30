'use client';

import type { ComponentProps } from 'react';
import { Glyph } from '../art/glyph';
import { cn } from '../cn';

export interface YoButtonProps extends Omit<ComponentProps<'button'>, 'onClick' | 'children'> {
  count: number;
  /** Whether the current viewer has dropped a Yo. */
  active: boolean;
  onToggle: () => void;
}

/** One-tap Yo. Toggle button: state is exposed with aria-pressed, the emoji is decorative. */
export function YoButton({ count, active, onToggle, className, ...rest }: YoButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3.5 text-caption font-semibold transition duration-150',

        active
          ? 'border-accent bg-warning text-on-warning shadow-clay-pressed'
          : 'border-border bg-surface text-text-primary shadow-clay-sm',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className={cn('inline-flex', active && 'animate-yo-pop')}>
        <Glyph emoji="🤘" />
      </span>
      <span>Wave</span>
      <span className="text-metadata tabular-nums" aria-label={`${count} ${count === 1 ? 'wave' : 'waves'}`}>
        {count}
      </span>
    </button>
  );
}
