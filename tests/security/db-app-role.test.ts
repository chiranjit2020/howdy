import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyAppRole, checkAppRole } from '@db/roles/app-role';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';

// The least-privilege login the running app uses (docs/security/DATABASE_ACCESS.md). Roles are cluster-wide, so the
// test uses its own name; its grants live in the test database only.
const ROLE = 'howdy_app_test';
const PASSWORD = randomBytes(24).toString('hex');
const ownerUrl = process.env.TEST_DATABASE_URL!;

let owner: Client;
let app: Client;
let kit: TestKit;

const denied = /permission denied|must be owner|must be superuser|insufficient privilege/i;

beforeAll(async () => {
  owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  await applyAppRole(owner, ROLE, PASSWORD);
  const url = new URL(ownerUrl);
  url.username = ROLE;
  url.password = PASSWORD;
  app = new Client({ connectionString: url.toString() });
  await app.connect();
});
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await app?.end();
  await owner?.end();
  await getPool().end();
});

describe('the app database login (least privilege)', () => {
  it('can read and write rows in every table, and has no special powers', async () => {
    const check = await checkAppRole(owner, ROLE);
    expect(check.tables).toBeGreaterThan(30);
    expect(check).toMatchObject({
      missingRowRights: [],
      writableHistory: [],
      canCreateInPublic: false,
      canReadMigrations: true,
      isPrivileged: false,
    });
  });

  it('runs what the app runs: reads, writes, advisory locks, the health checks', async () => {
    const u = await signedInUser(kit, uniqueUser('alice'));
    const { rows } = await app.query('select id from users where handle = $1', [u.handle]);
    expect(rows).toHaveLength(1);
    await app.query('update users set role = role where id = $1', [rows[0].id]);
    await app.query(`insert into audit_log (user_id, event, meta) values ($1, 'role_changed', '{}')`, [
      rows[0].id,
    ]);
    await app.query('begin');
    await app.query(`select pg_advisory_xact_lock(hashtextextended('probe', 0))`);
    await app.query('commit');
    await app.query('select count(*) from drizzle.__drizzle_migrations');
    await app.query('select pg_database_size(current_database())');
  });

  it('may remove old audit entries (retention) but never rewrite or wipe them', async () => {
    await app.query(`insert into audit_log (event, meta) values ('role_changed', '{}')`);
    await expect(app.query(`update audit_log set event = 'login_success'`)).rejects.toThrow(denied);
    await expect(app.query('truncate audit_log')).rejects.toThrow(denied);
    const { rowCount } = await app.query(`delete from audit_log where event = 'role_changed'`);
    expect(rowCount).toBeGreaterThan(0);
  });

  it('cannot change the schema, grant rights or create logins', async () => {
    for (const stmt of [
      'create table public.probe (id int)',
      'drop table users',
      'alter table users add column probe int',
      'truncate users cascade',
      'create index probe_idx on users (created_at)',
      `create role probe login`,
      `alter role ${ROLE} superuser`,
      'create schema probe',
      'create extension if not exists pgcrypto',
    ]) {
      await expect(app.query(stmt), stmt).rejects.toThrow(/permission denied|must be|not allowed|privilege/i);
    }
    // A GRANT without grant option only warns ("no privileges were granted"), so check that nothing was granted.
    await app.query('grant all on users to public');
    const { rows } = await owner.query(`select has_table_privilege('public', 'users', 'insert') as leaked`);
    expect(rows[0].leaked).toBe(false);
  });

  it('deleting an account still cascades and anonymises the audit trail (foreign keys act as the owner)', async () => {
    const u = await signedInUser(kit, uniqueUser('bob'));
    const { rows } = await app.query<{ id: string }>('select id from users where handle = $1', [u.handle]);
    const id = rows[0]!.id;
    await app.query(`insert into audit_log (user_id, event, meta) values ($1, 'role_changed', '{}')`, [id]);
    await app.query('delete from users where id = $1', [id]);
    const left = await owner.query('select count(*)::int as n from audit_log where user_id = $1', [id]);
    expect(left.rows[0].n).toBe(0);
    const kept = await owner.query(
      `select count(*)::int as n from audit_log where user_id is null and event = 'role_changed'`,
    );
    expect(kept.rows[0].n).toBeGreaterThan(0);
  });

  it('gets row rights on tables a later migration adds (default privileges)', async () => {
    await owner.query('create table public.app_role_probe (id serial primary key, v text)');
    try {
      await app.query(`insert into app_role_probe (v) values ('x')`);
      await app.query(`update app_role_probe set v = 'y'`);
      expect((await app.query('select v from app_role_probe')).rows).toEqual([{ v: 'y' }]);
      await expect(app.query('drop table app_role_probe')).rejects.toThrow(denied);
    } finally {
      await owner.query('drop table public.app_role_probe');
    }
  });

  it('refuses a weak password, a bad role name, or being run as the app login', async () => {
    await expect(applyAppRole(owner, ROLE, 'short')).rejects.toThrow(/at least 32/);
    await expect(applyAppRole(owner, 'bad"name', PASSWORD)).rejects.toThrow(/invalid role name/);
    await expect(applyAppRole(app, ROLE, PASSWORD)).rejects.toThrow(/owner login/);
    await expect(applyAppRole(app, 'other_role', PASSWORD)).rejects.toThrow(/owns the tables/);
  });

  it('is safe to run again', async () => {
    const again = await applyAppRole(owner, ROLE, PASSWORD);
    expect(again).toMatchObject({ missingRowRights: [], writableHistory: [], isPrivileged: false });
  });
});
