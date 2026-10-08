/** Admin surfaces (Control Room). Read-only views over data other modules already own. */
export { adminStanding, securityOverview } from './security';
export type { AdminStanding, SecurityOverview, SecurityEventRow } from './security';
export { ALERT_RULES, QUIET_HOURS, findSecurityAlerts, formatAlertEmail, runSecurityAlerts } from './alerts';
export type { AlertRun, AlertRule, AlertSeverity, SecurityAlert } from './alerts';
export { RANGES, consoleData, isConsoleRange } from './console';
export type { ActivityBucket, Compare, ConsoleData, ConsoleRange } from './console';
