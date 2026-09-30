import { describe, expect, it, vi } from 'vitest';

/** The database check: waking Neon up is not "slow"; being slow once awake is. */

const delays: number[] = [];
vi.mock('@/platform/db', async (original) => ({
  ...(await original<typeof import('@/platform/db')>()),
  getPool: () => ({
    query: () => new Promise((resolve) => setTimeout(resolve, delays.shift() ?? 0)),
  }),
}));

const { checkDatabase, SLOW_MS } = await import('@/modules/health/checks');

describe('database check', () => {
  it('a slow first query (waking up) is only mentioned; the awake one decides', async () => {
    delays.push(SLOW_MS.database + 400, 5);
    const r = await checkDatabase();
    expect(r.status).toBe('ok');
    expect(r.detail).toMatch(/^Answering in \d+ ms \(the first, which woke it up, took \d+ ms\)\.$/);
  });

  it('slow while awake is still a warning', async () => {
    delays.push(5, SLOW_MS.database + 100);
    const r = await checkDatabase();
    expect(r.status).toBe('warn');
    expect(r.detail).toMatch(/^Answering, but slowly/);
  });

  it('a quick database says nothing about waking up', async () => {
    delays.push(5, 5);
    expect((await checkDatabase()).detail).toMatch(/^Answering in \d+ ms\.$/);
  });
});
