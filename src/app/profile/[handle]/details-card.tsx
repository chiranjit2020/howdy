import type { DetailLine, MyDetails } from '@/modules/profiles';
import { DETAIL_AUDIENCE_LABEL, DETAIL_LABEL } from '@/shared/validation/details';
import { TrustedBadge, VerifiedBadge } from '@/ui/howdy';
import { EditDetails } from './edit-details';

/**
 * A profile's personal details, under the header: what its tick means (the team's blue Verified, or the gold Trusted
 * tick earned over time), then the details this viewer may see (`lines`, already filtered by the server for them). On
 * your own profile (`mine`) each detail says who sees it, and you can edit them here. Nothing to say: no card.
 */
export function DetailsCard({
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
    <section aria-labelledby="profile-details" className="clay flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="profile-details" className="text-body font-semibold text-text-primary">
          Details
        </h2>
        {mine && <EditDetails initial={mine} label={lines.length > 0 ? 'Edit details' : 'Add details'} />}
      </div>
      {tick && (
        <p className="flex items-start gap-2.5 text-caption text-text-secondary">
          <span className="mt-0.5 text-title">{verified ? <VerifiedBadge /> : <TrustedBadge />}</span>
          <span>
            <span className="font-semibold text-text-primary">
              {verified ? 'Howdy team' : 'Trusted member'}
            </span>
            {' · '}
            {verified
              ? 'This is Howdy’s own account.'
              : 'Earned over time on Howdy. It can’t be asked for or bought.'}
          </span>
        </p>
      )}
      {lines.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-caption">
          {lines.map((l) => (
            <div key={l.key} className="contents">
              <dt className="text-text-secondary">{DETAIL_LABEL[l.key]}</dt>
              <dd className="break-words text-text-primary">
                {l.text}
                {l.audience && (
                  <span className="text-text-muted"> · {DETAIL_AUDIENCE_LABEL[l.audience]}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        mine && (
          <p className="text-caption text-text-secondary">
            Add where you live, your work, your birthday and more. You choose who sees each one.
          </p>
        )
      )}
    </section>
  );
}
