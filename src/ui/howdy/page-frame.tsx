import type { ReactNode } from 'react';

/**
 * Home's frame, for every page that follows it (Home, Profile, Friends, Visitors, Settings): the 672 px main column and,
 * on wide screens, the 18 rem right panel. A page with nothing for the panel still keeps its column, so its main column
 * sits exactly where Home's does instead of drifting to the middle of the screen (2026-11-01). On narrower screens the
 * panel (when there is one) follows the main column.
 */
export function PageFrame({
  children,
  rail,
  railLabel,
}: {
  children: ReactNode;
  /** The right panel's cards, if the page has any. */
  rail?: ReactNode;
  /** Its landmark name ("Add friends", "About visits"). */
  railLabel?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6">
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        {children}
      </main>
      {rail ? (
        <aside
          aria-label={railLabel}
          className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 xl:max-w-none"
        >
          {rail}
        </aside>
      ) : (
        // The panel's column, empty: it keeps the main column in Home's place.
        <div aria-hidden="true" className="hidden xl:block" />
      )}
    </div>
  );
}
