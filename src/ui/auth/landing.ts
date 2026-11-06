/**
 * Where to go after signing in, from the server's `next` (your profile the very first time, Home after that). Only a
 * path of ours is followed (Home or a profile); anything else, or nothing, is Home.
 */
export const landing = (next: unknown): string =>
  typeof next === 'string' && /^\/(home|profile\/[\w-]+)$/.test(next) ? next : '/home';
