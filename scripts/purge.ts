/**
 * Retention job (master prompt §54): remove expired ephemeral data. Idempotent and safe to run repeatedly.
 * Run: `pnpm jobs:purge`. In production Vercel Cron runs the same thing daily (/api/jobs/purge, see vercel.json).
 */
import { config } from 'dotenv';
import { runAllPurges } from '@/app/_lib/purge';
import { getPool } from '@/platform/db';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  const started = Date.now();
  const summary = await runAllPurges();
  process.stdout.write(
    `${JSON.stringify({ event: 'jobs.purge', ...summary, durationMs: Date.now() - started })}\n`,
  );
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`purge failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
