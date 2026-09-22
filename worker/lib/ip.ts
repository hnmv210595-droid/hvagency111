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

export function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  if (!clientIp || clientIp === 'unknown') return false;
  return allowedIps.includes(clientIp);
}
