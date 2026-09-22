import Link from 'next/link';
import { ClayCard } from '@/ui/primitives';
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
      <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
        <ClayCard className="flex flex-col gap-3 p-8">
          <h1 className="text-heading text-text-primary">That link is incomplete</h1>
          <p className="text-body text-text-secondary">
            Open the link from your email again, or ask for a new one.
          </p>
          <Link href="/lost-your-key" className="inline-flex min-h-11 items-center">
            Lost your key?
          </Link>
        </ClayCard>
      </main>
    );
  }
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <ResetForm token={token} />
    </main>
  );
}
