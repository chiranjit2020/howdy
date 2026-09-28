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
}

/** Top of a Ranch (profile): portrait, name, handle, relationship, actions (and the Signal, when shown here). */
export function RanchHeader({
  displayName,
  handle,
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
}: RanchHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
        <Avatar
          name={displayName}
          src={portraitUrl}
          tint={portraitTint}
          size="xl"
          online={online}
          className={overlap ? '-mt-14 self-start' : 'self-start'}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-heading break-words text-brand-ink">
            {displayName}
            <NameBadge verified={verified} trusted={trusted} className="ml-1.5" />
          </h1>
          <p className="font-mono text-code text-text-secondary">@{handle}</p>
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
