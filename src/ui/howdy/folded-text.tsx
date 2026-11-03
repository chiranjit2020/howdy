'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../cn';

/**
 * A post's words, folded after six lines with "Read more" under them, so one long post never pushes the feed off the
 * screen (posts allow 500 characters since 2026-11-03). The button only appears when the text is really cut: it is
 * measured, not guessed from the length, because line breaks and narrow screens change where six lines end.
 */
export function FoldedText({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setCut(el.scrollHeight > el.clientHeight + 1);
    measure();
    // Old browsers (and test pages) have no ResizeObserver: measured once, never a crash.
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [children, open]);

  return (
    <div className="flex flex-col items-start gap-1">
      <p ref={ref} className={cn('break-words whitespace-pre-wrap', !open && 'line-clamp-6', className)}>
        {children}
      </p>
      {cut && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-my-3 inline-flex min-h-11 items-center text-caption font-semibold text-text-secondary hover:text-text-primary hover:underline pointer-fine:my-0 pointer-fine:min-h-0"
        >
          Read more
        </button>
      )}
    </div>
  );
}
