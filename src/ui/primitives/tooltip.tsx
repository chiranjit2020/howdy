'use client';

import { cloneElement, useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';

/**
 * Supplementary label for a control (never the only carrier of essential info).
 * Shown on hover and keyboard focus, hoverable, dismissible with Escape (WCAG 1.4.13).
 * The wrapped child must accept `aria-describedby`.
 */
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 250);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="pointer-events-auto absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-64 -translate-x-1/2 rounded-md bg-text-primary px-3 py-1.5 text-metadata text-background shadow-float"
      >
        {content}
      </span>
    </span>
  );
}
