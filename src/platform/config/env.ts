import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  /** How many trusted reverse-proxy hops append to X-Forwarded-For. 0 = do not trust the header at all. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** console = log to stdout (dev). file = write JSON to MAIL_OUTBOX_DIR (dev/e2e). resend = the Resend HTTP API (production). */
  MAIL_TRANSPORT: z.enum(['console', 'file', 'resend']).default('console'),
  MAIL_OUTBOX_DIR: z.string().min(1).default('.dev/outbox'),
  MAIL_FROM: z.string().min(3).default('Howdy <no-reply@howdy.test>'),
  RESEND_API_KEY: z
    .string()
    .regex(/^re_\S{8,}$/, 'RESEND_API_KEY must be a Resend API key (re_...)')
    .optional(),
  /** Lets a production build use the dev mail transports. For end-to-end tests only; never set on a real deployment. */
  ENABLE_TEST_MAILER: z.enum(['0', '1']).default('0'),
  /** local = files in STORAGE_LOCAL_DIR (dev/e2e only). r2 = Cloudflare R2 through the S3 protocol (any S3-compatible store works). */
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('.dev/media'),
  /** Lets a production build use the local driver. For end-to-end tests only; never set on a real deployment. */
  ENABLE_TEST_STORAGE: z.enum(['0', '1']).default('0'),
  R2_ACCOUNT_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/, 'R2_ACCOUNT_ID must be the 32-character Cloudflare account id')
    .optional(),
  R2_ACCESS_KEY_ID: z.string().min(8).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  R2_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'R2_BUCKET must be a valid bucket name')
    .optional(),
  /**
   * Shared secret for the scheduled health report (/api/health/report). Vercel Cron sends it automatically as
   * "Authorization: Bearer <CRON_SECRET>"; the GitHub Actions watcher sends the same. Unset = the report is disabled.
   */
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters').optional(),
  /** Where health digests and alerts are emailed. Unset = reports are produced but not emailed. */
  HEALTH_REPORT_TO: z.email().optional(),
  /** Port of the separate WebSocket process (`pnpm ws`). */
  WS_PORT: z.coerce.number().int().min(1).max(65535).default(3301),
  /** How often an open socket re-checks that its session is still valid (logout, "log out everywhere", suspension end it). */
  WS_REVALIDATE_SECONDS: z.coerce.number().int().min(1).max(600).default(60),
  /**
   * Where browsers reach the WebSocket process (e.g. wss://ws.howdy.example). Also the ONLY socket origin the Content-Security-Policy
   * allows. Unset = live delivery is off and everything still works over plain HTTP.
   */
  WS_PUBLIC_URL: z
    .string()
    .regex(/^wss?:\/\/[^\s/?#]+$/, 'WS_PUBLIC_URL must look like wss://host[:port] with no path')
    .optional(),
  /**
   * Ably API key (`appId.keyId:secret`) for instant Whispers (ADR-035): the server rings a person's own channel and their
   * open Whispers page fetches what is new. Unset = pages check every few seconds instead (everything else works).
   */
  ABLY_API_KEY: z
    .string()
    .regex(/^[\w-]+\.[\w-]+:[\w+/=-]+$/, 'ABLY_API_KEY must look like appId.keyId:secret')
    .optional(),
  /**
   * The photo check (ADR-039): every uploaded Portrait and Post Card photo is shown to OpenAI's free moderation model
   * before anyone else sees it. Unset = no check (photos go up as before; reports still work).
   */
  OPENAI_API_KEY: z
    .string()
    .regex(/^sk-[\w-]{20,}$/, 'OPENAI_API_KEY must look like sk-…')
    .optional(),
  /**
   * Web Push (VAPID) key pair, from `npx web-push generate-vapid-keys`. Both or neither. Unset = phones get no notifications
   * while Howdy is closed (everything else works). The public key is sent to browsers; the private key never leaves the server.
   */
  VAPID_PUBLIC_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{87}$/, 'VAPID_PUBLIC_KEY must be a base64url P-256 public key')
    .optional(),
  VAPID_PRIVATE_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/, 'VAPID_PRIVATE_KEY must be a base64url P-256 private key')
    .optional(),
  /** Who push services contact about our pushes (mailto: or https:). */
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)\S+$/)
    .default('mailto:privacy@howdy.chiranjitkarmakar.com'),
});

export type Env = z.infer<typeof schema>;

/** http://localhost, http://127.0.0.1 or http://[::1] (any port). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  } catch {
    return false;
  }
}

/** Parse and validate an env record. Throws a message that names bad keys but never prints values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => i.path.join('.') || '(root)'))];
    throw new Error(`Invalid environment configuration. Check: ${keys.join(', ')}`);
  }
  const env = result.data;
  if (env.STORAGE_DRIVER === 'r2') {
    const missing = (
      ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const
    ).filter((k) => !env[k]);
    if (missing.length) throw new Error(`STORAGE_DRIVER=r2 needs: ${missing.join(', ')}`);
  }
  if (!env.VAPID_PUBLIC_KEY !== !env.VAPID_PRIVATE_KEY) {
    throw new Error('Web Push needs both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (or neither)');
  }
  if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
    throw new Error('MAIL_TRANSPORT=resend needs: RESEND_API_KEY');
  }
  if (env.NODE_ENV === 'production') {
    // Files on a local disk do not survive a redeploy or a second server: production must use real object storage.
    if (env.STORAGE_DRIVER === 'local' && env.ENABLE_TEST_STORAGE !== '1') {
      throw new Error('STORAGE_DRIVER must be r2 in production');
    }
    // Loopback is allowed so a production build can be exercised locally (browsers treat it as a secure context).
    if (!env.APP_URL.startsWith('https://') && !isLoopbackUrl(env.APP_URL)) {
      throw new Error('APP_URL must be https in production');
    }
    if (!env.REDIS_URL) throw new Error('REDIS_URL is required in production (rate limiting)');
    // Verification and reset links must reach a real inbox: console/file would leak them into logs or a disk.
    if (env.MAIL_TRANSPORT !== 'resend' && env.ENABLE_TEST_MAILER !== '1') {
      throw new Error('MAIL_TRANSPORT must be resend in production');
    }
    if (
      env.WS_PUBLIC_URL?.startsWith('ws://') &&
      !isLoopbackUrl(env.WS_PUBLIC_URL.replace(/^ws:/, 'http:'))
    ) {
      throw new Error('WS_PUBLIC_URL must be wss in production');
    }
  }
  return env;
}

let cached: Env | undefined;

/** Tests only: re-read process.env on the next getEnv(). */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Lazily validated process env. Lazy so `next build` doesn't need runtime secrets to collect routes. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
