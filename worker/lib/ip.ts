/** Extract client IP from Cloudflare / proxy headers. */
export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

/** Parse company IPs from env (comma-separated) and/or settings JSON array. */
export function parseCompanyIps(
  envIp?: string,
  settingsIps?: string[] | string | null,
): string[] {
  const set = new Set<string>();

  if (envIp) {
    for (const part of envIp.split(',')) {
      const ip = part.trim();
      if (ip) set.add(ip);
    }
  }

  if (Array.isArray(settingsIps)) {
    for (const ip of settingsIps) {
      if (ip?.trim()) set.add(ip.trim());
    }
  } else if (typeof settingsIps === 'string' && settingsIps.trim()) {
    try {
      const parsed = JSON.parse(settingsIps) as unknown;
      if (Array.isArray(parsed)) {
        for (const ip of parsed) {
          if (typeof ip === 'string' && ip.trim()) set.add(ip.trim());
        }
      }
    } catch {
      for (const part of settingsIps.split(',')) {
        const ip = part.trim();
        if (ip) set.add(ip);
      }
    }
  }

  return Array.from(set);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** IPv4 CIDR match, e.g. 115.76.54.148 in 115.76.54.0/24. */
function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base ?? '');
  if (ipInt == null || baseInt == null) return false;
  if (bits === 0) return true;
  const block = 2 ** (32 - bits);
  return Math.floor(ipInt / block) === Math.floor(baseInt / block);
}

/** Allowed entries may be exact IPs or IPv4 CIDR ranges (e.g. 115.76.54.0/24). */
export function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  if (!clientIp || clientIp === 'unknown') return false;
  return allowedIps.some((entry) =>
    entry.includes('/') ? ipv4InCidr(clientIp, entry) : entry === clientIp,
  );
}
