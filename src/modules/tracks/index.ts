/**
 * Public surface of the tracks module (profile visits). It listens to `ranch.visited` domain events (wired at start-up), keeps the
 * least it can (a pair of ids and a UTC date, one row per pair, 7 days) and decides at READ time who may be named. It depends on
 * `profiles` and `relationships` only; nothing depends on it.
 */
export { bucketOf, handleEvent, listTracks, purgeOldTracks, recordVisit } from './service';
export type { TrackPerson, TracksView, When } from './service';
