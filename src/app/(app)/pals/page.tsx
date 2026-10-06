import { attachPortraits, withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { myInvite } from '@/modules/invites';
import { getEnv } from '@/platform/config/env';
import { listMyRelationships } from '@/modules/relationships';
import { palSuggestions } from '@/modules/suggestions';
import { GlossaryHint } from '@/ui/howdy';
import { AskForm } from './ask-form';
import { InviteCard } from './invite-card';
import { PosseLists } from './posse-lists';
import { Suggestions } from './suggestions';

export const metadata = { title: 'Pals' };

/** Your Posse and everything pending around it. Protected; only ever shows the signed-in person's own relationships. */
export default async function PossePage() {
  const user = await requireUser();
  const [lists, suggestions, invite] = await Promise.all([
    listMyRelationships(user.id).then((r) => withCards(r, user.id)),
    // Best-effort: suggestions are an extra, never a reason for the Pals page to fail.
    palSuggestions(user.id).catch(() => []),
    // Best-effort too (ADR-045): no card rather than no page.
    myInvite(user.id).catch(() => null),
  ]);
  await attachPortraits(user.id, suggestions);
  return (
    <>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
        <div className="flex items-center">
          <h1 className="text-heading text-text-primary">Your Pals</h1>
          <GlossaryHint term="posse" />
        </div>
        <AskForm />
        <PosseLists lists={lists} />
        <Suggestions initial={suggestions} />
        {invite && <InviteCard initial={invite} origin={new URL(getEnv().APP_URL).origin} />}
      </main>
    </>
  );
}
