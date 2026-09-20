'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Form-level message. Errors are announced (role="alert") and receive focus so keyboard and screen-reader users
 * land on what went wrong; success uses a polite status region.
 */
export function FormMessage({
  tone,
  children,
  focusKey,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
  /** Change this value to re-focus the message (e.g. on every failed submit). */
  focusKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tone === 'error') ref.current?.focus();
  }, [tone, focusKey]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md px-4 py-3 text-caption outline-offset-2',
        tone === 'error' && 'bg-danger-soft font-medium text-text-primary',
        tone === 'success' && 'bg-success text-on-success',
        tone === 'info' && 'bg-info text-on-info',
      )}
    >
      {children}
    </div>
  );
}

/** Focus the first invalid field after a failed submit (errors are linked with aria-describedby by <Input>). */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
