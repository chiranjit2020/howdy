/**
 * Where someone's Portrait is served from. `version` (the id of the stored photo) makes a replaced photo a NEW address, so no browser
 * keeps showing the old one. The address alone grants nothing: the server checks who is asking every time.
 */
export const portraitUrl = (handle: string, version: string): string =>
  `/api/portraits/${encodeURIComponent(handle)}?v=${encodeURIComponent(version)}`;

/**
 * The small copy of a Portrait address (avatars up to 64 px). Only Howdy's own Portrait addresses get it: a preview of
 * a photo still being chosen (a `blob:` address) is left as it is.
 */
export const smallPortrait = (src: string): string =>
  src.startsWith('/api/portraits/') ? `${src}${src.includes('?') ? '&' : '?'}size=small` : src;

/** Where someone's cover photo is served from (ADR-051), named by version in the same way. */
export const coverUrl = (handle: string, version: string): string =>
  `/api/covers/${encodeURIComponent(handle)}?v=${encodeURIComponent(version)}`;
