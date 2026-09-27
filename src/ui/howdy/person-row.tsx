import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { cn } from '../cn';
import { Avatar } from '../primitives/avatar';
import { VerifiedBadge } from './verified-badge';

/** One person in a list: portrait, name, @handle, and an actions slot. The name block links to their Ranch. */
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
      <span className="block text-body font-semibold [overflow-wrap:anywhere] text-text-primary">
        {displayName}
        {verified && <VerifiedBadge className="ml-1" />}
      </span>
      <span className="block text-caption [overflow-wrap:anywhere] text-text-secondary">
        @{handle}
        {note && <span className="text-text-muted"> · {note}</span>}
      </span>
    </>
  );
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg bg-surface-sunken p-3',
        !inlineActions && 'flex-wrap',
      )}
    >
      <Avatar name={displayName} tint={portraitTint} src={portraitUrl} />
      {/* A 12rem floor: when the actions do not fit beside the name, they wrap onto their own line instead of covering it. */}
      <div className={cn('min-w-0', inlineActions ? 'flex-1' : 'flex-[1_1_12rem]')}>
        {linkToRanch ? (
          // The whole name block is the link: a large target that reads as "Sneha Roy @sneha".
          <Link href={`/porch/${handle}`} className="block min-h-11 no-underline hover:underline">
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
