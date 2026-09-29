import { dueDeletions, eraseAccount } from '@/modules/auth';
import { deleteAllMediaFor, mediaLeftFor } from '@/modules/media';
import { logger } from '@/platform/logger';

const log = logger.child({ module: 'account-deletion' });

/**
 * The last step of account deletion (ADR-027, docs/DATA_LIFECYCLE.md §2), run by the daily job: for each account whose
 * grace period is over, remove its files from storage FIRST, and only when none are left delete the account. A storage
 * failure leaves the `media` rows (and the account) in place, so tomorrow's run tries again — nothing is orphaned.
 * One account's failure never stops the others.
 */
export async function purgeDeletedAccounts(now: Date = new Date()): Promise<{
  accountsDeleted: number;
  accountsDeferred: number;
}> {
  let deleted = 0;
  let deferred = 0;
  for (const userId of await dueDeletions(now)) {
    try {
      await deleteAllMediaFor(userId);
      if ((await mediaLeftFor(userId)) > 0) {
        deferred += 1;
        log.warn({ event: 'account_deletion.files_left' });
        continue;
      }
      if (await eraseAccount(userId)) deleted += 1;
    } catch (cause) {
      deferred += 1;
      log.warn({ event: 'account_deletion.failed', cause: String(cause) });
    }
  }
  return { accountsDeleted: deleted, accountsDeferred: deferred };
}
