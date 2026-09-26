import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { Avatar } from '../primitives/avatar';

/** One person in a list: portrait, name, @handle, and an actions slot. The name block links to their Ranch. */
export function PersonRow({
  displayName,
  handle,
  portraitTint,
  actions,
  note,
  linkToRanch = true,
}: {
  displayName: string;
  handle: string;
  portraitTint?: PortraitTint | undefined;
  actions?: ReactNode;
  /** Small secondary line, e.g. "asked to join your Posse". */
  note?: ReactNode;
  /** False for people whose Ranch the viewer cannot open (e.g. someone they blocked). */
  linkToRanch?: boolean;
}) {
  const text = (
    <>
      <span className="block text-body font-semibold [overflow-wrap:anywhere] text-text-primary">
        {displayName}
      </span>
      <span className="block text-caption [overflow-wrap:anywhere] text-text-secondary">
        @{handle}
        {note && <span className="text-text-muted"> · {note}</span>}
      </span>
    </>
  );
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-sunken p-3">
      <Avatar name={displayName} tint={portraitTint} />
      {/* A 12rem floor: when the actions do not fit beside the name, they wrap onto their own line instead of covering it. */}
      <div className="min-w-0 flex-[1_1_12rem]">
        {linkToRanch ? (
          // The whole name block is the link: a large target that reads as "Sneha Roy @sneha".
          <Link href={`/porch/${handle}`} className="block min-h-11 no-underline hover:underline">
            {text}
          </Link>
        ) : (
          <div className="min-h-11">{text}</div>
        )}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </li>
  );
}
