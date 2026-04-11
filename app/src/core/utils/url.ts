const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLocalhostHostname(hostname: string): boolean {
  return LOCALHOST_NAMES.has(hostname.toLowerCase());
}

function isPrivateIP(hostname: string): boolean {
  // IPv4 private ranges: 10.*, 172.16-31.*, 192.168.*
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Returns true if the URL is allowed as a provider endpoint.
 * HTTPS is always allowed; HTTP only for localhost/private IP.
 */
export function isAllowedProviderUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol === 'https:') return true;
    if (protocol === 'http:') {
      return isLocalhostHostname(hostname) || isPrivateIP(hostname);
    }
    return false;
  } catch {
    return false;
  }
}

/** Returns the provider security tier for display in UI */
export function providerSecurityTier(
  raw: string
): 'secure' | 'local' | 'warning' {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol === 'https:') return 'secure';
    if (
      protocol === 'http:' &&
      (isLocalhostHostname(hostname) || isPrivateIP(hostname))
    )
      return 'local';
    return 'warning';
  } catch {
    return 'warning';
  }
}
