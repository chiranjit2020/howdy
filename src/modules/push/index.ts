/**
 * Public surface of the push module: notifications on a phone or computer while Howdy is closed (Web Push, ADR-022). It owns
 * the device list and the sending, and knows nothing about WHAT is worth a push — the notifications module decides that, after
 * all of its own filters (block, mute, Restrict, switched-off kinds). Depends on no other module.
 */
export {
  MAX_DEVICES,
  purgeDeadSubscriptions,
  pushPublicKey,
  pushTo,
  setPushSender,
  subscribe,
  unsubscribe,
} from './service';
export type { PushSender, PushTarget } from './service';
export {
  announcementPending,
  BUY_OR_WAIT_ANNOUNCEMENT,
  isTeamMember,
  previewAnnouncement,
  sendAnnouncement,
} from './announce';
export type { AnnounceResult, Announcement } from './announce';
