/**
 * Public surface of the media module: Portraits (profile photos) for now. It depends on no other module: it knows who OWNS a
 * file, never who may SEE it. The app layer composes it with the profile rules (`mayViewRanch`) before serving anything.
 */
export {
  completePortrait,
  deleteAllMediaFor,
  getPortraitVersion,
  getPortraitVersions,
  purgeStaleMedia,
  readPortrait,
  removePortrait,
  retirePortrait,
  startPortraitUpload,
  type StartedUpload,
} from './service';
export { processPortrait, MAX_INPUT_PIXELS, type ProcessedPortrait } from './image';
