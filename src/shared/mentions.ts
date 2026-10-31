/**
 * "@handle" at the very start of a reply: the Reply link under a reply writes it there. Used to show the name as a link
 * and, on the server, to tell that person (only if they already replied on the same post, so nobody can ping strangers).
 * Wall posts and group posts share it.
 */
export const LEADING_MENTION = /^@([a-z0-9_]{3,24})(?![a-z0-9_])/i;

/** The handle a reply starts with, lower-cased, or undefined when it does not start with one. */
export function leadingMention(body: string): string | undefined {
  return LEADING_MENTION.exec(body)?.[1]?.toLowerCase();
}
