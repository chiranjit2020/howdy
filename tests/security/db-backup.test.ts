import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyBackupRole, checkBackupRole } from '@db/roles/backup-role';

// The nightly backup (.github/workflows/backup.yml, docs/security/DATABASE_ACCESS.md). The dump and restore themselves
// run in CI against PostgreSQL 18; these tests keep their inputs honest as the schema changes.
const ROLE = 'howdy_backup_test';
const PASSWORD = randomBytes(24).toString('hex');
const ownerUrl = process.env.TEST_DATABASE_URL!;

const listFile = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
const skipped = listFile('scripts/backup/skip-data.txt');
const fixSql = readFileSync('scripts/backup/fix-dangling.sql', 'utf8');

let owner: Client;
let backup: Client;

beforeAll(async () => {
  owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  await applyBackupRole(owner, ROLE, PASSWORD);
  const url = new URL(ownerUrl);
  url.username = ROLE;
  url.password = PASSWORD;
  backup = new Client({ connectionString: url.toString() });
  await backup.connect();
});
afterAll(async () => {
  await backup?.end();
  await owner?.end();
});

describe('the backup login (read-only)', () => {
  it('can read every table and the migration ledger, and change nothing', async () => {
    const check = await checkBackupRole(owner, ROLE);
    expect(check.tables).toBeGreaterThan(30);
    expect(check).toMatchObject({
      unreadable: [],
      writable: [],
      canCreateInPublic: false,
      canReadMigrations: true,
      isPrivileged: false,
    });
    await backup.query('select count(*) from users');
    await backup.query('begin');
    await backup.query('lock table users in access share mode'); // what pg_dump does to every table
    await backup.query('commit');
    for (const stmt of [
      `insert into audit_log (event, meta) values ('role_changed', '{}')`,
      `update users set role = role`,
      'delete from audit_log',
      'truncate audit_log',
      'create table public.probe (id int)',
      'drop table users',
    ]) {
      await expect(backup.query(stmt), stmt).rejects.toThrow(/permission denied|must be owner/i);
    }
  });

  it('can read tables a later migration adds', async () => {
    await owner.query('create table public.backup_probe (id int)');
    try {
      await backup.query('select * from backup_probe');
    } finally {
      await owner.query('drop table public.backup_probe');
    }
  });
});

describe('what the backup leaves out (skip-data.txt)', () => {
  it('names real tables, including everything the privacy policy says is short-lived', async () => {
    const { rows } = await owner.query<{ t: string }>(
      `select tablename as t from pg_tables where schemaname = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.t));
    expect(skipped.filter((t) => !tables.has(t))).toEqual([]);
    // Whispers 7 days, Stories 12 hours, Tracks 7 days, Porch Light only while on; and sign-in secrets.
    for (const t of [
      'messages',
      'stories',
      'story_views',
      'story_reactions',
      'tracks',
      'porch_lights',
      'sessions',
      'email_tokens',
    ]) {
      expect(skipped).toContain(t);
    }
  });

  it('every kept row that points at a left-out row is SET NULL and cleared by fix-dangling.sql', async () => {
    const { rows } = await owner.query<{ src: string; dst: string; col: string; action: string }>(
      `select c.conrelid::regclass::text as src, c.confrelid::regclass::text as dst, a.attname as col,
              c.confdeltype as action
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid::regclass::text = any($1) and not (c.conrelid::regclass::text = any($1))`,
      [skipped],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const fk of rows) {
      // A kept row that CASCADEs or blocks on a left-out one cannot be fixed by clearing a column: leave it out too.
      expect(fk.action, `${fk.src}.${fk.col} -> ${fk.dst}`).toBe('n');
      expect(fixSql, `${fk.src}.${fk.col} -> ${fk.dst}`).toMatch(
        new RegExp(`update ${fk.src} set ${fk.col} = null[\\s\\S]*?from ${fk.dst}\\b`),
      );
    }
  });

  it('fix-dangling.sql runs cleanly', async () => {
    await owner.query('begin');
    try {
      await owner.query(fixSql);
    } finally {
      await owner.query('rollback');
    }
  });

  it('backups are encrypted to exactly one age public key', () => {
    const keys = listFile('scripts/backup/recipient.txt');
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^age1[02-9ac-hj-np-z]{58}$/);
  });
});
