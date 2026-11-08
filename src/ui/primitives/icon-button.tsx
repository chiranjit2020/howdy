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
        'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-title transition duration-150 pointer-fine:size-9',
        'disabled:pointer-events-none disabled:text-text-muted',
        tone === 'accent'
          ? 'bg-primary text-on-primary shadow-clay-sm hover:bg-primary-hover disabled:bg-surface-sunken disabled:shadow-none'
          : 'text-text-primary hover:bg-surface-sunken',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
