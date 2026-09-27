'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { LegalSection } from '@/shared/legal-markdown';
import { cn } from '@/ui/cn';

/**
 * A thin bar under the top bar that fills as you read. Decorative (the scroll position already says the same), so it
 * is hidden from screen readers. A native <progress>: no inline style, which our CSP forbids.
 */
export function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 100);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <progress
      aria-hidden="true"
      max={100}
      value={Math.round(pct)}
      className="fixed inset-x-0 top-16 z-20 h-1 w-full appearance-none bg-transparent [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-accent"
    />
  );
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * "On this page": a sticky list beside the text on wide screens, a fold-out list above it on phones and tablets. The
 * section you are reading is marked (aria-current). Choosing one scrolls there smoothly (instantly with reduced
 * motion), updates the address so the link can be shared, and moves keyboard focus to that section's heading.
 */
export function LegalContents({ sections }: { sections: LegalSection[] }) {
  const [active, setActive] = useState<string | undefined>(sections[0]?.id);
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // A heading counts as "current" once it reaches the upper part of the screen.
      { rootMargin: '-80px 0px -65% 0px' },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [sections]);

  function go(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
    history.replaceState(null, '', `#${id}`);
    setActive(id);
    if (details.current) details.current.open = false;
  }

  const list = (
    <ol className="flex flex-col gap-0.5">
      {sections.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            onClick={(e) => go(e, s.id)}
            aria-current={active === s.id ? 'location' : undefined}
            className={cn(
              'block rounded-md border-l-2 px-3 py-2 text-caption transition-colors',
              active === s.id
                ? 'border-accent bg-accent-soft font-semibold text-text-primary'
                : 'border-transparent text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
            )}
          >
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );

  if (sections.length === 0) return null;
  return (
    <>
      <details ref={details} className="clay group p-0 xl:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-body font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
          On this page
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <nav aria-label="On this page" className="px-3 pb-3">
          {list}
        </nav>
      </details>
      <nav
        aria-label="On this page"
        className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto xl:block"
      >
        <p className="px-3 pb-2 text-metadata tracking-wide text-text-secondary uppercase">On this page</p>
        {list}
      </nav>
    </>
  );
}
