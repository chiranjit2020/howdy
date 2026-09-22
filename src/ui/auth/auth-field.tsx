'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';
import { EyeIcon, EyeOffIcon } from '../icons';
import { FieldShell } from '../primitives';

/**
 * A pill-shaped sign-in field: a leading icon, the placeholder saying what goes here, and for passwords a show/hide toggle.
 * The label is kept for screen readers (`hideLabel`), so nothing is lost by not painting it.
 */
export function AuthField({
  label,
  icon,
  error,
  suffix,
  className,
  id,
  type = 'text',
  ...rest
}: {
  label: string;
  icon: ReactNode;
  error?: ReactNode;
  /** Quiet hint shown at the right edge of the field, e.g. "@yourname". Decorative. */
  suffix?: string;
} & Omit<ComponentProps<'input'>, 'placeholder'> & { placeholder: string }) {
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  return (
    <FieldShell id={id} label={label} error={error} hideLabel className={className}>
      {(c) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-title text-text-muted"
          >
            {icon}
          </span>
          <input
            {...c}
            {...rest}
            type={isPassword && shown ? 'text' : type}
            className={cn(
              'min-h-14 w-full rounded-pill border border-field-border bg-field pl-13 text-body text-text-primary shadow-field',
              'placeholder:text-text-muted focus-visible:rounded-pill disabled:cursor-not-allowed disabled:opacity-60',
              'aria-invalid:border-2 aria-invalid:border-danger',
              isPassword || suffix ? 'pr-14' : 'pr-5',
              suffix && 'pr-28',
            )}
          />
          {suffix && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-caption text-text-muted"
            >
              {suffix}
            </span>
          )}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShown((s) => !s)}
              aria-label={shown ? 'Hide password' : 'Show password'}
              aria-pressed={shown}
              className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-pill text-title text-text-muted hover:bg-surface-sunken"
            >
              {shown ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
        </div>
      )}
    </FieldShell>
  );
}
