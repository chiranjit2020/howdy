import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));
const dbDir = fileURLToPath(new URL('./db', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': src, '@db': dbDir } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 20_000,
    // integration/security tests share one Postgres database, so run files serially
    fileParallelism: false,
  },
});
