import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/modules/auth';
import { mayViewRanchByHandle } from '@/modules/profiles';
import { AppError } from '@/platform/errors';

/**
 * Decides "not found" BEFORE the loading outline (loading.tsx) streams. Once it streams, the status is fixed at 200, and a
 * hidden Porch would answer 200 where a missing one answers 404 — the same thing must look the same. The page keeps its own
 * full check; this only makes the status honest. Signed out, the page shows the same prompt for missing and hidden alike.
 */
export default async function PorchGate({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ handle: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    const allowed = await mayViewRanchByHandle(user.id, (await params).handle).catch((err: unknown) => {
      if (err instanceof AppError && err.code === 'RATE_LIMITED') return true; // the page shows "take a breather"
      throw err;
    });
    if (!allowed) notFound();
  }
  return children;
}
