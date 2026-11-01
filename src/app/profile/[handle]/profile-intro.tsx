import type { ComponentType } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  GoBriefcase,
  GoComment,
  GoGift,
  GoHeart,
  GoHome,
  GoLocation,
  GoLock,
  GoMortarBoard,
  GoPeople,
} from 'react-icons/go';
import type { DetailLine, MyDetails } from '@/modules/profiles';
import { DETAIL_AUDIENCE_LABEL, type DetailAudience, type DetailKey } from '@/shared/validation/details';
import { TrustedBadge, VerifiedBadge } from '@/ui/howdy';
import { EditDetails } from './edit-details';

/** How each detail reads in a sentence-like line, with its icon: "Lives in Kolkata", "Speaks Hindi, English". */
const SHOWN: Record<DetailKey, { Icon: ComponentType<IconBaseProps>; lead?: string }> = {
  livesIn: { Icon: GoLocation, lead: 'Lives in' },
  hometown: { Icon: GoHome, lead: 'From' },
  work: { Icon: GoBriefcase },
  education: { Icon: GoMortarBoard, lead: 'Studied at' },
  birthday: { Icon: GoGift, lead: 'Birthday' },
  languages: { Icon: GoComment, lead: 'Speaks' },
  relationship: { Icon: GoHeart },
};

/**
 * A marker only where a detail is held back: friends only, or only you. A detail for everyone needs no reminder (a globe
 * on every line read as noise, 2026-11-01).
 */
const AUDIENCE_ICON: Partial<Record<DetailAudience, ComponentType<IconBaseProps>>> = {
  posse: GoPeople,
  only_me: GoLock,
};

/**
 * A profile's intro, inside the profile card under the bio: what its tick means, then the details this viewer may see
 * (`lines`, already filtered by the server for them) as one wrapping line of icon + words. On your own profile (`mine`)
 * a detail only friends or only you can see carries a small icon saying so (named for screen readers and on hover;
 * one for everyone has none), and an Edit details link
 * ends the line. Nothing to show a visitor: nothing at all.
 */
export function ProfileIntro({
  verified,
  trusted,
  lines,
  mine,
}: {
  verified: boolean;
  trusted: boolean;
  lines: DetailLine[];
  /** Your own details, for editing (your own profile only). */
  mine?: MyDetails | null;
}) {
  const tick = verified || trusted;
  if (!tick && lines.length === 0 && !mine) return null;
  return (
    <section aria-label="Details">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-text-secondary">
        {tick && (
          <li
            className="inline-flex items-center gap-1.5"
            title={
              verified
                ? 'This is Howdy’s own account.'
                : 'Earned over time on Howdy. It can’t be asked for or bought.'
            }
          >
            <span className="text-body">{verified ? <VerifiedBadge /> : <TrustedBadge />}</span>
            <span className="font-semibold text-text-primary">
              {verified ? 'Howdy team' : 'Trusted member'}
            </span>
          </li>
        )}
        {lines.map((l) => {
          const { Icon, lead } = SHOWN[l.key];
          const Seen = l.audience ? AUDIENCE_ICON[l.audience] : undefined;
          return (
            <li key={l.key} className="inline-flex min-w-0 items-center gap-1.5">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
              <span className="min-w-0 break-words">
                {lead && `${lead} `}
                <span className="font-semibold text-text-primary">{l.text}</span>
              </span>
              {Seen && l.audience && (
                <span title={`Seen by: ${DETAIL_AUDIENCE_LABEL[l.audience]}`} className="inline-flex">
                  <Seen aria-hidden="true" className="size-3 text-text-muted" />
                  <span className="sr-only"> · {DETAIL_AUDIENCE_LABEL[l.audience]}</span>
                </span>
              )}
            </li>
          );
        })}
        {mine && (
          <li>
            <EditDetails
              initial={mine}
              look="link"
              label={lines.length > 0 ? 'Edit details' : 'Add details'}
            />
          </li>
        )}
      </ul>
    </section>
  );
}
