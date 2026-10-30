import type { ComponentProps } from 'react';
import { cn } from '../cn';
import { SpinnerIcon } from '../icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Disabled is neutral grey, never a faded brand colour: filled buttons lose their fill, every button its colour.
const DISABLED_FILL = 'disabled:bg-surface-sunken aria-disabled:bg-surface-sunken disabled:shadow-none';

const VARIANT: Record<ButtonVariant, string> = {
  primary: cn('bg-primary text-on-primary shadow-clay-sm hover:bg-primary-hover', DISABLED_FILL),
  secondary: 'bg-surface text-text-primary border border-border shadow-clay-sm hover:bg-surface-sunken',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-sunken',
  danger: cn('bg-danger text-on-danger shadow-clay-sm hover:opacity-90', DISABLED_FILL),
  /** Words that act, like a link: no fill, no border. For small actions beside content (Send, Remove). */
  link: 'bg-transparent text-accent hover:underline',
};

// Every size keeps a >=44px touch target on touch screens (min-h-11); with a mouse it is desktop-sized: 32 / 36 / 40 px.
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 pointer-fine:min-h-8 text-caption',
  md: 'min-h-11 pointer-fine:min-h-9 text-caption',
  lg: 'min-h-12 pointer-fine:min-h-10 text-body',
};
// Kept apart from SIZE so `compact` can replace it (cn does not merge conflicting classes).
const PADDING: Record<ButtonSize, string> = { sm: 'px-3', md: 'px-4', lg: 'px-6' };

/** Class list shared by <Button> and link-styled-as-button (`<Link className={buttonClasses()}>`). */
export function buttonClasses(
  opts: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    /** Tight side padding, for several buttons sharing one row on a phone. */
    compact?: boolean;
  } = {},
): string {
  const { variant = 'primary', size = 'md', fullWidth, compact } = opts;
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold select-none no-underline',
    'transition-colors duration-150 ease-out active:shadow-clay-pressed',
    // pointer-events-none: no hover colour on a disabled button (it would bring the brand colour back).
    'disabled:pointer-events-none disabled:text-text-muted aria-disabled:pointer-events-none aria-disabled:text-text-muted',
    VARIANT[variant],
    // A link is only as tall as its words with a mouse; a finger still gets 44 px.
    variant === 'link'
      ? 'min-h-11 px-1 text-caption pointer-fine:min-h-0'
      : cn(SIZE[size], compact ? 'px-2.5 whitespace-nowrap' : PADDING[size]),
    fullWidth && 'w-full',
  );
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  compact?: boolean;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  compact,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses({ variant, size, fullWidth, compact }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <SpinnerIcon className="animate-spin-slow" />}
      {children}
    </button>
  );
}
