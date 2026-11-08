import Link from 'next/link';
import type { ReactNode } from 'react';
import { UsersIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { COARSE_LABEL, type CoarseWhen } from './time';

export interface TrackVisitor {
  name: string;
  handle: string;
  avatarUrl?: string | null;
}

/**
 * A Track = a profile-visit event. Only a coarse time bucket is ever shown (never a timestamp).
 * `visitor` is present only when the viewer is allowed to see who it was (e.g. Posse, no Shadow Walk on either side);
 * otherwise `hint` carries a k-anonymous clue and the visitor stays hidden. Flat: put rows in a `divide-y` list.
 */
export function TrackItem({
  visitor,
  hint,
  count,
  href,
  when,
  action,
}: {
  visitor?: TrackVisitor;
  hint?: string;
  /** For hidden visitors shown together: how many they stand for ("3 others"). Nothing else about them is known. */
  count?: number;
  /** Where the visitor's name goes (their Ranch), for named visitors. */
  href?: string;
  /** Left out when the list is already grouped under Today / Yesterday / This week. */
  when?: CoarseWhen;
  action?: ReactNode;
}) {
  const text = (
    <>
      <p className="truncate text-body font-semibold text-text-primary">
        {visitor ? visitor.name : count !== undefined && count !== 1 ? `${count} others` : 'Someone else'}
      </p>
      <p className="truncate text-caption text-text-secondary">
        {visitor ? `@${visitor.handle}` : (hint ?? 'Someone stopped by your profile.')}
      </p>
    </>
  );
  return (
    <li className="flex items-center gap-3 py-2.5">
      {visitor ? (
        <Avatar name={visitor.name} src={visitor.avatarUrl} />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-title text-text-primary"
        >
          <UsersIcon />
        </span>
      )}
      {href && visitor ? (
        <Link href={href} className="block min-h-11 min-w-0 flex-1 no-underline hover:underline">
          {text}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      {when && <span className="shrink-0 text-metadata text-text-muted">{COARSE_LABEL[when]}</span>}
      {action}
    </li>
  );
}
