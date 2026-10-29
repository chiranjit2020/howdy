'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PersonEntry } from '@/app/_lib/social';
import type { RelationshipAction } from '@/shared/validation/relationships';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Avatar, Button } from '@/ui/primitives';

/** Friend requests on Home's right panel: Accept or Decline right there; the page then reloads from the server. */
export function RailRequests({ people }: { people: PersonEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function run(handle: string, action: RelationshipAction) {
    setBusy(`${handle}:${action}`);
    setError(undefined);
    const res = await apiRequest('POST', `/api/relationships/${handle}`, { action });
    setBusy(undefined);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {people.map((p) => (
          <li key={p.handle} className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <Avatar name={p.displayName} tint={p.portraitTint} src={p.portraitUrl} size="sm" />
              <p className="min-w-0 flex-1 text-caption">
                <Link
                  href={`/profile/${p.handle}`}
                  className="block truncate font-semibold text-text-primary no-underline hover:underline"
                >
                  {p.displayName}
                </Link>
                <span className="block text-metadata text-text-secondary">wants to be your friend</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                loading={busy === `${p.handle}:accept`}
                onClick={() => run(p.handle, 'accept')}
                aria-label={`Accept ${p.displayName}`}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `${p.handle}:decline`}
                onClick={() => run(p.handle, 'decline')}
                aria-label={`Decline ${p.displayName}`}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </>
  );
}
