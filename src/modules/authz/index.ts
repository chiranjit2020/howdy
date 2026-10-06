/** Public surface of the authorisation module. */
export { can, canFence, holdFor, inPosse, isHidden, neighbourMatters } from './policy';
export type {
  Action,
  Actor,
  Decision,
  DenyReason,
  FenceAction,
  FenceContext,
  FencePostingLevel,
  FenceResource,
  PolicyContext,
  RanchResource,
} from './policy';
