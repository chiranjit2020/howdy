import { config } from 'dotenv';

// Load local dev settings, then force test-safe values. Tests must never touch the dev database.
config({ path: '.env.local', quiet: true });

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = 'test';
env.APP_URL = 'http://localhost:3000';
env.LOG_LEVEL = 'silent';
env.AUTH_SECRET = 'test-secret-test-secret-test-secret-0123456789';
// Tests vary the caller with X-Forwarded-For to exercise per-IP rate limits.
env.TRUST_PROXY_HOPS = '1';
delete env.MAIL_TRANSPORT;
if (env.TEST_DATABASE_URL) env.DATABASE_URL = env.TEST_DATABASE_URL;

// Domain events reach the notifications module the way they do in the running server.
await import('@/app/_lib/wire-events');
