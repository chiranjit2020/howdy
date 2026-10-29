/**
 * Best-effort client address for rate-limit keys only (never stored). `X-Forwarded-For` is attacker-controlled unless
 * a trusted proxy sets it, so it is honoured only when TRUST_PROXY_HOPS > 0, and then we take the entry that many
 * hops from the RIGHT (the one appended by our own proxy), never the client-supplied leftmost value.
 *
 * IPv6 addresses are counted by their /64 network, not one by one: an ordinary home or cloud connection is given a whole
 * /64 (2^64 addresses), so per-address limits would let one machine rotate forever (security audit 2026-10-29,
 * finding 3). IPv4 addresses, and IPv4 carried inside IPv6 (`::ffff:1.2.3.4`), are counted as they are.
 */
export function clientIp(headers: Headers, trustProxyHops: number): string {
  if (trustProxyHops > 0) {
    const parts = (headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = parts[parts.length - trustProxyHops];
    if (ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) return ip.includes(':') ? (ipv6Network(ip) ?? ip) : ip;
  }
  return 'direct';
}

/**
 * The /64 network of an IPv6 address, written `2001:db8:1:2::/64`; the plain IPv4 address for an IPv4-mapped one; null
 * when it is not a well-formed IPv6 address. Handles `::` shortening and an IPv4 tail.
 */
export function ipv6Network(raw: string): string | null {
  const ip = raw.split('%')[0]!.toLowerCase(); // drop a zone id (fe80::1%eth0)
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s: string | undefined): string[] | null => {
    if (!s) return [];
    const out: string[] = [];
    const parts = s.split(':');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      if (i === parts.length - 1 && p.includes('.')) {
        // An IPv4 tail fills the last two groups.
        const v4 = p.split('.').map(Number);
        if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        out.push(((v4[0]! << 8) | v4[1]!).toString(16), ((v4[2]! << 8) | v4[3]!).toString(16));
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
        out.push(p);
      }
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const tail = toGroups(halves[1]);
  if (!head || !tail) return null;
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const n = groups.map((g) => parseInt(g, 16));
  // IPv4-mapped (::ffff:a.b.c.d): really an IPv4 client, counted as one.
  if (n.slice(0, 5).every((g) => g === 0) && n[5] === 0xffff) {
    return [n[6]! >> 8, n[6]! & 255, n[7]! >> 8, n[7]! & 255].join('.');
  }
  return `${n
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}
