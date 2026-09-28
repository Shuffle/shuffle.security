/**
 * API Configuration
 * 
 * Configure the base URL based on your deployment:
 * - Shuffle Cloud (EU): https://shuffler.io
 * - Shuffle Cloud (US): https://us.shuffler.io  
 * - Self-hosted: Your own backend URL (e.g., https://shuffle.yourdomain.com)
 *
 * The region URL is dynamically resolved from /api/v1/getinfo's `region_url` field.
 * If the user switches orgs, it resets to the default until getinfo is called again.
 */

import { installFetchBreaker, registerProtectedOrigin } from '@/Shuffle-MCPs/fetchBreaker';

// Install the global fetch breaker as soon as api.ts is imported. Idempotent —
// safe to call multiple times.
installFetchBreaker();

const DEV_BACKEND = 'https://tunnel.schemaless.org';
const PROD_BACKEND = 'https://uk.shuffle.security';

import {
  getShuffleCoreBaseUrl,
  getShuffleCoreUrl,
  getShuffleCoreWorkflowUrl,
  getShuffleSecurityBaseUrl,
  getShuffleSecurityUrl,
} from '@/lib/shuffleUrls';

export {
  getShuffleCoreBaseUrl,
  getShuffleCoreUrl,
  getShuffleCoreWorkflowUrl,
  getShuffleSecurityBaseUrl,
  getShuffleSecurityUrl,
};

// Base URL for Shuffle Automation dashboard (used in tool switcher)
export const SHUFFLE_AUTOMATION_URL = getShuffleCoreUrl('/new-dashboard');

// Known cloud domains that should always use shuffle.security as the default backend
const CLOUD_DOMAINS = [
  'shuffle.security',
  'www.shuffle.security',
  'uk.shuffle.security',
  'security.shuffler.io',
  'shuffler.io',
  'shutdown.no',
  'www.shutdown.no',
];

/** Check if a URL belongs to a Shuffle Cloud domain (*.shuffler.io or *.shuffle.security) */
export const isShuffleCloudDomain = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  try {
    const raw = url.trim();
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'shuffler.io' ||
      host.endsWith('.shuffler.io') ||
      host === 'shuffle.security' ||
      host.endsWith('.shuffle.security')
    );
  } catch {
    return false;
  }
};

/**
 * Maps legacy shuffler.io cloud URLs to shuffle.security redirect routes.
 *
 * Mapping rules:
 * - shuffler.io / shuffle.security -> https://uk.shuffle.security (default cloud backend)
 * - <subdomain>.shuffler.io -> https://<subdomain>.shuffle.security (e.g. ca, us, eu, au, uk, frankfurt)
 * - <subdomain>.shuffle.security -> preserved as https://<subdomain>.shuffle.security
 * - Self-hosted / on-prem / dev URLs -> preserved as-is
 */
export const mapCloudRegionUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
  const toParse = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(toParse);
    const hostname = parsed.hostname.toLowerCase();

    // 1. Exact match for base domains without region subdomain
    if (
      hostname === 'shuffler.io' ||
      hostname === 'www.shuffler.io' ||
      hostname === 'shuffle.security' ||
      hostname === 'www.shuffle.security'
    ) {
      parsed.protocol = 'https:';
      parsed.hostname = 'uk.shuffle.security';
      return parsed.toString().replace(/\/+$/, '');
    }

    // 2. Subdomains of shuffler.io (e.g. ca.shuffler.io, us.shuffler.io, eu.shuffler.io, au.shuffler.io, uk.shuffler.io)
    // Directly map the subdomain: <subdomain>.shuffler.io -> <subdomain>.shuffle.security
    if (hostname.endsWith('.shuffler.io')) {
      const subdomain = hostname.slice(0, -'.shuffler.io'.length);
      parsed.protocol = 'https:';
      parsed.hostname = `${subdomain}.shuffle.security`;
      return parsed.toString().replace(/\/+$/, '');
    }

    // 3. Subdomains of shuffle.security (e.g. ca.shuffle.security, us.shuffle.security)
    if (hostname.endsWith('.shuffle.security')) {
      parsed.protocol = 'https:';
      return parsed.toString().replace(/\/+$/, '');
    }

    // Self-hosted / on-prem / dev URLs remain unchanged
    return trimmed.replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
};

// Safely read Vite-style env vars without depending on `vite/client` types
// (the published library should not require Vite to be installed).
const getEnvVar = (key: string): string | undefined => {
  // Indirect access via `new Function` keeps `import.meta` out of the emitted
  // CJS bundle. tsup otherwise inlines it verbatim into `dist/index.js`, which
  // breaks consumers whose webpack rolls the CJS build into a non-ESM bundle
  // ("Cannot use 'import.meta' outside a module").
  try {
    const meta = (new Function('try { return import.meta } catch { return undefined }')()) as
      | { env?: Record<string, string | undefined> }
      | undefined;
    return meta?.env?.[key];
  } catch {
    return undefined;
  }
};

// Determine if we're in Lovable preview (dev) or published (prod)
export const isDevEnvironment = (): boolean => {
  if (getEnvVar('VITE_SHUFFLE_API_URL')) return false;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  // Every Lovable-hosted host (sandbox, id-preview--, preview--, and the
  // published *.lovable.app site) is a testing environment and must talk to
  // the dev backend, never to its own origin.
  return hostname.includes('lovableproject.com')
    || hostname.includes('id-preview--')
    || hostname.endsWith('.lovable.app')
    || hostname.endsWith('.lovable.dev');
};

import {
  getPlatform,
  isCapacitorNative,
  isIos,
  isAndroid,
  isWeb,
  isIosWebView,
  isAndroidWebView,
  getDeviceDiagnostics,
} from '@/lib/platform';

export {
  getPlatform,
  isCapacitorNative,
  isIos,
  isAndroid,
  isWeb,
  isIosWebView,
  isAndroidWebView,
  getDeviceDiagnostics,
};

/** Check if running on a known Shuffle Cloud domain */
export const isCloudDomain = (): boolean => {
  if (isCapacitorNative()) {
    if (getHostBaseUrl()) return false;
    return true;
  }
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return (
    CLOUD_DOMAINS.includes(hostname) ||
    hostname.endsWith('.shuffle.security') ||
    hostname.endsWith('.shuffler.io')
  );
};

/**
 * True when running on Shuffle Cloud (a known *.shuffler.io / shutdown.no domain).
 * Use this to gate cloud-only features like Google Analytics (ReactGA).
 *
 * isCloud()  → cloud deployment, GA allowed, telemetry OK
 * !isCloud() → either Lovable preview (dev) OR self-hosted onprem; do NOT call GA
 */
export const isCloud = (): boolean => isCloudDomain();

/**
 * True when running self-hosted (onprem) — i.e. NOT in Lovable preview AND NOT on a known cloud domain.
 */
export const isOnprem = (): boolean => !isDevEnvironment() && !isCloudDomain();

export const getDefaultBaseUrl = (): string => {
  const envUrl = getEnvVar('VITE_SHUFFLE_API_URL');
  if (envUrl) {
    return envUrl;
  }
  if (isDevEnvironment()) return DEV_BACKEND;
  if (isCapacitorNative()) {
    const customHost = getHostBaseUrl();
    if (customHost) return customHost;
    return PROD_BACKEND;
  }
  // Cloud domains always default to uk.shuffle.security; region_url from getinfo may override later
  if (isCloudDomain()) return PROD_BACKEND;
  // Self-hosted / on-prem: use current domain (nginx proxies /api/* to backend)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return PROD_BACKEND;
};

// Dynamic region URL state (only applies in production, not dev)
const REGION_STORAGE_KEY = 'shuffle_region_url';

/** Read the cached region URL (persisted per org) so the very first request
 *  after a reload already targets the right region — no waiting for getinfo. */
const readCachedRegion = (): { url: string | null; orgId: string | null } => {
  if (typeof window === 'undefined') return { url: null, orgId: null };
  try {
    const raw = localStorage.getItem(REGION_STORAGE_KEY);
    if (!raw) return { url: null, orgId: null };
    const parsed = JSON.parse(raw);
    const rawUrl = parsed?.url ? parsed.url.replace(/\/+$/, '') : null;
    if (!rawUrl) return { url: null, orgId: parsed?.orgId || null };
    const mapped = mapCloudRegionUrl(rawUrl);
    if (
      mapped === 'https://shuffler.io' ||
      mapped === 'https://uk.shuffler.io' ||
      mapped === 'https://shuffle.security' ||
      mapped === 'https://uk.shuffle.security' ||
      mapped === PROD_BACKEND
    ) {
      return { url: null, orgId: parsed?.orgId || null };
    }
    return { url: mapped, orgId: parsed?.orgId || null };
  } catch {
    return { url: null, orgId: null };
  }
};

const cached = readCachedRegion();
let _regionUrl: string | null = cached.url;
export const getRegionUrl = (): string | null => _regionUrl;
const readCachedCustomHost = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const mode = localStorage.getItem('shuffle_selected_server_mode');
    if (mode && mode !== 'self-hosted') return null;
    const raw = localStorage.getItem('shuffle_custom_host_url');
    const cleaned = raw ? raw.trim().replace(/\/+$/, '') : null;
    if (!cleaned) {
      // If accessed via localhost / 127.0.0.1 frontend and not in cloud mode,
      // default backend instance URL is http://localhost:5001
      const host = window.location.hostname.toLowerCase();
      if ((host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')) && mode !== 'cloud') {
        return 'http://localhost:5001';
      }
      return null;
    }
    // A cloud domain must never be saved as a self-hosted custom host base URL
    if (isShuffleCloudDomain(cleaned)) {
      try {
        localStorage.removeItem('shuffle_custom_host_url');
        if (mode === 'self-hosted') {
          localStorage.setItem('shuffle_selected_server_mode', 'cloud');
        }
      } catch { /* ignore */ }
      return null;
    }
    // A saved dev/test backend must never leak into a real deployment UNLESS
    // the user explicitly picked it as their self-hosted server.
    if (cleaned === DEV_BACKEND && !isDevEnvironment() && mode !== 'self-hosted') {
      try {
        localStorage.removeItem('shuffle_custom_host_url');
        localStorage.removeItem('shuffle_selected_server_mode');
      } catch { /* ignore */ }
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
};

let _trackedOrgId: string | null = cached.orgId;
// Host-injected base URL (set via setHostBaseUrl or from saved custom host).
// Highest priority — overrides region URL and the auto-detected default.
let _hostBaseUrl: string | null = readCachedCustomHost();

const REGION_EVENT = 'shuffle:region-url';
let _lastBroadcastUrl: string | null = cached.url;

const persistRegion = (url: string | null, orgId: string | null) => {
  if (typeof window === 'undefined') return;
  const changed = url !== _lastBroadcastUrl;
  _lastBroadcastUrl = url;
  try {
    if (url) localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify({ url, orgId }));
    else localStorage.removeItem(REGION_STORAGE_KEY);
  } catch { /* ignore */ }
  // Broadcast only when the URL itself changed, so the other api module
  // (Shuffle-Core) and other tabs stay in sync without redundant events.
  if (!changed) return;
  try { window.dispatchEvent(new CustomEvent(REGION_EVENT, { detail: { url, orgId } })); } catch { /* ignore */ }
};

// Keep this module in sync when the region is set from the other api module
// (or another tab). Without this, half the app keeps hitting shuffler.io.
if (typeof window !== 'undefined') {
  const sync = () => {
    const next = readCachedRegion();
    if (next.url !== _regionUrl) {
      _regionUrl = next.url;
      _lastBroadcastUrl = next.url;
      console.log(`[API] Region URL synced to: ${_regionUrl || 'default'}`);
    }
    _trackedOrgId = next.orgId;
  };
  window.addEventListener(REGION_EVENT, sync);
  window.addEventListener('storage', (e) => {
    if (e.key === REGION_STORAGE_KEY) sync();
  });
}


/** Check if a URL is a valid shuffler.io or shuffle.security subdomain */
const isShufflerSubdomain = (url: string): boolean => {
  return isShuffleCloudDomain(url);
};

/**
 * Set the dynamic region URL from getinfo response.
 * Honored for the current org/tenant when different from the default backend.
 * Automatically maps cloud subdomains to .shuffle.security while preserving self-hosted hosts.
 * Persisted in localStorage so later page loads do not have to wait on getinfo.
 */
export const setRegionUrl = (regionUrl: string | undefined | null, orgId: string | undefined | null) => {
  _trackedOrgId = orgId || null;

  if (regionUrl) {
    const isSelfHosted = !isCloudDomain() || Boolean(_hostBaseUrl);
    if (isShuffleCloudDomain(regionUrl)) {
      if (isSelfHosted) {
        // Self-hosted deployments must not have cloud region overrides
        _regionUrl = null;
        persistRegion(null, _trackedOrgId);
        return;
      }
      const mapped = mapCloudRegionUrl(regionUrl);
      const normalized = mapped.replace(/\/+$/, '');
      const isDefaultCloud =
        normalized === PROD_BACKEND ||
        normalized === 'https://shuffler.io' ||
        normalized === 'https://uk.shuffler.io' ||
        normalized === 'https://shuffle.security' ||
        normalized === 'https://uk.shuffle.security';
      if (!isDefaultCloud) {
        _regionUrl = normalized;
        persistRegion(_regionUrl, _trackedOrgId);
        console.log(`[API] Region URL set to: ${_regionUrl}`);
        return;
      }
    } else {
      // Non-cloud region URL (e.g. custom host per tenant on-prem)
      _regionUrl = regionUrl.replace(/\/+$/, '');
      persistRegion(_regionUrl, _trackedOrgId);
      return;
    }
  }

  // No valid region override — use default
  _regionUrl = null;
  persistRegion(null, _trackedOrgId);
};

/**
 * Single entry point for applying a region from ANY backend response that
 * carries one (`/api/v1/getinfo`, `/api/v1/orgs/{id}/change`, ...). Extracts
 * `region_url` (top-level first, then `active_org`) and routes it through
 * `setRegionUrl`, so setting + broadcasting always happens in one place.
 */
export const applyRegionFromPayload = (
  payload: any,
  orgIdOverride?: string | null,
): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const orgId = orgIdOverride ?? payload?.active_org?.id ?? payload?.org_id ?? null;
  const rawRegionUrl = payload?.region_url || payload?.active_org?.region_url || null;
  const regionUrl = rawRegionUrl ? mapCloudRegionUrl(rawRegionUrl) : null;
  setRegionUrl(regionUrl, orgId);
  return regionUrl;
};

/**
 * Called when org changes. Resets region URL to default until next getinfo.
 */
export const resetRegionUrl = () => {
  if (_regionUrl) {
    console.log(`[API] Region URL reset to default (org changed)`);
  }
  _regionUrl = null;
  persistRegion(null, null);
};


/**
 * Host override — call from a top-level component (or `useSyncHostBaseUrl`)
 * with the `globalUrl` injected via `ShuffleHostProps`. When set, this beats
 * region URL and the env-based default for ALL fetches that go through
 * `getApiUrl()` / `API_CONFIG.baseUrl` / `shuffleFetch`.
 *
 * Pass `null` / `undefined` / empty string to clear the override.
 */
const SHUFFLE_HOST_BASE_URL_EVENT = 'shuffle:set-host-base-url';

export const setHostBaseUrl = (url: string | undefined | null) => {
  const next = url ? url.replace(/\/+$/, '') : null;
  if (next === _hostBaseUrl) return;
  _hostBaseUrl = next;
  if (next) {
    try { registerProtectedOrigin(next); } catch { /* noop */ }
  }
  // Cross-broadcast so sibling Shuffle packages (e.g. Shuffle-Core) that hold
  // their own copy of api.ts pick up the same host override. The early-return
  // above guarantees the listener loop terminates.
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(SHUFFLE_HOST_BASE_URL_EVENT, { detail: next }));
    } catch { /* noop */ }
  }
};

if (typeof window !== 'undefined') {
  try {
    window.addEventListener(SHUFFLE_HOST_BASE_URL_EVENT, (e: Event) => {
      const detail = (e as CustomEvent).detail as string | null | undefined;
      setHostBaseUrl(detail ?? null);
    });
  } catch { /* noop */ }
}

/** Get the currently active host override, if any. */
export const getHostBaseUrl = (): string | null => _hostBaseUrl;


/** Get the currently tracked org ID */
export const getTrackedOrgId = (): string | null => _trackedOrgId;

/**
 * Single source of truth for browser auth.
 *
 * Order of precedence:
 *  1. Session cookie (sent automatically via `credentials: 'include'`).
 *  2. A single session token in localStorage (mobile apps / Lovable testing).
 *
 * Never more than one token at a time. Legacy `shuffle_api_key` storage is
 * purged on every read/write.
 */
export const LEGACY_API_KEY_STORAGE_KEY = 'shuffle_api_key';

export const clearAuthTokens = () => {
  try {
    localStorage.removeItem('session_token');
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
  } catch { /* ignore */ }
};

export const getSessionToken = (): string | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY) !== null) {
      localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
    }
    const stored = localStorage.getItem('session_token');
    if (
      stored &&
      stored.trim().length > 0 &&
      stored !== 'null' &&
      stored !== 'undefined' &&
      stored !== 'authenticated' &&
      stored !== 'session' &&
      stored !== 'cookie-session'
    ) {
      return stored.trim();
    }
    if (stored === 'authenticated' || stored === 'session' || stored === 'cookie-session') {
      localStorage.removeItem('session_token');
    }
    return null;
  } catch { return null; }
};

export const setSessionToken = (token: string | null) => {
  // Always wipe everything first so we can never end up with two tokens.
  clearAuthTokens();
  if (
    token &&
    token.trim().length > 0 &&
    token !== 'authenticated' &&
    token !== 'session' &&
    token !== 'cookie-session' &&
    token !== 'null' &&
    token !== 'undefined'
  ) {
    try { localStorage.setItem('session_token', token.trim()); } catch { /* ignore */ }
  }
};

export const isOnShuffleSecurity = (): boolean => {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'shuffle.security' ||
    host.endsWith('.shuffle.security') ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.includes('lovable')
  );
};

/**
 * Checks whether the active backend is on *.shuffle.security (or shuffle.security),
 * or if the frontend is hosted on *.shuffle.security.
 */
export const isShuffleSecurityBackend = (backendUrl?: string): boolean => {
  try {
    const backend = backendUrl || API_CONFIG.baseUrl || '';
    if (backend) {
      const parsed = new URL(backend.includes('://') ? backend : `https://${backend}`);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'shuffle.security' ||
        host.endsWith('.shuffle.security') ||
        host === 'shuffler.io' ||
        host.endsWith('.shuffler.io')
      ) {
        return true;
      }
    }
  } catch { /* ignore */ }

  if (typeof window !== 'undefined') {
    try {
      const windowHost = window.location.hostname.toLowerCase();
      if (
        windowHost === 'shuffle.security' ||
        windowHost.endsWith('.shuffle.security') ||
        windowHost === 'shuffler.io' ||
        windowHost.endsWith('.shuffler.io')
      ) {
        return true;
      }
    } catch { /* ignore */ }
  }

  return false;
};

export const ensureShuffleSecurityApiUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return url;
  if (!isOnShuffleSecurity()) return url;
  return mapCloudRegionUrl(url) || url;
};

/**
 * Checks whether the backend is hosted on a different domain or subdomain
 * from the frontend.
 *
 * If the backend is on the same domain or subdomain (e.g. uk.shuffle.security
 * and shuffle.security), standard browser session cookies work via credentials: 'include'.
 * If the backend is on a completely different domain (e.g. self-hosted instance,
 * tunnel.schemaless.org, or Lovable preview -> onprem), third-party cookies are
 * blocked by browsers, so the session token must be sent via Authorization: Bearer.
 */
export const isCrossDomainBackend = (targetUrl?: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const backendUrl = targetUrl || API_CONFIG.baseUrl;
    if (!backendUrl) return false;
    const backendHost = new URL(backendUrl, window.location.origin).hostname.toLowerCase();
    const frontendHost = window.location.hostname.toLowerCase();

    if (backendHost === frontendHost) return false;

    // Both on localhost or local loopback
    const isLocalFrontend = frontendHost === 'localhost' || frontendHost === '127.0.0.1';
    const isLocalBackend = backendHost === 'localhost' || backendHost === '127.0.0.1';
    if (isLocalFrontend && isLocalBackend) return false;

    // Extract root domain (e.g. shuffle.security from uk.shuffle.security)
    const getRootDomain = (host: string): string => {
      const parts = host.split('.');
      if (parts.length <= 2) return host;
      return parts.slice(-2).join('.');
    };

    const frontendRoot = getRootDomain(frontendHost);
    const backendRoot = getRootDomain(backendHost);

    // If both belong to the same root domain, browser cookies will work across subdomains
    if (frontendRoot && backendRoot && frontendRoot === backendRoot) {
      return false;
    }

    // Different domains
    return true;
  } catch {
    return false;
  }
};

export const API_CONFIG = {
  // Shuffle backend URL — host override beats region URL beats default.
  get baseUrl(): string {
    // In test/dev environments (Lovable preview, VITE_SHUFFLE_API_URL) the
    // test backend always wins — region_url must not redirect us to prod.
    const url = _hostBaseUrl || (isDevEnvironment() || getEnvVar('VITE_SHUFFLE_API_URL') ? getDefaultBaseUrl() : (_regionUrl || getDefaultBaseUrl()));
    // Register origin once so the breaker watches it. registerProtectedOrigin
    // is idempotent.
    try { registerProtectedOrigin(url); } catch { /* noop */ }
    return url;
  },
  
  // API version
  version: 'v1',
  
  /**
   * DEPRECATED alias for the single session token. There is no separate
   * API-key auth any more: exactly one session token may exist at a time.
   */
  get apiKey(): string | null {
    return getSessionToken();
  },

  /** DEPRECATED: writes/clears the single session token. */
  setApiKey(key: string | null) {
    setSessionToken(key);
  },
};

// Computed API endpoint - pass full path including /api/v1 or /api/v2
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.baseUrl}${endpoint}`;
};

/**
 * Resolve an agent approval / form URL (typically `/forms/{id}`) to the
 * original Shuffle Core where the form actually lives. On Cloud this is
 * always https://shuffler.io (regardless of the active region URL — forms
 * are served from core), and onprem / dev fall back to the configured
 * backend baseUrl. Absolute URLs are returned unchanged.
 */
export const getShuffleCoreFormUrl = (refUrl: string): string => {
  if (!refUrl) return refUrl;
  // Already absolute — trust it.
  if (/^https?:\/\//i.test(refUrl)) return refUrl;
  const path = refUrl.startsWith('/') ? refUrl : `/${refUrl}`;
  return getShuffleCoreUrl(path);
};

/** True when a notification.reference_url points at an agent approval form. */
export const isAgentApprovalFormUrl = (refUrl: string | undefined | null): boolean => {
  if (!refUrl) return false;
  try {
    // Strip an optional origin so we can match the path consistently.
    const path = /^https?:\/\//i.test(refUrl) ? new URL(refUrl).pathname : refUrl;
    return /^\/forms\/[^/?#]+/.test(path);
  } catch {
    return false;
  }
};

/**
 * Central fetch wrapper that ALWAYS includes credentials and auth headers.
 * Use this instead of raw fetch() for all Shuffle API calls.
 */
export const shuffleFetch = (url: string, init?: RequestInit): Promise<Response> => {
  const { headers: extraHeaders, ...rest } = init || {};
  return fetch(url, {
    credentials: 'include',
    ...rest,
    headers: {
      ...getAuthHeader(),
      ...extraHeaders,
    },
  });
};

// Common endpoints
export const API_ENDPOINTS = {
  login: '/api/v1/login',
  checkusers: '/api/v1/checkusers',
  register: '/api/v1/users/register',
  registerAdmin: '/api/v1/register',
  logout: '/api/v1/logout',
  me: '/api/v1/me',
  getinfo: '/api/v1/getinfo',
  alerts: '/api/v1/alerts',
  cases: '/api/v1/cases',
  workflows: '/api/v1/workflows',
  apps: '/api/v1/apps',
  passwordResetMail: '/api/v1/users/passwordresetmail',
  passwordReset: '/api/v1/users/passwordreset',
};

export const getAuthHeader = (overrideOrgId?: string | null): Record<string, string> => {
  const headers: Record<string, string> = {};

  // Normal cookie login is the primary authentication method when the frontend
  // and backend share the same domain or subdomain.
  // Authorization: Bearer is used if cookies are unavailable (e.g. cross-domain
  // backend connection, Capacitor native app, or explicit bearer fallback mode).
  const authMode = typeof localStorage !== 'undefined' ? localStorage.getItem('shuffle_auth_mode') : null;
  const token = getSessionToken();
  if (token && (authMode === 'bearer' || isCapacitorNative() || isCrossDomainBackend())) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Scope to the active org. Explicit override beats the tracked org, falling
  // back to the persisted active_org from shuffle_user_info if untracked.
  let orgId = overrideOrgId ?? _trackedOrgId;
  if (!orgId && typeof localStorage !== 'undefined') {
    try {
      const raw =
        localStorage.getItem('shuffle_user_info') ||
        localStorage.getItem('userinfo') ||
        localStorage.getItem('user_info');
      if (raw) {
        const parsed = JSON.parse(raw);
        orgId =
          parsed?.active_org?.id ||
          parsed?.org_id ||
          parsed?.active_org_id ||
          (parsed?.orgs && parsed.orgs[0]?.id) ||
          null;
      }
    } catch { /* ignore */ }
  }

  if (orgId) {
    headers['Org-Id'] = orgId;
  }

  return headers;
};

/** Session validation headers intentionally omit any cached organization. */
export const getSessionAuthHeader = (): Record<string, string> => {
  const authMode = typeof localStorage !== 'undefined' ? localStorage.getItem('shuffle_auth_mode') : null;
  const token = getSessionToken();
  if (token && (authMode === 'bearer' || isCapacitorNative() || isCrossDomainBackend())) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};


/**
 * True when the browser has some form of Shuffle auth available: either the
 * API key entered on the login page (`shuffle_api_key`) or a session from a
 * previous login. Pollers (workflows, notifications, ...) must check this
 * before firing, otherwise they hammer the backend with unauthenticated
 * requests that all come back 401 — most visibly on the login page.
 */
export const hasShuffleAuth = (): boolean => {
  try {
    if (getSessionToken()) return true;
    const info = localStorage.getItem('shuffle_user_info');
    if (info && info.trim().length > 0 && info !== 'null' && info !== 'undefined') return true;
    return false;
  } catch {
    return false;
  }
};
