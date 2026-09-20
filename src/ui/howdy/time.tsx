/** Human, coarse relative time. Pure, so it is unit-testable. */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const sec = Math.round((now.getTime() - date.getTime()) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/** <time> with a machine-readable value. `suppressHydrationWarning`: server and client clocks differ by design. */
export function RelativeTime({ date, className }: { date: Date | string; className?: string }) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} suppressHydrationWarning className={className}>
      {formatRelative(d)}
    </time>
  );
}

/**
 * Tracks (profile visits) are deliberately imprecise: never a timestamp, only a coarse bucket.
 * This is a privacy rule, not just a style choice (see PRODUCT_DISCOVERY.md §4).
 */
export type CoarseWhen = 'today' | 'yesterday' | 'this-week';
export const COARSE_LABEL: Record<CoarseWhen, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This week',
};
