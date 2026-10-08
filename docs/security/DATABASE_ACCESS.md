# Database access (least privilege) and restore

_Written 2026-10-09. Owner: the site owner. Update when a login, a grant or the backup setup changes._

## Two logins, two jobs

| Login | Used by | Can do |
|---|---|---|
| **Owner** (Neon: `howdy_prod_owner`; dev branch: `howdy_dev_owner`) | Migrations (`pnpm db:migrate`), `pnpm db:app-role`, hand-run scripts (`set-role`) | Everything in the database: owns every table |
| **`howdy_app`** | The running site (Vercel `DATABASE_URL`) and Vercel Cron jobs | Read, add, change and remove **rows**. Nothing else |

What `howdy_app` **cannot** do, checked by `tests/security/db-app-role.test.ts`:

- create, alter, drop or truncate tables, indexes, schemas or extensions;
- grant rights to anyone, create logins, or make itself more powerful (no superuser / createdb / createrole / bypassrls);
- **change or wipe the audit trail**: on `audit_log` it may only add rows and delete them (the 12-month retention job). No
  `UPDATE`, no `TRUNCATE`.

Why it matters: if a bug ever let an attacker run their own SQL through the site, they get the app's rights, not the
owner's. They could not drop the database, add a backdoor login, or quietly edit the audit trail to hide what they did.
(They could still read and change rows: the rest of the defences — parameterised SQL, authorisation on every request,
input validation — are what stop that.)

Foreign-key actions (account deletion cascading, the audit trail's `user_id` set to null) run as the table owner, so they
keep working.

## Setting it up / changing the password

Run as the **owner** (it refuses otherwise), once per database:

```powershell
$env:MIGRATE_DATABASE_URL = '<owner connection string, direct (non-pooled)>'
$env:APP_DB_PASSWORD      = '<new random value, at least 32 characters>'
pnpm db:app-role
```

It is safe to run again (it resets the password and re-applies the grants) and prints what the role can actually do, read
back from the database catalogue. Then set Vercel's `DATABASE_URL` (Production) to the **pooled** Neon host with
`howdy_app:<password>` in place of the owner, and redeploy.

Tables added by later migrations get the same row rights automatically (default privileges), **as long as migrations run
as the same owner login**. If a migration is ever run as another login, re-run `pnpm db:app-role`.

Rotating the password: run the command with a new `APP_DB_PASSWORD`, update Vercel, redeploy. The old password stops
working at once, so do the Vercel change straight after.

## Restore (backups)

Neon keeps a history of every change (point-in-time restore). Production (`howdy-sg`, branch `main`, database
`howdy_prod`) keeps **6 hours** of history (free plan, checked 2026-10-09). Anything noticed later than 6 hours after it
happened **cannot be restored** from Neon: there is no other backup today. Closing that gap needs either a paid Neon plan
(longer history) or a scheduled off-site dump (`pg_dump`, encrypted, kept for some weeks). A restore is done by creating a
**branch** from a past moment, checking it, and then either copying data back or pointing the site at it.

Drill (no effect on the live database):

1. Neon → project `howdy-sg` → Branches → **Create branch** → "from a point in time" (e.g. 1 hour ago).
2. Connect to the branch (its own connection string) and compare row counts with production:
   `select (select count(*) from users) users, (select count(*) from post_cards) cards, (select count(*) from audit_log) audit;`
3. Delete the branch.

In a real incident (data destroyed or corrupted): stop writes (Vercel → pause, or set the site to maintenance), create a
branch from just before the incident, check it as above, then make it the primary branch (Neon "Reset from" / promote) or
point `DATABASE_URL` at it. Record what happened per `INCIDENT_RESPONSE.md`.

Drill log:

| Date | From | Result |
|---|---|---|
| — | — | not yet run |
