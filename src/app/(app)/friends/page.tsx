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
 * Your friends and everything pending around it, in Home's frame: the lists in the middle; adding people (by username,
 * suggestions, your invite link) in the right panel on wide screens. On a phone, requests come first and the compact Add
 * a friend box right after them (people could not find how to send a request below a long list, 2026-11-03); new
 * friends lead the list (2026-11-10). Protected; only ever shows the signed-in person's own relationships.
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
        {/* Phones (2026-11-10): what waits for you first (requests), then the compact Add a friend box, your friends
            newest first, sent requests and who you follow; suggestions and your invite link come last. Wide screens keep
            adding people in the right panel. Only one copy of each is ever displayed. */}
        <PosseLists
          lists={lists}
          addFriend={
            <div className="xl:hidden">
              <AskForm id="ask-by-username-top" />
            </div>
          }
        />
        <Suggestions initial={suggestions} id="suggestions-heading-top" className="xl:hidden" />
        {invite && (
          <div className="xl:hidden">
            <InviteCard initial={invite} origin={new URL(getEnv().APP_URL).origin} id="invite-friends-top" />
          </div>
        )}
      </main>
      <aside aria-label="Add friends" className="hidden min-w-0 flex-col gap-4 xl:flex">
        <Suggestions initial={suggestions} />
        <AskForm />
        {invite && <InviteCard initial={invite} origin={new URL(getEnv().APP_URL).origin} />}
      </aside>
    </div>
  );
}
