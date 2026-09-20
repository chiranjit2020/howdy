import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local', quiet: true });

// Same schema/migrations as drizzle.config.ts, applied to the TEST database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: { url: process.env.TEST_DATABASE_URL ?? '' },
  strict: true,
});
