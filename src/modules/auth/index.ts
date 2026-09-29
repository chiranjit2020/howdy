/** Public surface of the auth module. Other code imports only from here. */
export { authHandlers } from './handlers';
export { getCurrentUser, requireUser, listMySessions } from './server';
export { optionalSession, requireSession, requestContext } from './request';
export { purgeExpiredAuthData } from './retention';
export { dueDeletions, eraseAccount, purgeFreedHandles } from './deletion';
export { acceptCurrentTerms, pendingAcceptances } from './legal';
export type { SessionContext, SessionUser, SessionSummary } from './sessions';
