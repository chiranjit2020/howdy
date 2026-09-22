import Link from 'next/link';
import { AuthCard } from '@/ui/auth/auth-card';
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
      <AuthCard className="gap-3">
        <h1 className="font-display text-headline text-brand-ink">That link is incomplete</h1>
        <p className="text-body text-auth-text">Open the link from your email again.</p>
        <Link href="/step-inside" className="inline-flex min-h-11 items-center text-auth-link">
          Step Inside
        </Link>
      </AuthCard>
    );
  }
  return <VerifyPanel token={token} />;
}
