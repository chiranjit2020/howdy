import { attachPortraits, withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { myCapsules } from '@/modules/capsules';
import { listMyRelationships } from '@/modules/relationships';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import { CAPSULE_MAX_YEARS } from '@/shared/validation/capsules';
import { CapsulesView } from './capsules-view';

export const metadata = { title: 'Time Capsules' };

/**
 * Time Capsules (ADR-028): seal words for my future self or one Pal, and read the ones that have opened. Anything due
 * opens as this page loads. Sealed words are never sent to the browser — not even mine. In Home's frame: sealing and
 * the opened ones in the main column, what is coming and what I sealed in the right panel.
 */
export default async function CapsulesPage() {
  const user = await requireUser();
  const [capsules, lists] = await Promise.all([
    myCapsules(user.id),
    listMyRelationships(user.id).then((r) => withCards(r, user.id)),
  ]);
  await attachPortraits(
    user.id,
    capsules.coming.flatMap((c) => (c.from ? [c.from] : [])),
  );
  const today = dayOf();
  return (
    <CapsulesView
      initial={capsules}
      pals={lists.posse.map((p) => ({ handle: p.handle, displayName: p.displayName }))}
      earliest={addDays(today, 1)}
      latest={addYears(today, CAPSULE_MAX_YEARS)}
    />
  );
}
