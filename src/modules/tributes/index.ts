/** Public surface of the Tributes module. */
export {
  approveTribute,
  giveTribute,
  listTributes,
  listWaitingTributes,
  purgeStaleTributes,
  removeTribute,
  setTributePinned,
  RATE,
  PENDING_RETENTION_MS,
} from './service';
export type { AuthorRef, TributePage, TributeView, WaitingTribute } from './service';
