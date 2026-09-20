import Link from 'next/link';
import { ClayCard } from '@/ui/primitives';
import { VerifyPanel } from './verify-panel';

// The link carries a secret token: never leak it through the Referer header.
export const metadata = { title: 'Confirm your email', referrer: 'no-referrer' as const };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  if (typeof token !== 'string' || token.length === 0) {
    return (
      <ClayCard className="flex flex-col gap-3 p-8">
        <h1 className="text-heading text-text-primary">That link is incomplete</h1>
        <p className="text-body text-text-secondary">Open the link from your email again.</p>
        <Link href="/step-inside" className="inline-flex min-h-11 items-center">
          Step Inside
        </Link>
      </ClayCard>
    );
  }
  return <VerifyPanel token={token} />;
}
