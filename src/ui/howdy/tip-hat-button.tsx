'use client';

import type { ComponentProps } from 'react';
import { Glyph } from '../art/glyph';
import { cn } from '../cn';

export interface TipHatButtonProps extends Omit<ComponentProps<'button'>, 'onClick' | 'children'> {
  /** Already tipped today (the server enforces the real limit). */
  tipped: boolean;
  onTip: () => void;
}

/** Zero-text nudge ("I see you"). Once tipped the control is disabled and says so. */
export function TipHatButton({ tipped, onTip, className, ...rest }: TipHatButtonProps) {
  return (
    <button
      type="button"
      onClick={onTip}
      disabled={tipped}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-4 text-caption font-semibold text-text-primary',
        'shadow-clay-sm transition-colors duration-150 hover:bg-surface-sunken disabled:bg-success disabled:text-on-success disabled:shadow-clay-pressed',
        className,
      )}
      {...rest}
    >
      <Glyph emoji="🤠" />
      {tipped ? 'Hat tipped' : 'Tip hat'}
    </button>
  );
}
