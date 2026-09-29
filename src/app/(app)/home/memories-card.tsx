import Link from 'next/link';
import type { MemoriesToday } from '@/modules/memories';
import { Avatar } from '@/ui/primitives';

const ago = (n: number) => (n === 1 ? 'A year ago today' : `${n} years ago today`);

/**
 * "On this day" (ADR-028): only rendered when there is something. Only I see it — it is worked out from my own Fence,
 * my Pals and the Tributes on my Porch, and only what I can still see today comes back.
 */
export function MemoriesCard({ memories, handle }: { memories: MemoriesToday; handle: string }) {
  const { cards, pals, tributes } = memories;
  if (cards.length + pals.length + tributes.length === 0) return null;
  return (
    <section aria-labelledby="memories-heading" className="clay flex flex-col gap-3 bg-warning/15 p-4 sm:p-5">
      <h2
        id="memories-heading"
        className="text-metadata font-semibold tracking-wider text-text-secondary uppercase"
      >
        On this day
      </h2>
      <ul className="flex flex-col gap-3">
        {pals.map((p) => (
          <li key={`pal-${p.pal.handle}`} className="flex items-center gap-3">
            <Avatar name={p.pal.displayName} tint={p.pal.portraitTint} size="sm" />
            <p className="min-w-0 text-body [overflow-wrap:anywhere] text-text-primary">
              You and{' '}
              <Link href={`/porch/${p.pal.handle}`} className="font-semibold">
                {p.pal.displayName}
              </Link>{' '}
              became Pals {p.years === 1 ? 'a year' : `${p.years} years`} ago today.
            </p>
          </li>
        ))}
        {tributes.map((t) => (
          <li key={`tribute-${t.id}`} className="flex flex-col gap-1">
            <p className="text-caption text-text-secondary">
              {ago(t.yearsAgo)}, {t.author.displayName} wrote you a Tribute:
            </p>
            <blockquote className="rounded-md bg-surface px-3 py-2 text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-text-primary">
              {t.body}
            </blockquote>
          </li>
        ))}
        {cards.map((c) => (
          <li key={`card-${c.id}`} className="flex flex-col gap-1">
            <p className="text-caption text-text-secondary">
              {ago(c.yearsAgo)}, {c.author.handle === handle ? 'you' : c.author.displayName} nailed this to
              your Fence:
            </p>
            <blockquote className="rounded-md bg-surface px-3 py-2 text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-text-primary">
              {c.body}
            </blockquote>
          </li>
        ))}
      </ul>
    </section>
  );
}
