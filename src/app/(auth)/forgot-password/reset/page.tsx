import Link from 'next/link';
import { EntryCard, EntryHeading } from '@/ui/auth/entry-shell';
import { buttonClasses } from '@/ui/primitives';
import { ResetForm } from './reset-form';

// The link carries a secret token: never leak it through the Referer header.
export const metadata = { title: 'New password', referrer: 'no-referrer' as const };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <EntryCard>
      {typeof token !== 'string' || token.length === 0 ? (
        <>
          <EntryHeading title="That link is incomplete">
            Open the link from your email again, or ask for a new one.
          </EntryHeading>
          <Link href="/forgot-password" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            Forgot password?
          </Link>
        </>
      ) : (
        <ResetForm token={token} />
      )}
    </EntryCard>
  );
}
