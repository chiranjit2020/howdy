/**
 * Best-effort client address for rate-limit keys only (never stored). `X-Forwarded-For` is attacker-controlled unless
 * a trusted proxy sets it, so it is honoured only when TRUST_PROXY_HOPS > 0, and then we take the entry that many
 * hops from the RIGHT (the one appended by our own proxy), never the client-supplied leftmost value.
 */
export function clientIp(headers: Headers, trustProxyHops: number): string {
  if (trustProxyHops > 0) {
    const parts = (headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = parts[parts.length - trustProxyHops];
    if (ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) return ip;
  }
  return 'direct';
}
