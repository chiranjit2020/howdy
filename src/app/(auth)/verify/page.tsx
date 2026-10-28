import Link from 'next/link';
import { EntryCard, EntryHeading } from '@/ui/auth/entry-shell';
import { buttonClasses } from '@/ui/primitives';
import { VerifyPanel } from './verify-panel';

// The link carries a secret token: never leak it through the Referer header.
export const metadata = { title: 'Confirm your email', referrer: 'no-referrer' as const };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <EntryCard>
      {typeof token !== 'string' || token.length === 0 ? (
        <>
          <EntryHeading title="That link is incomplete">Open the link from your email again.</EntryHeading>
          <Link href="/login" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            Log in
          </Link>
        </>
      ) : (
        <VerifyPanel token={token} />
      )}
    </EntryCard>
  );
}
