import { withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { myCapsules } from '@/modules/capsules';
import { listMyRelationships } from '@/modules/relationships';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import { CAPSULE_MAX_YEARS } from '@/shared/validation/capsules';
import { CapsulesView } from './capsules-view';

export const metadata = { title: 'Time Capsules' };

/**
 * Time Capsules (ADR-028): seal words for my future self or one Pal, and read the ones that have opened. Anything due
 * opens as this page loads. Sealed words are never sent to the browser — not even mine.
 */
export default async function CapsulesPage() {
  const user = await requireUser();
  const [capsules, lists] = await Promise.all([
    myCapsules(user.id),
    listMyRelationships(user.id).then(withCards),
  ]);
  const today = dayOf();
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading text-text-primary">Time Capsules</h1>
        <p className="text-caption text-text-secondary">
          Seal a few words for your future self or one of your Pals. Nobody can read them — not even you —
          until the day they open.
        </p>
      </div>
      <CapsulesView
        initial={capsules}
        pals={lists.posse.map((p) => ({ handle: p.handle, displayName: p.displayName }))}
        earliest={addDays(today, 1)}
        latest={addYears(today, CAPSULE_MAX_YEARS)}
      />
    </main>
  );
}
