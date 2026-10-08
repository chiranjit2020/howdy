/**
 * The read-only login the nightly backup (.github/workflows/backup.yml) dumps the database with. It can read every
 * table and nothing else, so the credential GitHub holds can never change or delete data.
 *
 * Applied by `pnpm db:app-role --backup` (scripts/db-app-role.ts); see docs/security/DATABASE_ACCESS.md.
 */
import type { ClientBase } from 'pg';
import { assertOwnerSetup, quoteIdent as q, upsertLogin } from './app-role';

export const DEFAULT_BACKUP_ROLE = 'howdy_backup';

export type BackupRoleCheck = {
  tables: number;
  /** Tables it cannot read (should be none: pg_dump locks every table it dumps). */
  unreadable: string[];
  /** Tables it could change (should be none). */
  writable: string[];
  canCreateInPublic: boolean;
  canReadMigrations: boolean;
  isPrivileged: boolean;
};

export async function applyBackupRole(
  client: ClientBase,
  role: string,
  password: string,
): Promise<BackupRoleCheck> {
  const { db } = await assertOwnerSetup(client, role, password);
  const r = q(role);
  await client.query('begin');
  try {
    await upsertLogin(client, role, password);
    await client.query(`grant connect on database ${q(db)} to ${r}`);
    await client.query('revoke create on schema public from public');
    await client.query(`grant usage on schema public to ${r}`);
    await client.query(`grant select on all tables in schema public to ${r}`);
    await client.query(`grant select on all sequences in schema public to ${r}`);
    await client.query(`alter default privileges in schema public grant select on tables to ${r}`);
    await client.query(`alter default privileges in schema public grant select on sequences to ${r}`);
    const { rowCount: hasLedger } = await client.query(
      `select 1 from pg_namespace where nspname = 'drizzle'`,
    );
    if (hasLedger) {
      await client.query(`grant usage on schema drizzle to ${r}`);
      await client.query(`grant select on all tables in schema drizzle to ${r}`);
      await client.query(`grant select on all sequences in schema drizzle to ${r}`);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
  return checkBackupRole(client, role);
}

export async function checkBackupRole(client: ClientBase, role: string): Promise<BackupRoleCheck> {
  const { rows: tables } = await client.query<{ name: string; read: boolean; write: boolean }>(
    `select tablename as name,
            has_table_privilege($1, format('public.%I', tablename), 'select') as read,
            has_table_privilege($1, format('public.%I', tablename), 'insert, update, delete, truncate') as write
       from pg_tables where schemaname = 'public' order by tablename`,
    [role],
  );
  const { rows: misc } = await client.query<{ create: boolean; ledger: boolean | null; priv: boolean }>(
    `select has_schema_privilege($1, 'public', 'create') as create,
            case when to_regclass('drizzle.__drizzle_migrations') is null then null
                 else has_table_privilege($1, 'drizzle.__drizzle_migrations', 'select') end as ledger,
            (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls
               from pg_roles where rolname = $1) as priv`,
    [role],
  );
  return {
    tables: tables.length,
    unreadable: tables.filter((t) => !t.read).map((t) => t.name),
    writable: tables.filter((t) => t.write).map((t) => t.name),
    canCreateInPublic: misc[0]!.create,
    canReadMigrations: misc[0]!.ledger !== false,
    isPrivileged: misc[0]!.priv,
  };
}
