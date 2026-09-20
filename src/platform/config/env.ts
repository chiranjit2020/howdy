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
  /** console = log to stdout (dev). file = write JSON to MAIL_OUTBOX_DIR (dev/e2e). No production provider exists yet. */
  MAIL_TRANSPORT: z.enum(['console', 'file']).default('console'),
  MAIL_OUTBOX_DIR: z.string().min(1).default('.dev/outbox'),
  MAIL_FROM: z.string().min(3).default('Howdy <no-reply@howdy.test>'),
  /** Lets a production build use the dev mail transports. For end-to-end tests only; never set on a real deployment. */
  ENABLE_TEST_MAILER: z.enum(['0', '1']).default('0'),
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
  if (env.NODE_ENV === 'production') {
    // Loopback is allowed so a production build can be exercised locally (browsers treat it as a secure context).
    if (!env.APP_URL.startsWith('https://') && !isLoopbackUrl(env.APP_URL)) {
      throw new Error('APP_URL must be https in production');
    }
    if (!env.REDIS_URL) throw new Error('REDIS_URL is required in production (rate limiting)');
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
