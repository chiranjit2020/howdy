import type { ReactNode } from 'react';
import type { RelationshipState } from '@/shared/relationship';
import type { PortraitTint } from '@/shared/validation/profile';
import { Avatar } from '../primitives/avatar';
import { PosseBadge } from './posse-badge';
import { Signal } from './signal';

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
}

/** Top of a Ranch (profile): portrait, name, handle, relationship, Signal, actions. */
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
}: RanchHeaderProps) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <Avatar name={displayName} src={portraitUrl} tint={portraitTint} size="xl" online={online} />
      <div>
        <h1 className="text-heading text-text-primary">{displayName}</h1>
        <p className="font-mono text-code text-text-secondary">@{handle}</p>
      </div>
      {relationship && <PosseBadge state={relationship} />}
      {signal && <Signal text={signal} expiresLabel={signalExpiresLabel} />}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-3">{actions}</div>}
    </header>
  );
}
