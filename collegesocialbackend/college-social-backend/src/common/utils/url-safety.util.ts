import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';

// Blocks SSRF via link-preview fetches: an attacker pasting a message like
// `http://169.254.169.254/latest/meta-data/` or `http://internal-admin.local` into a chat must
// never cause our server to make a request to internal infrastructure. Both the literal hostname
// (if it's already an IP) and the DNS-resolved address are checked, since a hostname that resolves
// fine at check-time could otherwise be used for DNS-rebinding.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 (ULA)
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice('::ffff:'.length));
  return false;
}

function isPrivateIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP literal -- treat as unsafe rather than silently allowing it
}

export class UnsafeUrlError extends Error {}

// Throws UnsafeUrlError if the URL isn't a public http(s) endpoint. Returns the parsed URL on
// success so callers don't need to re-parse it.
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('رابط غير صالح');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('البروتوكول غير مدعوم');
  }
  if (url.hostname === 'localhost') throw new UnsafeUrlError('غير مسموح');

  const literalVersion = isIP(url.hostname);
  if (literalVersion) {
    if (isPrivateIP(url.hostname)) throw new UnsafeUrlError('غير مسموح');
    return url;
  }

  // Explicitly typed and split out of a .catch() chain -- `.catch(() => [])` makes TS infer the
  // fallback as `never[]`, which collapses the union's element type to `never` and breaks
  // `.address` access below.
  let resolved: LookupAddress[];
  try {
    resolved = await lookup(url.hostname, { all: true });
  } catch {
    resolved = [];
  }
  if (resolved.length === 0) throw new UnsafeUrlError('تعذّر تحليل الرابط');
  if (resolved.some((r) => isPrivateIP(r.address))) throw new UnsafeUrlError('غير مسموح');

  return url;
}
