import { purgeExpiredAuthData, purgeFreedHandles, purgeOldAuditLog } from '@/modules/auth';
import { openDue } from '@/modules/capsules';
import { purgeDeletedAccounts } from './account-deletion';
import { purgeStaleWaiting } from '@/modules/fence';
import { purgeExpiredLights } from '@/modules/lights';
import { purgeDetachedCardPhotos, purgeStaleMedia } from '@/modules/media';
import { liftExpiredSuspensions, purgeClosedReports } from '@/modules/moderation';
import { purgeOldChimes } from '@/modules/notifications';
import { clearExpiredSignals } from '@/modules/profiles';
import { purgeDeadSubscriptions } from '@/modules/push';
import { openHallCapsules, purgeExpiredRequests, purgeStaleHeld } from '@/modules/town-halls';
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
  // Porch Lights that went out (ADR-032): already treated as off; deleting them keeps no trace of when someone was around.
  const lights = await purgeExpiredLights();
  const waiting = await purgeStaleWaiting();
  // Town Hall posts and replies held for an owner who never answered (ADR-033), on the same 30 days.
  const hallHeld = await purgeStaleHeld();
  // Town Hall join requests that ran out (declined or never answered) after 30 days (ADR-041).
  const hallRequests = await purgeExpiredRequests();
  const chimes = await purgeOldChimes();
  const whispers = await purgeOldWhispers();
  const trackRows = await purgeOldTracks();
  const files = await purgeStaleMedia();
  // Card photos never nailed within the hour, or whose card has since been removed (ADR-031).
  const cardPhotos = await purgeDetachedCardPhotos();
  const tributeRows = await purgeStaleTributes();
  // Not retention, but daily upkeep that belongs with it: Trusted ticks nobody has looked at lately are checked again.
  const trust = await recheckStaleTrust();
  // Timed suspensions that ran out: lifted here too, so the person reappears without having to sign in first.
  const suspensionsDone = await liftExpiredSuspensions();
  const reportsDone = await purgeClosedReports();
  // Accounts whose 14-day grace period is over (ADR-027): files first, then the account.
  const accounts = await purgeDeletedAccounts();
  const handles = await purgeFreedHandles();
  // Security records older than 12 months (the Privacy Policy's figure).
  const audit = await purgeOldAuditLog();
  // Not retention: Time Capsules whose day has come open (and ring) even if their recipient has not looked (ADR-028).
  const capsules = await openDue();
  // Town Hall Time Capsules whose day has come become posts (ADR-043).
  const hallCapsules = await openHallCapsules();
  return {
    ...devices,
    ...auth,
    signals,
    ...lights,
    waiting,
    hallHeld,
    hallRequests,
    ...chimes,
    whispers,
    ...trackRows,
    ...files,
    ...cardPhotos,
    ...tributeRows,
    ...trust,
    ...suspensionsDone,
    ...reportsDone,
    ...accounts,
    ...handles,
    ...audit,
    ...capsules,
    ...hallCapsules,
  };
}
