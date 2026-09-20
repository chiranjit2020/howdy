import type { ComponentProps } from 'react';
import { cn } from '../cn';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label'> {
  /** Required accessible name — icon-only controls have no visible text. */
  label: string;
  tone?: 'neutral' | 'accent';
}

export function IconButton({
  label,
  tone = 'neutral',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-title transition duration-150',
        'active:translate-y-0.5 motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
        tone === 'accent'
          ? 'bg-accent text-on-accent shadow-clay-sm hover:bg-accent-hover'
          : 'text-text-primary hover:bg-surface-sunken',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
