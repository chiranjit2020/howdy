/**
 * Public surface of the health module: checks every service Howdy depends on (database, migrations, storage space,
 * Redis, photo storage, email, the website itself) plus a few activity counts, and emails the owner a daily digest and
 * an alert when something goes wrong or recovers. Run by /api/health/report on a schedule.
 */
export { runAndNotify, runHealthReport, formatReport, decideEmail, overallOf } from './report';
export type { HealthReport, Overall, ReportKind } from './report';
export type { CheckResult, CheckStatus, Activity } from './checks';
