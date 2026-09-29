import { purgeExpiredAuthData, purgeFreedHandles } from '@/modules/auth';
import { purgeDeletedAccounts } from './account-deletion';
import { purgeStaleWaiting } from '@/modules/fence';
import { purgeStaleMedia } from '@/modules/media';
import { liftExpiredSuspensions, purgeClosedReports } from '@/modules/moderation';
import { purgeOldChimes } from '@/modules/notifications';
import { clearExpiredSignals } from '@/modules/profiles';
import { purgeDeadSubscriptions } from '@/modules/push';
import { purgeOldTracks } from '@/modules/tracks';
import { purgeStaleTributes } from '@/modules/tributes';
import { recheckStaleTrust } from '@/modules/trust';
import { purgeOldWhispers } from '@/modules/whispers';

/**
 * Every retention job (master prompt §54, docs/DATA_LIFECYCLE.md §3), one after another. Idempotent. Run daily by Vercel
 * Cron (/api/jobs/purge) and by hand with `pnpm jobs:purge`. The Privacy Policy promises these periods, so this must run.
 */
export async function runAllPurges() {
  // Devices of ended sessions first (a revoked session row may be kept a while; its phone must not be).
  const devices = await purgeDeadSubscriptions();
  const auth = await purgeExpiredAuthData();
  const signals = await clearExpiredSignals();
  const waiting = await purgeStaleWaiting();
  const chimes = await purgeOldChimes();
  const whispers = await purgeOldWhispers();
  const trackRows = await purgeOldTracks();
  const files = await purgeStaleMedia();
  const tributeRows = await purgeStaleTributes();
  // Not retention, but daily upkeep that belongs with it: Trusted ticks nobody has looked at lately are checked again.
  const trust = await recheckStaleTrust();
  // Timed suspensions that ran out: lifted here too, so the person reappears without having to sign in first.
  const suspensionsDone = await liftExpiredSuspensions();
  const reportsDone = await purgeClosedReports();
  // Accounts whose 14-day grace period is over (ADR-027): files first, then the account.
  const accounts = await purgeDeletedAccounts();
  const handles = await purgeFreedHandles();
  return {
    ...devices,
    ...auth,
    signals,
    waiting,
    ...chimes,
    whispers,
    ...trackRows,
    ...files,
    ...tributeRows,
    ...trust,
    ...suspensionsDone,
    ...reportsDone,
    ...accounts,
    ...handles,
  };
}
