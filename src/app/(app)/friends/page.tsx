import { attachPortraits, withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { myInvite } from '@/modules/invites';
import { getEnv } from '@/platform/config/env';
import { listMyRelationships } from '@/modules/relationships';
import { palSuggestions } from '@/modules/suggestions';
import { AskForm } from './ask-form';
import { InviteCard } from './invite-card';
import { PosseLists } from './posse-lists';
import { Suggestions } from './suggestions';

export const metadata = { title: 'Friends' };

/**
 * Your Posse and everything pending around it, in Home's frame: the lists in the middle; adding people (by username,
 * suggestions, your invite link) in the right panel on wide screens, and right under the heading on a phone (ADR-061),
 * where people could not find how to send a request below a long list (2026-11-03). Protected; only ever shows the
 * signed-in person's own relationships.
 */
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
    <div className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6">
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <h1 className="text-heading text-text-primary">Friends</h1>
        {/* Below xl the panel follows the whole list, too far down to be seen with many friends: how to add someone
            comes first instead, then every suggestion (up to ten, as on a wide screen; 2026-11-08). Only one copy of each is ever displayed. */}
        <div className="flex flex-col gap-4 xl:hidden">
          <AskForm id="ask-by-username-top" />
          {invite && (
            <InviteCard initial={invite} origin={new URL(getEnv().APP_URL).origin} id="invite-friends-top" />
          )}
        </div>
        <Suggestions initial={suggestions} id="suggestions-heading-top" className="xl:hidden" />
        <PosseLists lists={lists} />
      </main>
      <aside aria-label="Add friends" className="hidden min-w-0 flex-col gap-4 xl:flex">
        <Suggestions initial={suggestions} />
        <AskForm />
        {invite && <InviteCard initial={invite} origin={new URL(getEnv().APP_URL).origin} />}
      </aside>
    </div>
  );
}
