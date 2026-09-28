import { TRUST_RULES, type TrustCheck, type TrustCheckKey, type TrustStatus } from '@/modules/trust';
import { GlossaryHint, TrustedBadge } from '@/ui/howdy';
import { ClayCard } from '@/ui/primitives';

const R = TRUST_RULES;

/** What each check asks, in the owner's words. Countable ones also say how far along they are. */
const LABEL: Record<TrustCheckKey, string> = {
  email: 'Your email is confirmed',
  age: `Your account is at least ${R.accountAgeDays} days old`,
  portrait: 'A Portrait photo on your Porch',
  pals: `At least ${R.minPals} Pals`,
  markGivers: `Marks from ${R.minMarkGivers} different Pals in the last year`,
  markKinds: `${R.minMarkKinds} kinds of Mark, each from ${R.giversPerKind} or more Pals`,
  active: `Stopped by Howdy in the last ${R.activeWithinDays} days`,
  standing: 'No report against you upheld in the last 6 months',
};

const UNIT: Partial<Record<TrustCheckKey, string>> = { age: 'days' };

function progress(c: TrustCheck): string | null {
  if (c.met || c.have === undefined || c.need === undefined) return null;
  return `${c.have} of ${c.need}${UNIT[c.key] ? ` ${UNIT[c.key]}` : ''}`;
}

/**
 * Owner only: the Trusted tick and what is left to earn it. Nobody else ever sees this list or any of its numbers —
 * visitors see only the tick itself, once it is earned.
 */
export function TrustCard({ status }: { status: TrustStatus }) {
  const left = status.checks.filter((c) => !c.met).length;
  return (
    <ClayCard className="flex flex-col gap-3 bg-warning/25">
      <div className="flex items-center">
        <h2 className="flex items-center gap-3 font-display text-title text-brand-ink">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-pill bg-warning text-heading"
          >
            <TrustedBadge />
          </span>
          Trusted tick
        </h2>
        <GlossaryHint term="trusted" />
      </div>
      <p className="text-caption text-text-secondary">
        {status.earned
          ? 'You have it. It shows beside your name while all of these stay true.'
          : left === 1
            ? 'One thing left. The tick shows beside your name once all of these are true.'
            : `${left} things left. The tick shows beside your name once all of these are true.`}
      </p>
      <ul className="flex flex-col gap-2">
        {status.checks.map((c) => {
          const p = progress(c);
          return (
            <li key={c.key} className="flex items-start gap-2 text-caption text-text-primary">
              <span
                aria-hidden="true"
                className={
                  c.met
                    ? 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill bg-success text-on-success'
                    : 'mt-0.5 size-5 shrink-0 rounded-pill border-2 border-border-strong'
                }
              >
                {c.met ? '✓' : ''}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="sr-only">{c.met ? 'Done: ' : 'Not yet: '}</span>
                {LABEL[c.key]}
                {p && <span className="block font-mono text-metadata text-text-secondary">{p}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </ClayCard>
  );
}
