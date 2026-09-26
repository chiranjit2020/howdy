import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '../primitives/avatar';
import { Badge } from '../primitives/badge';
import { COARSE_LABEL, type CoarseWhen } from './time';

export interface TrackVisitor {
  name: string;
  handle: string;
  avatarUrl?: string | null;
}

/**
 * A Track = a profile-visit event. Only a coarse time bucket is ever shown (never a timestamp).
 * `visitor` is present only when the viewer is allowed to see who it was (e.g. Posse, no Shadow Walk on either side);
 * otherwise `hint` carries a k-anonymous clue and the visitor stays hidden.
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
  /** For hidden visitors shown together: how many they stand for ("3 hidden tracks"). Nothing else about them is known. */
  count?: number;
  /** Where the visitor's name goes (their Ranch), for named visitors. */
  href?: string;
  when: CoarseWhen;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-clay-sm">
      {visitor ? (
        <Avatar name={visitor.name} src={visitor.avatarUrl} />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-11 items-center justify-center rounded-pill bg-mystery text-title text-on-mystery"
        >
          👣
        </span>
      )}
      {(() => {
        const text = (
          <>
            <p className="truncate text-body font-semibold text-text-primary">
              {visitor
                ? visitor.name
                : count !== undefined && count !== 1
                  ? `${count} hidden tracks`
                  : 'Hidden track'}
              {!visitor && (
                <Badge tone="mystery" className="ml-2 align-middle">
                  Anonymous
                </Badge>
              )}
            </p>
            <p className="text-caption [overflow-wrap:anywhere] text-text-secondary">
              {visitor ? `@${visitor.handle}` : (hint ?? 'Someone stopped by your Porch.')}
            </p>
          </>
        );
        return href && visitor ? (
          <Link href={href} className="block min-h-11 min-w-0 flex-1 no-underline hover:underline">
            {text}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{text}</div>
        );
      })()}
      <span className="shrink-0 text-metadata text-text-muted">{COARSE_LABEL[when]}</span>
      {action}
    </li>
  );
}
