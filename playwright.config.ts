import { defineConfig } from '@playwright/test';

const PORT = 3300;
const WS_PORT = 3301;

/**
 * E2E runs against a PRODUCTION build (`pnpm build` first — `pnpm e2e` does it) so the real CSP, minified
 * bundles and font loading are exercised. Uses the locally installed Edge, so no browser download is needed.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000, // journeys create several accounts (Argon2 + emails) per test
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        // Loopback http is allowed in production for local runs; the Origin the browser sends must equal APP_URL (CSRF check).
        APP_URL: `http://localhost:${PORT}`,
        ENABLE_DESIGN_KIT: '1',
        // Test-only mail transport: one JSON file per message so the spec can read verification / reset links.
        ENABLE_TEST_MAILER: '1',
        MAIL_TRANSPORT: 'file',
        MAIL_OUTBOX_DIR: '.dev/e2e-outbox',
        // Test-only storage: Portraits go to a folder instead of Cloudflare R2 (production refuses this without the flag).
        ENABLE_TEST_STORAGE: '1',
        STORAGE_LOCAL_DIR: '.dev/e2e-media',
        // The spec gives every browser context its own X-Forwarded-For, so per-IP rate limits never bleed between runs.
        TRUST_PROXY_HOPS: '1',
        // Where pages connect for live Whispers. Also the only socket origin the CSP allows.
        WS_PUBLIC_URL: `ws://localhost:${WS_PORT}`,
      },
    },
    {
      // The realtime process, run the way production runs it (NODE_ENV=production selects the same session cookie name).
      command: 'pnpm exec tsx scripts/ws.ts',
      url: `http://localhost:${WS_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
        APP_URL: `http://localhost:${PORT}`,
        // The realtime process reads the same config (it never touches files or mail, but production still validates it).
        ENABLE_TEST_STORAGE: '1',
        ENABLE_TEST_MAILER: '1',
        WS_PORT: String(WS_PORT),
        WS_REVALIDATE_SECONDS: '2',
        TRUST_PROXY_HOPS: '1',
        LOG_LEVEL: 'warn',
      },
    },
  ],
});
