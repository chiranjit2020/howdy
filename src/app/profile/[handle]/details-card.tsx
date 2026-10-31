import { TrustedBadge, VerifiedBadge } from '@/ui/howdy';

/**
 * A profile's personal details, under the header. For now the one line every profile can have: what its tick means
 * (the team's blue Verified, or the gold Trusted tick earned over time). City, work, education, birthday, languages and
 * relationship status join it later, each with its own "who can see it". Nothing to say: no card.
 */
export function DetailsCard({ verified, trusted }: { verified: boolean; trusted: boolean }) {
  if (!verified && !trusted) return null;
  return (
    <section aria-label="Details" className="clay flex flex-col gap-3 p-4">
      <h2 className="text-body font-semibold text-text-primary">Details</h2>
      <ul className="flex flex-col gap-2">
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 text-title">{verified ? <VerifiedBadge /> : <TrustedBadge />}</span>
          <p className="text-caption text-text-secondary">
            <span className="font-semibold text-text-primary">
              {verified ? 'Howdy team' : 'Trusted member'}
            </span>
            {' · '}
            {verified
              ? 'This is Howdy’s own account.'
              : 'Earned over time on Howdy. It can’t be asked for or bought.'}
          </p>
        </li>
      </ul>
    </section>
  );
}
