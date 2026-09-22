/**
 * Retention job (master prompt §54): remove expired ephemeral data. Idempotent and safe to run repeatedly.
 * Run: `pnpm jobs:purge`. Scheduling it (cron / platform scheduler / a worker) is a deployment task — see docs/DATA_LIFECYCLE.md.
 */
import { config } from 'dotenv';
import { purgeExpiredAuthData } from '@/modules/auth';
import { purgeStaleWaiting } from '@/modules/fence';
import { purgeStaleMedia } from '@/modules/media';
import { purgeOldChimes } from '@/modules/notifications';
import { purgeOldTracks } from '@/modules/tracks';
import { purgeOldWhispers } from '@/modules/whispers';
import { clearExpiredSignals } from '@/modules/profiles';
import { getPool } from '@/platform/db';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  const started = Date.now();
  const auth = await purgeExpiredAuthData();
  const signals = await clearExpiredSignals();
  const waiting = await purgeStaleWaiting();
  const chimes = await purgeOldChimes();
  const whispers = await purgeOldWhispers();
  const trackRows = await purgeOldTracks();
  const files = await purgeStaleMedia();
  process.stdout.write(
    `${JSON.stringify({ event: 'jobs.purge', ...auth, signals, waiting, ...chimes, whispers, ...trackRows, ...files, durationMs: Date.now() - started })}\n`,
  );
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`purge failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
