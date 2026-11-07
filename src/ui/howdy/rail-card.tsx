import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * A card in a right panel (Home's, a profile's): white, the shared card corners (20 px), a small uppercase title, and an optional
 * link or button at the end of the title row. (The sunflower bar along the top was removed 2026-11-07.)
 */
export const RAIL_CARD =
  'relative flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4 shadow-clay';
export const RAIL_TITLE = 'text-caption font-bold tracking-wider text-text-secondary uppercase';
/** 44 px to tap on touch screens, without making the title row any taller (the negative margin takes it back). */
export const RAIL_MORE =
  '-my-3 inline-flex min-h-11 items-center text-caption font-semibold pointer-fine:my-0 pointer-fine:min-h-0';

export function RailCard({
  id,
  title,
  more,
  action,
  children,
}: {
  id: string;
  title: string;
  /** A link at the end of the title row ("See all"). */
  more?: { href: string; label: string };
  /** Or anything else there (a button). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={RAIL_CARD}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className={RAIL_TITLE}>
          {title}
        </h2>
        {more && (
          <Link href={more.href} className={RAIL_MORE}>
            {more.label}
          </Link>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}
