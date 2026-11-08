/**
 * The desktop opening screen (2026-11-08): blue with the logo, once per visit. The proxy marks the first full page load
 * of a visit with this request header and sets a session cookie (no expiry: it goes when the browser closes) so later
 * loads skip it. No script is involved, so the CSP stays as strict as it is. Listed in the Cookie Policy.
 */
export const SPLASH_COOKIE = 'howdy_hello';
export const SPLASH_HEADER = 'x-howdy-splash';
