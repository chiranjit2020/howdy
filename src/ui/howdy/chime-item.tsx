import Link from 'next/link';
import { Glyph } from '../art/glyph';
import { cn } from '../cn';
import { RelativeTime } from './time';

export type ChimeType =
  | 'POST_CARD_CREATED'
  | 'POST_CARD_REPLIED'
  | 'TRACK_CREATED'
  | 'YO_DROPPED'
  | 'MARK_AWARDED'
  | 'TRIBUTE_CREATED'
  | 'WHISPER_RECEIVED'
  | 'POSSE_REQUESTED'
  | 'POSSE_ACCEPTED'
  | 'CARD_WAITING'
  | 'REPLY_WAITING'
  | 'CARD_APPROVED'
  | 'TOWNHALL_INVITED'
  | 'TOWNHALL_ACCEPTED'
  | 'CAPSULE_OPENED';

const ICON: Record<ChimeType, string> = {
  POST_CARD_CREATED: '📮',
  POST_CARD_REPLIED: '✍️',
  TRACK_CREATED: '👣',
  YO_DROPPED: '🤘',
  MARK_AWARDED: '💎',
  TRIBUTE_CREATED: '📜',
  WHISPER_RECEIVED: '🤫',
  POSSE_REQUESTED: '🤝',
  POSSE_ACCEPTED: '🤝',
  CARD_WAITING: '⏳',
  REPLY_WAITING: '⏳',
  CARD_APPROVED: '✅',
  TOWNHALL_INVITED: '🏛️',
  TOWNHALL_ACCEPTED: '🤝',
  CAPSULE_OPENED: '💌',
};

/** One notification ("Chime"). Unread is conveyed with text for assistive tech, not the dot alone. */
export function ChimeItem({
  type,
  text,
  createdAt,
  unread,
  href,
  onOpen,
}: {
  type: ChimeType;
  text: string;
  createdAt: Date | string;
  unread?: boolean;
  href?: string;
  /** Called when the link is followed (e.g. to mark the Chime read). */
  onOpen?: () => void;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-title"
      >
        <Glyph emoji={ICON[type]} size="badge" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-text-primary">
          {unread && <span className="sr-only">Unread: </span>}
          {text}
        </span>
        <RelativeTime
          date={createdAt}
          // Muted text falls just short of AA on the tinted unread background in Dusk, so unread uses the stronger colour.
          className={cn('text-metadata', unread ? 'text-text-secondary' : 'text-text-muted')}
        />
      </span>
      {unread && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-pill bg-accent" />}
    </>
  );
  const box = cn(
    'flex items-center gap-3 rounded-lg p-3 no-underline',
    unread ? 'bg-accent-soft' : 'bg-surface',
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={box} {...(onOpen ? { onClick: onOpen } : {})}>
          {content}
        </Link>
      ) : (
        <div className={box}>{content}</div>
      )}
    </li>
  );
}
