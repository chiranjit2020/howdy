/** Public surface of the auth module. Other code imports only from here. */
export { authHandlers } from './handlers';
export { googleEnabled, googleSignupCookieName, pendingGoogleSignup } from './google';
export { getCurrentUser, requireUser, listMySessions } from './server';
export { optionalSession, requireSession, requestContext } from './request';
export {
  AUDIT_RETENTION_DAYS,
  purgeExpiredAuthData,
  purgeOldAuditLog,
  purgeUnconfirmedAccounts,
} from './retention';
export { dueDeletions, eraseAccount, purgeFreedHandles } from './deletion';
export { acceptCurrentTerms, pendingAcceptances } from './legal';
export { accountExport, verifyForExport } from './export';
export { hasTwoStep, twoStepSummary } from './two-step';
export { turnstileSiteKey } from './turnstile';
export type { TwoStepSummary } from './two-step';
export type { AccountExport } from './export';
export type { SessionContext, SessionUser, SessionSummary } from './sessions';
