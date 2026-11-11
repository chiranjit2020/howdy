import { users } from '@db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/** Whether this person has ever opened Howdy as the installed app (Home's "Get the Howdy app" bar then stays away). */
export async function hasInstalledApp(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ at: users.appInstalledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!row?.at;
}

/** Remember the first time the installed app was opened (later calls change nothing). */
export async function markAppInstalled(userId: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ appInstalledAt: sql`now()` })
    .where(and(eq(users.id, userId), isNull(users.appInstalledAt)));
}
