import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RelationshipState } from '@/shared/relationship';
import type { PortraitTint } from '@/shared/validation/profile';
import { Avatar } from '../primitives/avatar';
import { PosseBadge } from './posse-badge';
import { Signal } from './signal';
import { NameBadge } from './verified-badge';

export interface RanchHeaderProps {
  displayName: string;
  handle: string;
  /** A short line about them, under the name. Plain text only. */
  bio?: string | null | undefined;
  portraitUrl?: string | null;
  portraitTint?: PortraitTint | undefined;
  online?: boolean;
  signal?: string;
  signalExpiresLabel?: string;
  relationship?: RelationshipState;
  /** Action row: Tip Hat / Yo / Whisper for visitors, Tend the Ranch for the owner. */
  actions?: ReactNode;
  /** Lift the portrait up over whatever sits above the header (a cover picture). */
  overlap?: boolean;
  /** The Howdy team account: the Verified badge follows the name. */
  verified?: boolean;
  /** Has earned the Trusted tick (shown only when not the team account). */
  trusted?: boolean;
  /**
   * How many friends, after the username, linking to the friends list. Only ever passed on your own profile: nobody
   * else's friends are shown on a profile, their number included (nobody competes for numbers).
   */
  friendCount?: number;
  /** Something on the picture's lower right edge: on your own profile, the camera that changes it. */
  portraitAction?: ReactNode;
}

/** Top of a Ranch (profile): portrait, name, handle, relationship, actions (and the Signal, when shown here). */
export function RanchHeader({
  displayName,
  handle,
  bio,
  portraitUrl,
  portraitTint,
  online,
  signal,
  signalExpiresLabel,
  relationship,
  actions,
  overlap,
  verified,
  trusted,
  friendCount,
  portraitAction,
}: RanchHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
        <div className={`relative flex self-start ${overlap ? '-mt-14' : ''}`}>
          <Avatar name={displayName} src={portraitUrl} tint={portraitTint} size="xl" online={online} />
          {portraitAction && <div className="absolute right-0 bottom-0">{portraitAction}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-heading break-words text-brand-ink">
            {displayName}
            <NameBadge verified={verified} trusted={trusted} className="ml-1.5" />
          </h1>
          <p className="text-caption text-text-secondary">
            @{handle}
            {friendCount !== undefined && (
              <>
                {' · '}
                <Link href="/friends" className="font-semibold text-text-secondary">
                  {friendCount} {friendCount === 1 ? 'friend' : 'friends'}
                </Link>
              </>
            )}
          </p>
          {bio && <p className="mt-1.5 text-body break-words text-text-primary">{bio}</p>}
          {relationship && (
            <div className="mt-2">
              <PosseBadge state={relationship} />
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-3 sm:self-center">{actions}</div>}
      </div>
      {signal && <Signal text={signal} expiresLabel={signalExpiresLabel} />}
    </header>
  );
}
