'use client';

import { useId, useState, type ChangeEvent, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';
import { AlertIcon, EyeIcon, EyeOffIcon } from '../icons';

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
  /** A small link or button at the end of the label row (e.g. "Forgot password?"). Outside the <label> itself. */
  labelAction?: ReactNode;
  /** `entry`: the sign-up look (the "@" set apart as its own block). Default: the app's ordinary fields. */
  look?: FieldLook | undefined;
  children: (control: ControlProps) => ReactNode;
  className?: string | undefined;
}

export type FieldLook = 'default' | 'entry';

const LABEL: Record<FieldLook, string> = {
  default: 'text-caption font-semibold text-text-primary',
  // Same label as everywhere else (the mono capitals from the design mockup made sign-up read unlike the rest of Howdy).
  entry: 'text-caption font-semibold text-text-primary',
};

/** Label + control + hint + error, wired together with ids so screen readers announce them. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  extraDescribedBy,
  hideLabel,
  labelAction,
  look = 'default',
  children,
  className,
}: FieldShellProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId, extraDescribedBy].filter(Boolean).join(' ') || undefined;
  const labelEl = (
    <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : LABEL[look]}>
      {label}
    </label>
  );
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {labelAction ? (
        <div className="flex items-center justify-between gap-3">
          {labelEl}
          {labelAction}
        </div>
      ) : (
        labelEl
      )}
      {children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        // A div, not a p: a hint may hold a list (the password checklist).
        <div id={hintId} className="text-metadata text-text-secondary">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-caption font-medium text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border border-border-strong/50 bg-surface px-3.5 py-2.5 text-body text-text-primary ' +
  'placeholder:text-text-muted transition-colors hover:border-border-strong disabled:cursor-not-allowed ' +
  'disabled:bg-surface-sunken disabled:opacity-60 ' +
  // A thin ring while typing, on top of the focus outline (which keyboard users still get).
  'focus:border-focus focus:ring-2 focus:ring-focus/20 ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/20';

// Sign-up's boxes are the same white boxes as Log in (2026-10-30: the tinted ones made the two pages look unrelated).
const CONTROLS: Record<FieldLook, string> = { default: CONTROL, entry: CONTROL };

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Small text or a link at the end of the label row ("Optional", "Forgot password?", a live check). */
  labelAction?: ReactNode;
  look?: FieldLook;
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  prefix,
  labelAction,
  look = 'default',
  hideLabel,
  ...rest
}: FieldProps &
  Omit<ComponentProps<'input'>, 'prefix'> & {
    /** Fixed text painted inside the box before what is typed (e.g. "@"). Not part of the value. */
    prefix?: string;
    /** Keep the label for screen readers but do not paint it (the placeholder says the same thing). */
    hideLabel?: boolean;
  }) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      labelAction={labelAction}
      look={look}
      className={className}
    >
      {(c) =>
        prefix ? (
          <div className="relative">
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 flex items-center text-body text-text-secondary',
                // The entry look sets the prefix apart as its own little block, like part of the box.
                look === 'entry'
                  ? 'my-px ml-px w-10 justify-center rounded-l-md border-r border-border-strong/30 font-semibold'
                  : 'pl-4',
              )}
            >
              {prefix}
            </span>
            <input
              className={cn(CONTROLS[look], 'min-h-11', look === 'entry' ? 'pl-13' : 'pl-9')}
              {...c}
              {...rest}
            />
          </div>
        ) : (
          <input className={cn(CONTROLS[look], 'min-h-11')} {...c} {...rest} />
        )
      }
    </FieldShell>
  );
}

/**
 * Password box with a show/hide toggle. The toggle is a real button (type=button so it never submits) whose name says
 * what it will do; it comes right after the input, so Tab from the password reaches it.
 */
export function PasswordInput({
  label,
  hint,
  error,
  labelAction,
  look = 'default',
  className,
  id,
  ...rest
}: FieldProps & Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelAction={labelAction}
      look={look}
      className={className}
    >
      {(c) => (
        <div className="relative">
          <input
            className={cn(CONTROLS[look], 'min-h-11 pr-12')}
            type={visible ? 'text' : 'password'}
            autoCapitalize="none"
            spellCheck={false}
            {...c}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-controls={c.id}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-text-secondary transition-colors hover:text-text-primary"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      )}
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
            className={cn(CONTROL, 'min-h-24 resize-none')}
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
                'self-end text-metadata tabular-nums',
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
