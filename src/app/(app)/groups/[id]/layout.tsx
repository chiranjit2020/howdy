import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/modules/auth';
import { mayOpenTownHall } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';

/**
 * Decides "not found" BEFORE the loading outline streams (after that the status is fixed at 200), so an invite-only Town
 * Hall this person is not in is a real 404, the same as one that does not exist. The page keeps its own full check.
 */
export default async function TownHallGate({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const allowed = await mayOpenTownHall(user.id, (await params).id).catch((err: unknown) => {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') return true; // the page answers as it always has
    throw err;
  });
  if (!allowed) notFound();
  return children;
}
