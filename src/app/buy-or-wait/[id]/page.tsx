import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { withAskPortraits } from '@/app/_lib/asks';
import { getAsk } from '@/modules/asks';
import { getCurrentUser } from '@/modules/auth';
import { getEnv } from '@/platform/config/env';
import { clientIp } from '@/platform/http/client-ip';
import { cn } from '@/ui/cn';
import { buttonClasses, ClayCard } from '@/ui/primitives';
import { AskCard } from '../ask-card';

// Shared on WhatsApp, but never in a search index: people's names and answers are on it.
export const metadata = { title: 'Buy or wait?', robots: { index: false, follow: false } };

/**
 * One question's own page: the link people share (ADR-066). An "everyone" question opens for anyone, signed in or not
 * (signed out, the Buy and Wait buttons lead to sign up). A friends-only one opens for the asker's friends; anyone who
 * may not see it gets the same 404 as a question that is not there.
 */
export default async function AskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const rateKey = user?.id ?? clientIp(await headers(), getEnv().TRUST_PROXY_HOPS);
  const ask = await getAsk(user?.id ?? null, id, rateKey);
  if (!ask) notFound();
  await withAskPortraits(user?.id, [ask]);
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 py-4">
      <h1 className="sr-only">Buy or wait: {ask.item}</h1>
      <AskCard initial={ask} signedIn={user !== null} linkToPage={false} />
      {user ? (
        <Link
          href="/buy-or-wait"
          className={cn(buttonClasses({ variant: 'link', size: 'sm' }), 'self-start')}
        >
          See more questions
        </Link>
      ) : (
        <ClayCard className="flex flex-col gap-3">
          <h2 className="text-title text-text-primary">Help {ask.author.displayName} decide</h2>
          <p className="text-caption text-text-secondary">
            Join Howdy to answer Buy or Wait, and ask about the next thing you’re thinking of buying. Free,
            and no phone number needed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/signup" className={buttonClasses({ size: 'sm' })}>
              Join Howdy
            </Link>
            <Link href="/login" className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
              Log in
            </Link>
          </div>
        </ClayCard>
      )}
    </main>
  );
}
