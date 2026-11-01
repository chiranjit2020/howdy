import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { cn } from '../cn';
import { Avatar } from '../primitives/avatar';
import { VerifiedBadge } from './verified-badge';

/**
 * One person in a list: portrait, name, @handle, and an actions slot. The name block links to their Ranch. Flat: put rows
 * in a `divide-y divide-border` list. A long name or handle is cut with "…" on one line, never broken mid-word.
 */
export function PersonRow({
  displayName,
  handle,
  portraitTint,
  portraitUrl,
  actions,
  note,
  linkToRanch = true,
  verified,
  inlineActions = false,
}: {
  displayName: string;
  handle: string;
  portraitTint?: PortraitTint | undefined;
  /** Their photo, when the viewer may see it; initials otherwise. */
  portraitUrl?: string | undefined;
  actions?: ReactNode;
  /** Small secondary line, e.g. "asked to join your Posse". */
  note?: ReactNode;
  /** False for people whose Ranch the viewer cannot open (e.g. someone they blocked). */
  linkToRanch?: boolean;
  /** The Howdy team account: the Verified badge follows the name. */
  verified?: boolean | undefined;
  /** Small icon actions: kept on the name's line; a long name wraps beside them instead. */
  inlineActions?: boolean;
}) {
  const text = (
    <>
      <span className="block truncate text-body font-semibold text-text-primary">
        {displayName}
        {verified && <VerifiedBadge className="ml-1" />}
      </span>
      {/* The handle gives way first: a short note ("Close friend") always stays whole. */}
      <span className="flex min-w-0 text-caption text-text-secondary">
        <span className="truncate">@{handle}</span>
        {note && <span className="shrink-0 whitespace-pre text-text-muted"> · {note}</span>}
      </span>
    </>
  );
  return (
    <li className={cn('flex items-center gap-3 py-2.5', !inlineActions && 'flex-wrap')}>
      <Avatar name={displayName} tint={portraitTint} src={portraitUrl} />
      {/* A 12rem floor: when the actions do not fit beside the name, they wrap onto their own line instead of covering it. */}
      <div className={cn('min-w-0', inlineActions ? 'flex-1' : 'flex-[1_1_12rem]')}>
        {linkToRanch ? (
          // The whole name block is the link: a large target that reads as "Sneha Roy @sneha".
          <Link href={`/profile/${handle}`} className="block min-h-11 no-underline hover:underline">
            {text}
          </Link>
        ) : (
          <div className="min-h-11">{text}</div>
        )}
      </div>
      {actions && (
        <div
          className={cn('ml-auto flex items-center', inlineActions ? 'shrink-0 gap-1' : 'flex-wrap gap-2')}
        >
          {actions}
        </div>
      )}
    </li>
  );
}
