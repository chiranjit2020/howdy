/**
 * Display names, written the same way everywhere (2026-11-10, the user's call: "be consistent with Capitalize").
 *
 * Only the FIRST letter of each word is raised; the rest stays as the person typed it, so "McDonald", "DJ Rao" and
 * "D'Souza" survive, while "asha k" becomes "Asha K". Words are split on spaces and hyphens ("Jean-Luc"). Scripts
 * without capitals (Devanagari, Bengali …) are left alone, because raising a letter there changes nothing.
 *
 * Migration 0056_capitalise_names did the same to the names already saved; keep the two in step.
 */
export function capitaliseName(name: string): string {
  return name.replace(
    /(^|[\s-])(\p{Ll})/gu,
    (_, before: string, letter: string) => before + letter.toUpperCase(),
  );
}

/**
 * The name a new account starts with when nobody typed one (email sign-up): the username made readable,
 * "asha_k" → "Asha K", "rickdev" → "Rickdev". A username of only underscores keeps the username itself.
 */
export function nameFromHandle(handle: string): string {
  const words = handle.split('_').filter(Boolean).join(' ');
  return words ? capitaliseName(words) : handle;
}
