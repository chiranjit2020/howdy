import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * A card in a right panel (Home's, a profile's): white, with a 6 px "caution tape" stripe along the top — violet and
 * sunflower at 45 degrees — a small uppercase title, and an optional link or button at the end of the title row.
 */
export const RAIL_CARD =
  'relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 pt-6 ' +
  'before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:content-[""] ' +
  'before:bg-[repeating-linear-gradient(-45deg,var(--color-accent)_0_8px,var(--color-highlight)_8px_16px)]';
export const RAIL_TITLE = 'text-metadata font-semibold tracking-wider text-text-secondary uppercase';
export const RAIL_MORE = 'text-caption font-semibold';

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
      <div className="flex items-baseline justify-between gap-2">
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
