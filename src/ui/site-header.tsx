import Link from 'next/link';
import { cn } from './cn';
import { Badge } from './primitives/badge';

const LINK =
  'inline-flex min-h-11 items-center rounded-pill px-4 text-body font-medium no-underline transition-colors';

/** Top bar for signed-in pages (and Ranches, which may also be opened signed out). */
export function SiteHeader({
  handle,
  current,
  unread = 0,
  unreadWhispers = 0,
}: {
  handle?: string | undefined;
  current?: 'home' | 'ranch' | 'posse' | 'whispers' | 'tracks' | 'chimes' | 'workshop';
  /** Unread Chimes (already filtered for this person). Shown next to "Chimes" when above zero. */
  unread?: number;
  /** Whisper threads with something new (already filtered for this person). */
  unreadWhispers?: number;
}) {
  const item = (
    href: string,
    label: string,
    key: 'home' | 'ranch' | 'posse' | 'whispers' | 'tracks' | 'chimes' | 'workshop',
    badge?: number,
  ) => (
    <li key={key}>
      <Link
        href={href}
        aria-current={current === key ? 'page' : undefined}
        className={cn(
          LINK,
          current === key ? 'bg-accent text-on-accent' : 'text-text-primary hover:bg-surface-sunken',
        )}
      >
        {label}
        {badge !== undefined && badge > 0 && (
          <>
            <span className="sr-only">, </span>
            <Badge tone="accent" className="ml-2">
              {badge > 99 ? '99+' : badge}
              <span className="sr-only"> unread</span>
            </Badge>
          </>
        )}
      </Link>
    </li>
  );
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <Link
          href={handle ? '/home' : '/gate'}
          className="inline-flex min-h-11 items-center font-display text-title text-text-primary no-underline"
        >
          Howdy
        </Link>
        <nav aria-label="Primary">
          <ul className="flex flex-wrap items-center gap-1">
            {handle ? (
              <>
                {item('/home', 'Home', 'home')}
                {item(`/ranch/${handle}`, 'My Ranch', 'ranch')}
                {item('/posse', 'Posse', 'posse')}
                {item('/tracks', 'Tracks', 'tracks')}
                {item('/whispers', 'Whispers', 'whispers', unreadWhispers)}
                {item('/chimes', 'Chimes', 'chimes', unread)}
                {item('/workshop', 'Workshop', 'workshop')}
              </>
            ) : (
              <li>
                <Link href="/step-inside" className={cn(LINK, 'text-text-primary hover:bg-surface-sunken')}>
                  Step Inside
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
