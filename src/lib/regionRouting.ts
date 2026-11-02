/**
 * Region routing helpers shared by the browser and the /api/v* redirect route.
 * Must stay free of browser-only and server-only imports.
 */

export const REGION_COOKIE = 'shuffle-region';
export const DEFAULT_BACKEND = 'https://shuffler.io';

const REGION_RE = /^(?:[a-z]{2,3}\d?|frankfurt|california|australia|eu-2)$/;

const CANONICAL_REGION_SUBDOMAIN: Record<string, string> = {
  uk: 'uk',
  gb: 'uk',
  eu: 'uk',
  frankfurt: 'frankfurt',
  'eu-2': 'frankfurt',
  eu2: 'frankfurt',
  california: 'california',
  us: 'california',
  ca: 'ca',
  au: 'au',
  aus: 'au',
  australia: 'au',
};

/** Region label (uk, frankfurt, california, ca, au) from a host like frankfurt.shuffler.io or frankfurt.shuffle.security. */
export const regionFromHost = (host?: string | null): string | null => {
  if (!host) return null;
  const h = host.toLowerCase().split(':')[0];
  const m = h.match(/^([a-z0-9-]+)\.(shuffler\.io|shuffle\.security)$/);
  if (!m || m[1] === 'www' || m[1] === 'security') return null;
  if (!REGION_RE.test(m[1])) return null;
  return CANONICAL_REGION_SUBDOMAIN[m[1]] || m[1];
};

export const regionFromUrl = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    return regionFromHost(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname);
  } catch {
    return null;
  }
};

export const backendForRegion = (region?: string | null): string => {
  if (!region) return DEFAULT_BACKEND;
  const r = region.toLowerCase();
  if (!REGION_RE.test(r)) return DEFAULT_BACKEND;
  const sub = CANONICAL_REGION_SUBDOMAIN[r] || r;
  return `https://${sub}.shuffler.io`;
};

/** Decode an OpenID `state` value (base64 of "org=..&challenge=..&redirect=.."). */
export const decodeOpenIdState = (state?: string | null): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!state) return out;
  let text = state;
  try {
    const b64 = state.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    if (decoded.includes('=')) text = decoded;
  } catch {
    // Not base64 - parse as-is.
  }
  for (const part of text.split('&')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
};

/** Store the active tenant's region so the /api/v* redirect can follow it. */
export const setRegionCookie = (regionUrl?: string | null): void => {
  if (typeof document === 'undefined') return;
  const region = regionFromUrl(regionUrl);
  try {
    if (region) {
      document.cookie = `${REGION_COOKIE}=${region}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    }
  } catch {
    // Cookies blocked - redirect falls back to the default host.
  }
};
