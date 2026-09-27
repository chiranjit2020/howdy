import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/modules/auth';
import { mayOpenThread } from '@/modules/whispers';
import { AppError } from '@/platform/errors';

/**
 * Decides "not found" BEFORE the loading outline streams (after that the status is fixed at 200), so a thread this person
 * may not open is a real 404, the same as a made-up call sign. The page keeps its own full check.
 */
export default async function ThreadGate({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ handle: string }>;
}) {
  const user = await requireUser();
  const allowed = await mayOpenThread(user.id, (await params).handle).catch((err: unknown) => {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') return true; // the page shows "take a breather"
    throw err;
  });
  if (!allowed) notFound();
  return children;
}
