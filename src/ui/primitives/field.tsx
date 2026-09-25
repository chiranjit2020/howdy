'use client';

import { useId, useState, type ChangeEvent, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';

interface ControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

interface FieldShellProps {
  id?: string | undefined;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Extra element ids to list in aria-describedby (e.g. a character counter). */
  extraDescribedBy?: string | undefined;
  /** Keep the label for assistive tech but do not paint it (the control's placeholder or icon says the same thing). */
  hideLabel?: boolean | undefined;
  children: (control: ControlProps) => ReactNode;
  className?: string | undefined;
}

/** Label + control + hint + error, wired together with ids so screen readers announce them. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  extraDescribedBy,
  hideLabel,
  children,
  className,
}: FieldShellProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId, extraDescribedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={fieldId}
        className={hideLabel ? 'sr-only' : 'text-caption font-semibold text-text-primary'}
      >
        {label}
      </label>
      {children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-metadata text-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border border-border bg-surface-sunken px-4 py-2.5 text-body text-text-primary ' +
  'placeholder:text-text-muted shadow-clay-pressed transition disabled:cursor-not-allowed disabled:opacity-60 ' +
  // A soft glow while typing, on top of the focus outline (which keyboard users still get).
  'focus:border-focus focus:ring-4 focus:ring-focus/25 ' +
  'aria-invalid:border-danger aria-invalid:border-2';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  prefix,
  ...rest
}: FieldProps &
  Omit<ComponentProps<'input'>, 'prefix'> & {
    /** Fixed text painted inside the box before what is typed (e.g. "@"). Not part of the value. */
    prefix?: string;
  }) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      {(c) =>
        prefix ? (
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-body text-text-secondary"
            >
              {prefix}
            </span>
            <input className={cn(CONTROL, 'min-h-11 pl-9')} {...c} {...rest} />
          </div>
        ) : (
          <input className={cn(CONTROL, 'min-h-11')} {...c} {...rest} />
        )
      }
    </FieldShell>
  );
}

export function Select({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...rest
}: FieldProps & ComponentProps<'select'>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      {(c) => (
        <select className={cn(CONTROL, 'min-h-11')} {...c} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export interface TextareaProps extends FieldProps, ComponentProps<'textarea'> {
  /** Show a live "used/max" counter (requires maxLength). */
  showCount?: boolean;
}

export function Textarea({
  label,
  hint,
  error,
  showCount,
  className,
  id,
  maxLength,
  onChange,
  value,
  defaultValue,
  ...rest
}: TextareaProps) {
  const counterId = useId();
  const [uncontrolledLen, setLen] = useState(String(defaultValue ?? '').length);
  const len = value !== undefined ? String(value).length : uncontrolledLen;
  const counting = showCount && maxLength !== undefined;
  const nearLimit = counting && maxLength - len <= Math.ceil(maxLength * 0.1);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setLen(e.target.value.length);
    onChange?.(e);
  }

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      extraDescribedBy={counting ? counterId : undefined}
      className={className}
    >
      {(c) => (
        <>
          <textarea
            className={cn(CONTROL, 'min-h-24 resize-y')}
            maxLength={maxLength}
            onChange={handleChange}
            {...(value !== undefined ? { value } : { defaultValue })}
            {...c}
            {...rest}
          />
          {counting && (
            <p
              id={counterId}
              className={cn(
                'self-end font-mono text-metadata',
                nearLimit ? 'text-danger' : 'text-text-muted',
              )}
            >
              <span className="sr-only">Characters used: </span>
              {len}/{maxLength}
            </p>
          )}
        </>
      )}
    </FieldShell>
  );
}
