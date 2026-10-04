/**
 * Public surface of the whispers module: private two-person threads (280 characters, 7-day retention). Transport-agnostic — the
 * HTTP routes and the WebSocket process both call these functions, so the same authorisation, limits and validation apply
 * whichever way a Whisper arrives. Depends on `authz`, `profiles` and `relationships`; nothing depends on it.
 */
export {
  burnThread,
  countHeld,
  listHeld,
  getThread,
  listThreads,
  markThreadRead,
  messageForReport,
  mayOpenThread,
  messageForDelivery,
  purgeOldWhispers,
  sendWhisper,
  unreadThreads,
} from './service';
export type { HeldWhisper, ThreadPage, ThreadSummary } from './service';
export { whispersExport } from './export';
export type { WhispersExport } from './export';
