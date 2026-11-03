/**
 * Public surface of the notifications module ("Chimes"). It listens to domain events (it is subscribed at start-up), writes
 * who-did-what rows, and decides at READ time what each person may see. It depends on `authz`, `profiles` and
 * `relationships` only; no module depends on it.
 */
export {
  clearChimes,
  getPrefs,
  handleEvent,
  listChimes,
  markRead,
  markSeen,
  purgeOldChimes,
  removeChime,
  setChimeRead,
  setPrefs,
  unreadCount,
} from './service';
export type { ChimePage, ChimeType, ChimeView } from './service';
