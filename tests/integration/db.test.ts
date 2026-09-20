import { afterAll, describe, expect, it } from 'vitest';
import { getPool, pingDb } from '@/platform/db';
import { GET as health } from '@/app/api/health/route';

afterAll(async () => {
  await getPool().end();
});

describe('database', () => {
  it('connects to the TEST database, never the dev one', async () => {
    expect(await pingDb()).toBe(true);
    const { rows } = await getPool().query<{ db: string }>('select current_database() as db');
    expect(rows[0]?.db).toMatch(/_test$/);
  });

  it('has migrations applied (citext available)', async () => {
    const { rows } = await getPool().query("select 1 from pg_extension where extname = 'citext'");
    expect(rows).toHaveLength(1);
  });

  it('health endpoint reports up without leaking connection details', async () => {
    const res = await health(new Request('http://localhost:3000/api/health'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ status: 'ok', db: 'up' });
    expect(text).not.toMatch(/postgres|5433|howdy_/);
  });
});
