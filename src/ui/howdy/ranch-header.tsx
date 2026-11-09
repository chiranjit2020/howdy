import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RelationshipState } from '@/shared/relationship';
import type { PortraitTint } from '@/shared/validation/profile';
import { Avatar } from '../primitives/avatar';
import { PosseBadge } from './posse-badge';
import { NameBadge } from './verified-badge';

export interface RanchHeaderProps {
  displayName: string;
  handle: string;
  /** A short line about them, under the name. Plain text only. */
  bio?: string | null | undefined;
  portraitUrl?: string | null;
  portraitTint?: PortraitTint | undefined;
  online?: boolean;
  relationship?: RelationshipState;
  /** Action row: Tip Hat / Yo / Whisper for visitors, Tend the Ranch for the owner. */
  actions?: ReactNode;
  /** Lift the portrait up over whatever sits above the header (a cover picture). */
  overlap?: boolean;
  /** The Howdy team account: the Verified badge follows the name. */
  verified?: boolean;
  /** Has earned the Trusted tick (shown only when not the team account). */
  trusted?: boolean;
  /** How many friends, after the username (ADR-062: everyone sees the number, never who). */
  friendCount?: number;
  /** On your own profile the friend number links to your Friends page; on anyone else's it is plain text. */
  friendsLink?: boolean;
  /** How many people follow them (ADR-053, public since ADR-062), shown once there is anyone. Never who. */
  followerCount?: number;
  /** Something on the picture's lower right edge: on your own profile, the camera that changes it. */
  portraitAction?: ReactNode;
  /** The words friends picked most (ADR-052), already worded ("Chill · Sharp"): "Friends say: …" under the bio. */
  describedAs?: string;
  /** The intro line under all that: the tick's meaning and the details this viewer may see (the profile page's). */
  intro?: ReactNode;
}

/** Top of a Ranch (profile): portrait, name, handle, bio, relationship and actions. */
export function RanchHeader({
  displayName,
  handle,
  bio,
  portraitUrl,
  portraitTint,
  online,
  relationship,
  actions,
  overlap,
  verified,
  trusted,
  friendCount,
  friendsLink,
  followerCount,
  portraitAction,
  describedAs,
  intro,
}: RanchHeaderProps) {
  return (
    // The X / LinkedIn shape: the picture over the cover's edge with the owner's actions on the same row, then the name,
    // one line of facts, the bio and the intro across the card's full width (so a long name never squeezes).
    <header className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className={`relative flex shrink-0 ${overlap ? '-mt-14' : ''}`}>
          <Avatar name={displayName} src={portraitUrl} tint={portraitTint} size="xl" online={online} />
          {portraitAction && <div className="absolute right-0 bottom-0">{portraitAction}</div>}
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <h1 className="font-display text-heading break-words text-brand-ink">
            {displayName}
            <NameBadge verified={verified} trusted={trusted} className="ml-1.5" />
          </h1>
          {/* Plain inline text (the friends link stays an inline link in a sentence), the relationship badge after it. */}
          <p className="text-caption text-text-secondary">
            @{handle}
            {friendCount !== undefined && (
              <>
                {' · '}
                {friendsLink ? (
                  <Link href="/friends" className="font-semibold text-text-secondary">
                    {friendCount.toLocaleString('en-IN')} {friendCount === 1 ? 'friend' : 'friends'}
                  </Link>
                ) : (
                  <span className="font-semibold">
                    {friendCount.toLocaleString('en-IN')} {friendCount === 1 ? 'friend' : 'friends'}
                  </span>
                )}
              </>
            )}
            {followerCount !== undefined && followerCount > 0 && (
              <>
                {' · '}
                {followerCount.toLocaleString('en-IN')} {followerCount === 1 ? 'follower' : 'followers'}
              </>
            )}
            {relationship && (
              <span className="ml-2 inline-flex align-middle">
                <PosseBadge state={relationship} />
              </span>
            )}
          </p>
        </div>
        {bio && <p className="text-body break-words text-text-primary">{bio}</p>}
        {describedAs && (
          <p className="text-caption text-text-secondary">
            Friends say: <span className="font-semibold text-text-primary">{describedAs}</span>
          </p>
        )}
        {intro}
      </div>
    </header>
  );
}
