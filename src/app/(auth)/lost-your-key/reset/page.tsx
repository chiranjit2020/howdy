import Link from 'next/link';
import { AuthCard } from '@/ui/auth/auth-card';
import { ResetForm } from './reset-form';

// The link carries a secret token: never leak it through the Referer header.
export const metadata = { title: 'New secret knock', referrer: 'no-referrer' as const };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  if (typeof token !== 'string' || token.length === 0) {
    return (
      <AuthCard className="gap-3">
        <h1 className="font-display text-headline text-brand-ink">That link is incomplete</h1>
        <p className="text-body text-auth-text">Open the link from your email again, or ask for a new one.</p>
        <Link href="/lost-your-key" className="inline-flex min-h-11 items-center text-auth-link">
          Lost your key?
        </Link>
      </AuthCard>
    );
  }
  return <ResetForm token={token} />;
}
