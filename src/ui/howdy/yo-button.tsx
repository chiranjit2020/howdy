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
      title="Wave"
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-caption font-semibold transition-colors duration-150 pointer-fine:min-h-8',
        // The same look as a post's reaction button: violet tint when on, plain words when off.
        active
          ? 'bg-accent-soft text-accent'
          : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className={cn('inline-flex', active && 'animate-yo-pop')}>
        <Glyph emoji="👋" />
      </span>
      {/* The emoji says it on screen; the word is for screen readers. */}
      <span className="sr-only">Wave</span>
      <span className="text-metadata tabular-nums" aria-label={`${count} ${count === 1 ? 'wave' : 'waves'}`}>
        {count}
      </span>
    </button>
  );
}
