/** Public surface of the trust module: the Trusted tick (ADR-020). */
export {
  handleEvent,
  judge,
  recheckStaleTrust,
  recheckTrust,
  recheckTrustIfStale,
  RECHECK_AFTER_MS,
  TRUST_RULES,
} from './service';
export type { Facts, TrustCheck, TrustCheckKey, TrustStatus } from './service';
