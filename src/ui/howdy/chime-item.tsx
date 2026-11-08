import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  PiCheck,
  PiClock,
  PiChatCircle,
  PiChatsCircle,
  PiEye,
  PiHeart,
  PiHourglass,
  PiNote,
  PiBuildings,
  PiUsers,
  PiUserPlus,
  PiQuotes,
  PiArrowBendUpLeft,
  PiTag,
} from 'react-icons/pi';
import type { PortraitTint } from '@/shared/validation/profile';
import { cn } from '../cn';
import { Avatar } from '../primitives/avatar';
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

/** What happened, as a line icon (Phosphor, like the rest of the app) in the sunflower badge on the person's photo. */
const ICON: Record<ChimeType, ComponentType<IconBaseProps>> = {
  POST_CARD_CREATED: PiNote,
  POST_CARD_REPLIED: PiArrowBendUpLeft,
  TRACK_CREATED: PiEye,
  YO_DROPPED: PiHeart,
  MARK_AWARDED: PiTag,
  TRIBUTE_CREATED: PiQuotes,
  WHISPER_RECEIVED: PiChatsCircle,
  POSSE_REQUESTED: PiUserPlus,
  POSSE_ACCEPTED: PiUsers,
  CARD_WAITING: PiClock,
  REPLY_WAITING: PiChatCircle,
  CARD_APPROVED: PiCheck,
  TOWNHALL_INVITED: PiBuildings,
  TOWNHALL_ACCEPTED: PiBuildings,
  CAPSULE_OPENED: PiHourglass,
};

/**
 * One notification ("Chime"), as a row in the notifications card: the person's photo (or initials) with what happened as
 * a small sunflower badge (violet icon) in its corner, the words, and when. Unread rows are tinted with a red dot, and say "Unread" to
 * screen readers (not the colour alone).
 */
export function ChimeItem({
  type,
  text,
  createdAt,
  unread,
  href,
  onOpen,
  menu,
  person,
}: {
  type: ChimeType;
  text: string;
  createdAt: Date | string;
  unread?: boolean;
  href?: string;
  /** Called when the link is followed (e.g. to mark the Chime read). */
  onOpen?: () => void;
  /** A "more" menu at the end of the row, beside the link (not inside it): mark read or unread, remove. */
  menu?: ReactNode;
  /** Who it is about. `src` only when the viewer may see their photo; otherwise their initials. */
  person: { name: string; tint?: PortraitTint | undefined; src?: string | undefined };
}) {
  const Icon = ICON[type];
  const content = (
    <>
      <span aria-hidden="true" className="relative inline-flex shrink-0">
        <Avatar name={person.name} tint={person.tint} src={person.src} />
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-pill bg-primary text-on-primary ring-2 ring-surface">
          <Icon className="size-3" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-text-primary">
          {unread && <span className="sr-only">Unread: </span>}
          {text}
        </span>
        <RelativeTime date={createdAt} className="text-metadata text-text-secondary" />
      </span>
      {unread && <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-danger" />}
    </>
  );
  const row = cn(
    'flex min-w-0 flex-1 items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-sunken hover:no-underline',
    menu !== undefined && 'pr-1',
  );
  return (
    <li className={cn('flex items-center', unread && 'bg-accent-soft')}>
      {href ? (
        <Link href={href} className={row} {...(onOpen ? { onClick: onOpen } : {})}>
          {content}
        </Link>
      ) : (
        <div className={row}>{content}</div>
      )}
      {menu !== undefined && <span className="shrink-0 pr-2">{menu}</span>}
    </li>
  );
}
