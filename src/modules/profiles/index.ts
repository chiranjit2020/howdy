/**
 * Public surface of the profiles (Ranch) module. It knows nothing about sessions: HTTP routes compose it with the auth
 * module in the app layer, which keeps auth → profiles the only dependency direction (no cycles).
 */
export {
  bothShareReceipts,
  sharingStoryViews,
  clearExpiredSignals,
  clearSignal,
  createProfile,
  getCards,
  getFenceResource,
  getFenceResources,
  getOwnRanch,
  getRanchForViewer,
  getTeamAnnouncement,
  isOfficial,
  isShadowWalking,
  mayViewRanch,
  mayViewRanchByHandle,
  resolveHandle,
  setSignal,
  updateRanch,
  viewableRanches,
} from './service';
export type { OwnRanch, PersonCard, RanchPatch, RanchView } from './service';
