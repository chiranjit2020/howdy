/** Public surface of the auth module. Other code imports only from here. */
export { authHandlers } from './handlers';
export {
  googleConfirmedFor,
  googleEnabled,
  googleSignupCookieName,
  pendingGoogleSignup,
  CONFIRM_TTL_MS,
} from './google';
export { hasPassword } from './no-password';
export { getCurrentUser, identityCheckFor, requireUser, listMySessions } from './server';
export { identityProof, optionalSession, requireSession, requestContext } from './request';
export {
  AUDIT_RETENTION_DAYS,
  purgeExpiredAuthData,
  purgeOldAuditLog,
  purgeUnconfirmedAccounts,
} from './retention';
export { dueDeletions, eraseAccount, purgeFreedHandles } from './deletion';
export { acceptCurrentTerms, pendingAcceptances } from './legal';
export { hasInstalledApp, markAppInstalled } from './app-install';
export { accountExport, verifyForExport } from './export';
export { hasTwoStep, twoStepSummary } from './two-step';
export { turnstileSiteKey } from './turnstile';
export type { TwoStepSummary } from './two-step';
export type { AccountExport } from './export';
export type { SessionContext, SessionUser, SessionSummary } from './sessions';
