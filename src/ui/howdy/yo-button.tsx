'use client';

import type { ComponentProps } from 'react';
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
        'active:translate-y-0.5 motion-reduce:active:translate-y-0',
        active
          ? 'border-accent bg-warning text-on-warning shadow-clay-pressed'
          : 'border-border-strong bg-surface text-text-primary shadow-clay-sm',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className={cn(active && 'animate-yo-pop')}>
        🤘
      </span>
      <span>Yo</span>
      <span className="font-mono text-metadata" aria-label={`${count} ${count === 1 ? 'Yo' : 'Yos'}`}>
        {count}
      </span>
    </button>
  );
}
