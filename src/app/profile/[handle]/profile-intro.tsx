import type { ComponentType } from 'react';
import type { IconBaseProps } from 'react-icons';
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  GoBriefcase,
  GoComment,
  GoDeviceMobile,
  GoGift,
  GoHeart,
  GoHome,
  GoLink,
  GoLocation,
  GoLock,
  GoMail,
  GoMortarBoard,
  GoPeople,
} from 'react-icons/go';
import type { DetailLine, LineKey, MyDetails } from '@/modules/profiles';
import { DETAIL_AUDIENCE_LABEL, SOCIAL_LABEL, type DetailAudience } from '@/shared/validation/details';
import { TrustedBadge, VerifiedBadge } from '@/ui/howdy';
import { EditDetails } from './edit-details';

/**
 * How each detail reads in a sentence-like line, with its icon: "Lives in Kolkata", "Speaks Hindi, English". A social
 * site is its own mark (the one place brand logos appear: they say which site the link opens) and its name for screen
 * readers.
 */
const SHOWN: Record<LineKey, { Icon: ComponentType<IconBaseProps>; lead?: string; site?: string }> = {
  livesIn: { Icon: GoLocation, lead: 'Lives in' },
  hometown: { Icon: GoHome, lead: 'From' },
  work: { Icon: GoBriefcase },
  education: { Icon: GoMortarBoard, lead: 'Studied at' },
  birthday: { Icon: GoGift, lead: 'Birthday' },
  languages: { Icon: GoComment, lead: 'Speaks' },
  relationship: { Icon: GoHeart },
  website: { Icon: GoLink },
  email: { Icon: GoMail },
  phone: { Icon: GoDeviceMobile },
  instagram: { Icon: FaInstagram, site: SOCIAL_LABEL.instagram },
  linkedin: { Icon: FaLinkedin, site: SOCIAL_LABEL.linkedin },
  x: { Icon: FaXTwitter, site: SOCIAL_LABEL.x },
  youtube: { Icon: FaYoutube, site: SOCIAL_LABEL.youtube },
  facebook: { Icon: FaFacebook, site: SOCIAL_LABEL.facebook },
};

/**
 * Links Howdy shows to other sites (ADR-058): a new tab, no referrer (the other site never learns which profile sent
 * someone), and no search-engine credit. mailto: and tel: open the phone's own app, in place.
 */
const OUT = 'noopener noreferrer nofollow ugc';

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
    // A hairline above, so the details read as their own block under the bio.
    <section aria-label="Details" className="border-t border-border pt-3">
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
          const { Icon, lead, site } = SHOWN[l.key];
          const Seen = l.audience ? AUDIENCE_ICON[l.audience] : undefined;
          const external = l.href?.startsWith('https://');
          return (
            <li key={l.key} className="inline-flex min-w-0 items-center gap-1.5">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
              <span className="min-w-0 break-words">
                {lead && `${lead} `}
                {site && <span className="sr-only">{site}: </span>}
                {l.href ? (
                  <a
                    href={l.href}
                    {...(external ? { target: '_blank', rel: OUT } : {})}
                    className="font-semibold [overflow-wrap:anywhere] text-link hover:underline"
                  >
                    {l.text}
                    {external && <span className="sr-only"> (opens in a new tab)</span>}
                  </a>
                ) : (
                  <span className="font-semibold text-text-primary">{l.text}</span>
                )}
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
