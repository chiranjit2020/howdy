import { withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { listMyRelationships } from '@/modules/relationships';
import { GlossaryHint } from '@/ui/howdy';
import { AskForm } from './ask-form';
import { PosseLists } from './posse-lists';

export const metadata = { title: 'Posse' };

/** Your Posse and everything pending around it. Protected; only ever shows the signed-in person's own relationships. */
export default async function PossePage() {
  const user = await requireUser();
  const lists = await withCards(await listMyRelationships(user.id));
  return (
    <>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <div className="flex items-center">
          <h1 className="text-heading text-text-primary">Your Posse</h1>
          <GlossaryHint term="posse" />
        </div>
        <AskForm />
        <PosseLists lists={lists} />
      </main>
    </>
  );
}
