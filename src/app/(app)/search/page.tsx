import { requireUser } from '@/modules/auth';
import { PeopleSearch } from '@/ui/shell/people-search';

export const metadata = { title: 'Search' };

/**
 * Search, full page: where the phone's search button leads (wide screens have the box in the top bar). Only people who
 * let themselves be found, plus your friends.
 */
export default async function SearchPage() {
  await requireUser();
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-2 py-4 sm:py-8">
      <h1 className="text-heading text-text-primary">Search</h1>
      <p className="text-caption text-text-secondary">
        Find people by name or @username. Only people who allow it in their privacy settings show up, and your
        friends.
      </p>
      <PeopleSearch page autoFocus />
    </main>
  );
}
