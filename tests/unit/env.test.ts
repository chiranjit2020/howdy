import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/platform/config/env';

const base = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
};

/** Production must use real object storage; these are the settings for it. */
const r2 = {
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'AKIAEXAMPLEKEY00',
  R2_SECRET_ACCESS_KEY: 'example-secret-access-key-0000',
  R2_BUCKET: 'howdy-media',
};

describe('parseEnv', () => {
  it('accepts a valid development config and applies defaults', () => {
    const env = parseEnv(base);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.REDIS_URL).toBeUndefined();
  });

  it('rejects a short AUTH_SECRET', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });

  it('names bad keys but never echoes their values', () => {
    try {
      parseEnv({ ...base, AUTH_SECRET: 'super-secret-but-short' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain('super-secret-but-short');
    }
  });

  it('requires https and Redis in production', () => {
    const prod = { ...base, ...r2, NODE_ENV: 'production' };
    expect(() => parseEnv({ ...prod, APP_URL: 'http://howdy.example', REDIS_URL: 'redis://r' })).toThrow(
      /https/,
    );
    expect(() => parseEnv({ ...prod, APP_URL: 'https://howdy.example' })).toThrow(/REDIS_URL/);
    expect(parseEnv({ ...prod, APP_URL: 'https://howdy.example', REDIS_URL: 'redis://r' }).NODE_ENV).toBe(
      'production',
    );
  });

  it('allows plain http in production only for loopback (local production runs), never for a real host', () => {
    const prod = { ...base, ...r2, NODE_ENV: 'production', REDIS_URL: 'redis://r' };
    for (const ok of ['http://localhost:3300', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(parseEnv({ ...prod, APP_URL: ok }).APP_URL).toBe(ok);
    }
    for (const bad of ['http://localhost.evil.example', 'http://howdy.example', 'http://192.168.0.5:3000']) {
      expect(() => parseEnv({ ...prod, APP_URL: bad })).toThrow(/https/);
    }
  });

  it('defaults the mail and proxy settings safely', () => {
    const env = parseEnv(base);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
    expect(env.MAIL_TRANSPORT).toBe('console');
    expect(env.ENABLE_TEST_MAILER).toBe('0');
  });

  describe('storage settings', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      APP_URL: 'https://howdy.example',
      REDIS_URL: 'redis://r',
    };

    it('default to local files, which is fine for development', () => {
      const env = parseEnv(base);
      expect(env.STORAGE_DRIVER).toBe('local');
      expect(env.STORAGE_LOCAL_DIR).toBe('.dev/media');
      expect(env.ENABLE_TEST_STORAGE).toBe('0');
    });

    it('r2 needs all four R2 settings, and names the missing ones without printing any value', () => {
      expect(parseEnv({ ...base, ...r2 }).R2_BUCKET).toBe('howdy-media');
      try {
        parseEnv({ ...base, STORAGE_DRIVER: 'r2', R2_ACCOUNT_ID: r2.R2_ACCOUNT_ID });
        expect.unreachable();
      } catch (e) {
        expect(String(e)).toMatch(/R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_BUCKET/);
        expect(String(e)).not.toContain(r2.R2_ACCOUNT_ID);
      }
    });

    it('rejects a malformed account id or bucket name', () => {
      expect(() => parseEnv({ ...base, ...r2, R2_ACCOUNT_ID: 'not-an-account-id' })).toThrow(/R2_ACCOUNT_ID/);
      expect(() => parseEnv({ ...base, ...r2, R2_BUCKET: 'Bad Bucket/../x' })).toThrow(/R2_BUCKET/);
    });

    it('production refuses local files (they would not survive a redeploy) unless it is an end-to-end test build', () => {
      expect(() => parseEnv(prod)).toThrow(/STORAGE_DRIVER must be r2/);
      expect(parseEnv({ ...prod, ENABLE_TEST_STORAGE: '1' }).STORAGE_DRIVER).toBe('local');
      expect(parseEnv({ ...prod, ...r2 }).STORAGE_DRIVER).toBe('r2');
    });
  });

  describe('WebSocket settings', () => {
    const prod = {
      ...base,
      ...r2,
      NODE_ENV: 'production',
      APP_URL: 'https://howdy.example',
      REDIS_URL: 'redis://localhost:6379',
    };

    it('are optional: live delivery is simply off when WS_PUBLIC_URL is unset', () => {
      const env = parseEnv(base);
      expect(env.WS_PUBLIC_URL).toBeUndefined();
      expect(env.WS_PORT).toBe(3301);
      expect(env.WS_REVALIDATE_SECONDS).toBe(60);
    });

    it('accept only a bare ws(s) origin — no paths, queries, other schemes or spaces', () => {
      expect(parseEnv({ ...base, WS_PUBLIC_URL: 'ws://localhost:3301' }).WS_PUBLIC_URL).toBe(
        'ws://localhost:3301',
      );
      for (const bad of [
        'http://x',
        'wss://x/path',
        'wss://x?y=1',
        'wss://',
        'wss://a b',
        'javascript:alert(1)',
        '*',
      ]) {
        expect(() => parseEnv({ ...base, WS_PUBLIC_URL: bad }), bad).toThrow(/WS_PUBLIC_URL/);
      }
      expect(() => parseEnv({ ...base, WS_PORT: '0' })).toThrow(/WS_PORT/);
      expect(() => parseEnv({ ...base, WS_PORT: '70000' })).toThrow(/WS_PORT/);
      expect(() => parseEnv({ ...base, WS_REVALIDATE_SECONDS: '0' })).toThrow(/WS_REVALIDATE_SECONDS/);
      expect(() => parseEnv({ ...base, WS_REVALIDATE_SECONDS: '9999' })).toThrow(/WS_REVALIDATE_SECONDS/);
    });

    it('must be wss in production, except on loopback', () => {
      expect(parseEnv({ ...prod, WS_PUBLIC_URL: 'wss://ws.howdy.example' }).WS_PUBLIC_URL).toBe(
        'wss://ws.howdy.example',
      );
      expect(parseEnv({ ...prod, WS_PUBLIC_URL: 'ws://localhost:3301' }).WS_PUBLIC_URL).toBe(
        'ws://localhost:3301',
      );
      expect(() => parseEnv({ ...prod, WS_PUBLIC_URL: 'ws://ws.howdy.example' })).toThrow(/wss/);
    });
  });
});
