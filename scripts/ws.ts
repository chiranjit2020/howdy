/**
 * The realtime process: `pnpm ws`. A second entry point that shares the module code (docs/ARCHITECTURE.md §1). Needs the same
 * environment as the web app (DATABASE_URL, REDIS_URL, AUTH_SECRET, APP_URL) and listens on WS_PORT.
 */
import { config } from 'dotenv';
import '@/app/_lib/wire-events';
import { getEnv } from '@/platform/config/env';
import { logger } from '@/platform/logger';
import { createRealtimeServer } from '@/realtime/server';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  const env = getEnv();
  const server = createRealtimeServer({
    port: env.WS_PORT,
    appUrl: env.APP_URL,
    redisUrl: env.REDIS_URL,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    revalidateMs: env.WS_REVALIDATE_SECONDS * 1000,
  });
  const port = await server.listen();
  logger.info({ event: 'realtime.listening', port });

  const stop = () => {
    server
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e: unknown) => {
  process.stderr.write(`realtime failed to start: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
