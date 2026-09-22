import type { ComponentProps } from 'react';
import { cn } from '../cn';
import { SpinnerIcon } from '../icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'cta' | 'cta-success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent shadow-clay-sm hover:bg-accent-hover',
  secondary: 'bg-surface text-text-primary border border-border shadow-clay-sm hover:bg-surface-sunken',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-sunken',
  danger: 'bg-danger text-on-danger shadow-clay-sm hover:opacity-90',
  // The sign-in pills: peach for "Step Inside", mint for "Create My Account".
  cta: 'bg-cta text-on-cta shadow-cta hover:bg-cta-hover',
  'cta-success': 'bg-cta-success text-on-cta shadow-cta hover:bg-cta-success-hover',
};

// Every size keeps a >=44px touch target on touch devices (min-h-11); `sm` shrinks only with a fine pointer.
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 pointer-fine:min-h-9 px-4 text-caption',
  md: 'min-h-11 px-5 text-body',
  lg: 'min-h-12 px-7 text-title',
};

/** Class list shared by <Button> and link-styled-as-button (`<Link className={buttonClasses()}>`). */
export function buttonClasses(
  opts: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {},
): string {
  const { variant = 'primary', size = 'md', fullWidth } = opts;
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-pill font-semibold select-none no-underline',
    'transition duration-150 ease-out active:translate-y-0.5 active:shadow-clay-pressed motion-reduce:active:translate-y-0',
    'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
  );
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
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
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <SpinnerIcon className="animate-spin-slow" />}
      {children}
    </button>
  );
}
