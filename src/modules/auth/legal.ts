import { legalAcceptances } from '@db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { enforceRateLimit } from '@/platform/rate-limit';
import { ACCEPTED_DOCS, requiredVersion, type AcceptedDoc } from '@/shared/legal';
import { audit } from './audit';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The rows that record agreeing to every document's CURRENT required version. */
const currentRows = (userId: string) =>
  ACCEPTED_DOCS.map((document) => ({ userId, document, version: requiredVersion(document) }));

/** Record agreement to the current Terms + Privacy Policy. Part of the sign-up transaction; idempotent. */
export async function recordAcceptance(db: Db | Tx, userId: string): Promise<void> {
  await db.insert(legalAcceptances).values(currentRows(userId)).onConflictDoNothing();
}

/**
 * Which documents this person still has to agree to: those whose required version they have not accepted (never, or
 * only an older one). Empty for almost everyone, almost always — only a material change (a new `acceptVersion`) or an
 * account from before acceptance was tracked asks again.
 */
export async function pendingAcceptances(userId: string): Promise<AcceptedDoc[]> {
  const rows = await getDb()
    .select({ document: legalAcceptances.document, version: legalAcceptances.version })
    .from(legalAcceptances)
    .where(and(eq(legalAcceptances.userId, userId), inArray(legalAcceptances.document, [...ACCEPTED_DOCS])));
  return ACCEPTED_DOCS.filter(
    (doc) => !rows.some((r) => r.document === doc && r.version === requiredVersion(doc)),
  );
}

/** The signed-in person agrees to the current versions (the "agree to continue" screen). Idempotent. */
export async function acceptCurrentTerms(userId: string, requestId?: string): Promise<void> {
  await enforceRateLimit(`legal:accept:${userId}`, { limit: 20, windowSec: 3600 });
  const pending = await pendingAcceptances(userId);
  if (pending.length === 0) return;
  await recordAcceptance(getDb(), userId);
  await audit('legal_accepted', {
    userId,
    ...(requestId ? { requestId } : {}),
    meta: Object.fromEntries(pending.map((d) => [d, requiredVersion(d)])),
  });
}
