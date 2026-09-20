/**
 * Public surface of the notifications module ("Chimes"). It listens to domain events (it is subscribed at start-up), writes
 * who-did-what rows, and decides at READ time what each person may see. It depends on `authz`, `profiles` and
 * `relationships` only; no module depends on it.
 */
export {
  getPrefs,
  handleEvent,
  listChimes,
  markRead,
  purgeOldChimes,
  setPrefs,
  unreadCount,
} from './service';
export type { ChimePage, ChimeType, ChimeView } from './service';
