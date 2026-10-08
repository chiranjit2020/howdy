/**
 * The database login the running app uses (least privilege). It may read and write rows, and nothing else: it cannot
 * create, alter, drop or truncate tables, grant rights, or rewrite the audit trail. Schema changes (migrations) run as
 * the owner login instead, which also owns every table, so the defaults set here cover tables later migrations add.
 *
 * Applied by `pnpm db:app-role` (scripts/db-app-role.ts); see docs/security/DATABASE_ACCESS.md.
 */
import type { ClientBase } from 'pg';

export const DEFAULT_APP_ROLE = 'howdy_app';
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
export const MIN_APP_PASSWORD_LENGTH = 32;

/** Tables whose rows are history: the app may add and (for retention) remove rows, never change them. */
export const APPEND_ONLY_TABLES = ['audit_log'] as const;

export type AppRoleCheck = {
  tables: number;
  /** Tables the role cannot fully read and write (should be none). */
  missingRowRights: string[];
  /** Append-only tables the role could still change (should be none). */
  writableHistory: string[];
  canCreateInPublic: boolean;
  canReadMigrations: boolean;
  isPrivileged: boolean;
};

const q = (name: string) => `"${name}"`;

/**
 * Checks a role name and password, and that this connection is the owner login (it owns every table, and runs the
 * migrations). Returns the database name. Shared by every login this folder sets up.
 */
export async function assertOwnerSetup(
  client: ClientBase,
  role: string,
  password: string,
): Promise<{ db: string }> {
  if (!ROLE_NAME.test(role)) throw new Error(`invalid role name "${role}"`);
  if (password.length < MIN_APP_PASSWORD_LENGTH) {
    throw new Error(`the login's password must be at least ${MIN_APP_PASSWORD_LENGTH} characters`);
  }
  const { rows: me } = await client.query<{ me: string; db: string }>(
    'select current_user as me, current_database() as db',
  );
  const owner = me[0]!.me;
  if (owner === role) throw new Error('run this as the owner login, not as the login being set up');
  const { rows: foreign } = await client.query<{ tablename: string; tableowner: string }>(
    `select tablename, tableowner from pg_tables where schemaname = 'public' and tableowner <> current_user`,
  );
  if (foreign.length > 0) {
    throw new Error(
      `run this as the login that owns the tables; not owned by ${owner}: ` +
        foreign.map((t) => `${t.tablename} (${t.tableowner})`).join(', '),
    );
  }
  return { db: me[0]!.db };
}

/** CREATE ROLE or ALTER ROLE (same attributes, new password): a login with no special powers. */
export async function upsertLogin(client: ClientBase, role: string, password: string): Promise<void> {
  const r = q(role);
  const pw = client.escapeLiteral(password);
  const attrs = 'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [role]);
  await client.query(
    rowCount
      ? `alter role ${r} with ${attrs} password ${pw}`
      : `create role ${r} with ${attrs} password ${pw}`,
  );
}

export const quoteIdent = q;

/**
 * Creates the role (or resets its password) and (re)applies its grants. Must run as the login that owns the tables
 * and runs migrations. Idempotent.
 */
export async function applyAppRole(
  client: ClientBase,
  role: string,
  password: string,
): Promise<AppRoleCheck> {
  const { db } = await assertOwnerSetup(client, role, password);
  const r = q(role);
  await client.query('begin');
  try {
    await upsertLogin(client, role, password);
    await client.query(`grant connect on database ${q(db)} to ${r}`);
    // Nobody but the owner creates objects in public (already the default from PostgreSQL 15).
    await client.query('revoke create on schema public from public');
    await client.query(`grant usage on schema public to ${r}`);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${r}`);
    await client.query(`revoke truncate, references, trigger on all tables in schema public from ${r}`);
    for (const t of APPEND_ONLY_TABLES) await client.query(`revoke update on ${q(t)} from ${r}`);
    await client.query(`grant usage, select on all sequences in schema public to ${r}`);
    // Tables and sequences that later migrations (run by this same owner) create get the same row rights.
    await client.query(
      `alter default privileges in schema public grant select, insert, update, delete on tables to ${r}`,
    );
    await client.query(`alter default privileges in schema public grant usage, select on sequences to ${r}`);
    // The health report counts applied migrations.
    const { rowCount: hasLedger } = await client.query(
      `select 1 from pg_tables where schemaname = 'drizzle' and tablename = '__drizzle_migrations'`,
    );
    if (hasLedger) {
      await client.query(`grant usage on schema drizzle to ${r}`);
      await client.query(`grant select on drizzle.__drizzle_migrations to ${r}`);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
  return checkAppRole(client, role);
}

/** What the role can actually do, read back from the catalog (not from what we meant to grant). */
export async function checkAppRole(client: ClientBase, role: string): Promise<AppRoleCheck> {
  const { rows: tables } = await client.query<{ name: string; rw: boolean; upd: boolean; trunc: boolean }>(
    `select tablename as name,
            has_table_privilege($1, format('public.%I', tablename), 'select, insert, delete') as rw,
            has_table_privilege($1, format('public.%I', tablename), 'update') as upd,
            has_table_privilege($1, format('public.%I', tablename), 'truncate') as trunc
       from pg_tables where schemaname = 'public' order by tablename`,
    [role],
  );
  const history = new Set<string>(APPEND_ONLY_TABLES);
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
    missingRowRights: tables.filter((t) => !t.rw || (!history.has(t.name) && !t.upd)).map((t) => t.name),
    writableHistory: tables.filter((t) => history.has(t.name) && (t.upd || t.trunc)).map((t) => t.name),
    canCreateInPublic: misc[0]!.create,
    canReadMigrations: misc[0]!.ledger !== false,
    isPrivileged: misc[0]!.priv,
  };
}
