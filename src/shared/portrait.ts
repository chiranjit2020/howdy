/**
 * Where someone's Portrait is served from. `version` (the id of the stored photo) makes a replaced photo a NEW address, so no browser
 * keeps showing the old one. The address alone grants nothing: the server checks who is asking every time.
 */
export const portraitUrl = (handle: string, version: string): string =>
  `/api/portraits/${encodeURIComponent(handle)}?v=${encodeURIComponent(version)}`;
