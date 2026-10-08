import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminStanding, securityOverview } from '@/modules/admin';
import { requireUser } from '@/modules/auth';
import { SecurityView } from './security-view';

export const metadata = { title: 'Security Center', robots: { index: false, follow: false } };

/**
 * The Security Center (admin only). Anyone who is not an admin gets the ordinary 404 — the Control Room is not
 * advertised. An admin without two-step is told to turn it on first (master prompt §45). No `loading.tsx`: the role
 * check must answer before anything streams.
 */
export default async function SecurityCenterPage() {
  const user = await requireUser();
  const standing = await adminStanding(user.id);
  if (standing === 'not_admin') notFound();
  if (standing === 'needs_two_step') {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <h1 className="text-title font-bold tracking-wide">HOWDY · SECURITY CENTER</h1>
        <div className="flex flex-col gap-3 rounded-md border border-on-island/15 bg-island-raised p-4">
          <p className="text-body">
            The Security Center needs two-step sign-in. Turn it on under Sign-in security.
          </p>
          <Link
            href="/workshop#sign-in-security"
            className="inline-flex min-h-11 items-center self-start text-on-island underline underline-offset-2"
          >
            Go to Sign-in security →
          </Link>
        </div>
      </main>
    );
  }
  const data = await securityOverview(user.id);
  return <SecurityView data={data} />;
}
