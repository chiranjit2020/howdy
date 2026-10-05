/**
 * Give someone a staff role, or take it away. There is deliberately no way to do this from inside the app: a role is set
 * by hand, by whoever holds the database credentials. Uses whatever `DATABASE_URL` `.env.local` points at (check which
 * database that is before running it against production). The change is written to `audit_log`.
 *
 * Run: `pnpm set-role <call sign> <member|moderator|admin>`
 */
import { config } from 'dotenv';
import { getPool } from '@/platform/db';
import { USER_ROLES, type UserRole } from '@/shared/validation/moderation';
import { handleParamSchema } from '@/shared/validation/profile';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  const [rawHandle, rawRole] = process.argv.slice(2);
  const handle = handleParamSchema.safeParse(rawHandle?.replace(/^@/, ''));
  if (!handle.success || !USER_ROLES.includes(rawRole as UserRole)) {
    throw new Error(`usage: pnpm set-role <call sign> <${USER_ROLES.join('|')}>`);
  }
  const role = rawRole as UserRole;
  const pool = getPool();
  const { rows } = await pool.query<{ id: string; old_role: string }>(
    `update users u set role = $2 from users old
      where u.id = old.id and u.handle = $1
      returning u.id, old.role as old_role`,
    [handle.data, role],
  );
  const row = rows[0];
  if (!row) throw new Error(`no account with the call sign "${handle.data}"`);
  if (row.old_role !== role) {
    await pool.query(`insert into audit_log (user_id, event, meta) values ($1, 'role_changed', $2)`, [
      row.id,
      { from: row.old_role, to: role, by: 'set-role script' },
    ]);
  }
  process.stdout.write(`@${handle.data}: ${row.old_role} -> ${role}\n`);
  if (role !== 'member') {
    // Staff need two-step sign-in before moderation opens for them (ADR-040).
    const { rows: on } = await pool.query<{ on: boolean }>(
      `select exists (select 1 from totp_factors where user_id = $1 and confirmed_at is not null)
           or exists (select 1 from passkeys where user_id = $1) as on`,
      [row.id],
    );
    if (!on[0]?.on) {
      process.stdout.write(
        'Note: two-step sign-in is off for this account. Moderation stays closed to them until they add a passkey\n' +
          'or an authenticator app under Workshop > Sign-in security.\n',
      );
    }
  }
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`set-role failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
