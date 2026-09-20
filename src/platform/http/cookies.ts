export interface CookieOptions {
  maxAgeSec?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}

/** Serialize a Set-Cookie value. Values here are always opaque tokens; refuse anything that needs escaping. */
export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name)) throw new Error('Invalid cookie name');
  if (!/^[\w.~-]*$/.test(value)) throw new Error('Invalid cookie value');
  const parts = [`${name}=${value}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.maxAgeSec !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSec))}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

/** Parse a Cookie request header into a map. Later duplicates do not override earlier ones. */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const key = pair.slice(0, i).trim();
    if (key === '') continue; // nameless cookie
    const val = pair.slice(i + 1).trim();
    if (!out.has(key)) out.set(key, val);
  }
  return out;
}
