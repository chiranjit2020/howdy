import { purgeExpiredAuthData } from '@/modules/auth';
import { purgeStaleWaiting } from '@/modules/fence';
import { purgeStaleMedia } from '@/modules/media';
import { purgeOldChimes } from '@/modules/notifications';
import { clearExpiredSignals } from '@/modules/profiles';
import { purgeOldTracks } from '@/modules/tracks';
import { purgeStaleTributes } from '@/modules/tributes';
import { purgeOldWhispers } from '@/modules/whispers';

/**
 * Every retention job (master prompt §54, docs/DATA_LIFECYCLE.md §3), one after another. Idempotent. Run daily by Vercel
 * Cron (/api/jobs/purge) and by hand with `pnpm jobs:purge`. The Privacy Policy promises these periods, so this must run.
 */
export async function runAllPurges() {
  const auth = await purgeExpiredAuthData();
  const signals = await clearExpiredSignals();
  const waiting = await purgeStaleWaiting();
  const chimes = await purgeOldChimes();
  const whispers = await purgeOldWhispers();
  const trackRows = await purgeOldTracks();
  const files = await purgeStaleMedia();
  const tributeRows = await purgeStaleTributes();
  return { ...auth, signals, waiting, ...chimes, whispers, ...trackRows, ...files, ...tributeRows };
}
