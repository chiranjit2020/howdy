/**
 * Public surface of the profiles (Ranch) module. It knows nothing about sessions: HTTP routes compose it with the auth
 * module in the app layer, which keeps auth → profiles the only dependency direction (no cycles).
 */
export {
  clearExpiredSignals,
  clearSignal,
  createProfile,
  getCards,
  getFenceResource,
  getOwnRanch,
  getRanchForViewer,
  isShadowWalking,
  mayViewRanch,
  resolveHandle,
  setSignal,
  updateRanch,
} from './service';
export type { OwnRanch, PersonCard, RanchPatch, RanchView } from './service';
