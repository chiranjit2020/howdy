/**
 * "Add to your Story" from the phone's Create sheet. A browser opens the photo picker only straight from a tap, so the
 * sheet picks the photo itself and leaves it here; Home's Stories (which hold the whole adding flow) take it as they
 * appear, or at once when Home is already open. Kept in memory only: a reload simply forgets it.
 */
let pending: File | null = null;

export const STORY_FILE_EVENT = 'howdy:story-file';

export function offerStoryFile(file: File) {
  pending = file;
  window.dispatchEvent(new Event(STORY_FILE_EVENT));
}

export function takeStoryFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}
