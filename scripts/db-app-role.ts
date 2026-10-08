/**
 * Create (or update) a least-privilege login and (re)apply its grants:
 * - the app login the running site connects as (rows only), or
 * - with `--backup`, the read-only login the nightly backup dumps with.
 * Connects as the OWNER login: MIGRATE_DATABASE_URL, else DATABASE_URL_DIRECT, else DATABASE_URL (the same order as
 * migrations). Check which database that is before running it against production. Safe to run again, e.g. to change
 * the password.
 *
 * Run: `APP_DB_PASSWORD=<at least 32 characters> pnpm db:app-role [--backup] [role name]`
 * Defaults: howdy_app, or howdy_backup with --backup. See docs/security/DATABASE_ACCESS.md for what to do next.
 */
import { config } from 'dotenv';
import { Client } from 'pg';
import { applyAppRole, DEFAULT_APP_ROLE } from '@db/roles/app-role';
import { applyBackupRole, DEFAULT_BACKUP_ROLE } from '@db/roles/backup-role';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error('no owner connection: set MIGRATE_DATABASE_URL (or DATABASE_URL)');
  const password = process.env.APP_DB_PASSWORD;
  if (!password) throw new Error('set APP_DB_PASSWORD to the new login password');
  const args = process.argv.slice(2);
  const backup = args.includes('--backup');
  const role = args.find((a) => !a.startsWith('--')) ?? (backup ? DEFAULT_BACKUP_ROLE : DEFAULT_APP_ROLE);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const where = await client.query<{ db: string; me: string }>(
      'select current_database() as db, current_user as me',
    );
    const { db, me } = where.rows[0]!;
    process.stdout.write(`Connected to ${new URL(url).host}/${db} as ${me}\n`);
    if (backup) {
      const check = await applyBackupRole(client, role, password);
      process.stdout.write(`${JSON.stringify({ role, ...check }, null, 2)}\n`);
      const ok =
        check.tables > 0 &&
        check.unreadable.length === 0 &&
        check.writable.length === 0 &&
        !check.canCreateInPublic &&
        check.canReadMigrations &&
        !check.isPrivileged;
      if (!ok) throw new Error('the role does not have the expected rights (see above)');
      process.stdout.write(`OK: ${role} can read ${check.tables} tables and change nothing.\n`);
      return;
    }
    const check = await applyAppRole(client, role, password);
    process.stdout.write(`${JSON.stringify({ role, ...check }, null, 2)}\n`);
    const ok =
      check.tables > 0 &&
      check.missingRowRights.length === 0 &&
      check.writableHistory.length === 0 &&
      !check.canCreateInPublic &&
      check.canReadMigrations &&
      !check.isPrivileged;
    if (!ok) throw new Error('the role does not have the expected rights (see above)');
    process.stdout.write(`OK: ${role} can read and write rows in ${check.tables} tables and nothing more.\n`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`db:app-role failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
