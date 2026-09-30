// Run a .sql file against the local howdy_perf database (Phase 13, ADR-030), statement by statement, printing timings
// and row counts. Reads PERF_DATABASE_URL from .dev/perf/.env. Never point it at dev or prod.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = readFileSync('.dev/perf/.env', 'utf8').split('=').slice(1).join('=').trim();
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("set statement_timeout = '15min'");
const text = readFileSync(process.argv[2], 'utf8').replace(/^--.*$/gm, '');
for (const stmt of text
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean)) {
  const t = Date.now();
  const r = await client.query(stmt);
  process.stdout.write(
    `${String(Date.now() - t).padStart(7)} ms  ${String(r.rowCount ?? '').padStart(7)}  ${stmt.split('\n')[0].slice(0, 70)}\n`,
  );
}
await client.end();
