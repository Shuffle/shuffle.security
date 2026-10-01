/**
 * Shared fetch and module-level memory cache for apps and integrations in Usecases.
 * Coalesces in-flight requests, preserves parsed results across drawer opens/closes,
 * and eliminates layout shifts and loading flashes.
 */

export interface IntegrationItem {
  id: string;
  name: string;
  icon: string;
  /** Validated (tested) — highest priority */
  validated: boolean;
  /** Active auth entry */
  active: boolean;
}

export interface AlluvialCache {
  allApps: any[];
  ingestAppNames: Set<string>;
  vulnAppNames?: Set<string>;
  forwardAppNames: Set<string>;
  webhookInfo: { url: string | null; exists: boolean; enabled: boolean; workflowId: string | null };
  ts: number;
}

const APPS_TTL_MS = 60_000;
const JSON_CACHE_TTL_MS = 120_000; // 2 minutes general
const ENVIRONMENTS_TTL_MS = 120_000; // 2 minutes
const WORKFLOWS_TTL_MS = 5 * 60 * 1000; // 5 minutes

const _jsonCache = new Map<string, { ts: number; data: any }>();
const _inFlightPromises = new Map<string, Promise<any>>();

/**
 * Normalizes URL and Org-Id header into a uniform cache key so relative,
 * absolute, and host-differing URLs (e.g. apiUrl vs getApiUrl) share the
 * exact same in-flight Promise and in-memory cache.
 */
export function normalizeEndpointKey(url: string, init?: RequestInit): string {
  let pathname = url;
  let search = '';
  try {
    const parsed = new URL(url, 'https://shuffle.internal');
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    // keep raw url if parse fails
  }
  let orgId = '';
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      orgId = init.headers.get('Org-Id') || '';
    } else if (Array.isArray(init.headers)) {
      const match = init.headers.find(([k]) => k.toLowerCase() === 'org-id');
      if (match) orgId = match[1];
    } else if (typeof init.headers === 'object') {
      orgId = (init.headers as any)['Org-Id'] || (init.headers as any)['org-id'] || '';
    }
  }
  return `${pathname}${search}${orgId ? `::org:${orgId}` : ''}`;
}

/**
 * Request-coalescing in-memory JSON fetcher.
 * Guarantees that concurrent calls to the exact same normalized endpoint
 * join the same Promise, and subsequent calls within TTL read directly
 * from memory with 0 network overhead.
 */
export async function fetchJsonCached<T = any>(
  url: string,
  init?: RequestInit,
  ttlMs: number = JSON_CACHE_TTL_MS,
  force: boolean = false,
): Promise<T> {
  const cacheKey = normalizeEndpointKey(url, init);
  const now = Date.now();
  if (!force) {
    const cached = _jsonCache.get(cacheKey);
    if (cached && now - cached.ts < ttlMs) {
      return cached.data as T;
    }
    const inFlight = _inFlightPromises.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const p = (async () => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const prev = _jsonCache.get(cacheKey);
        if (prev) return prev.data as T;
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      _jsonCache.set(cacheKey, { ts: Date.now(), data });
      return data as T;
    } finally {
      _inFlightPromises.delete(cacheKey);
    }
  })();

  _inFlightPromises.set(cacheKey, p);
  return p;
}

/**
 * Drop-in backwards compatible wrapper for fetchAppsCached that returns a safe,
 * unconsumed Response instance populated from the cached JSON data.
 */
export async function fetchAppsCached(url: string, init?: RequestInit): Promise<Response> {
  const data = await fetchJsonCached(url, init, APPS_TTL_MS);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Cached environments fetcher with request coalescing and 2-minute memory cache.
 */
export async function fetchEnvironmentsCached(
  url: string,
  init?: RequestInit,
  force = false,
): Promise<any> {
  return fetchJsonCached(url, init, ENVIRONMENTS_TTL_MS, force);
}

// Module-level workflows cache
let _workflowsCache: any[] | null = null;
let _workflowsCacheTs = 0;

export function invalidateWorkflowsCache() {
  _workflowsCache = null;
  _workflowsCacheTs = 0;
  for (const key of _jsonCache.keys()) {
    if (key.includes('/api/v1/workflows')) {
      _jsonCache.delete(key);
    }
  }
}

export function getCachedWorkflows(): any[] | null {
  if (_workflowsCache && Date.now() - _workflowsCacheTs < WORKFLOWS_TTL_MS) {
    return _workflowsCache;
  }
  return _workflowsCache;
}

export function setCachedWorkflows(list: any[]) {
  _workflowsCache = list;
  _workflowsCacheTs = Date.now();
}

export async function fetchWorkflowsCached(
  url: string,
  init?: RequestInit,
  force = false,
): Promise<any[]> {
  try {
    if (force) {
      invalidateWorkflowsCache();
    }
    const data = await fetchJsonCached(url, init, WORKFLOWS_TTL_MS, force);
    const list = Array.isArray(data) ? data : (data?.workflows || []);
    _workflowsCache = list;
    _workflowsCacheTs = Date.now();
    return list;
  } catch {
    return _workflowsCache || [];
  }
}

/**
 * Fetch a single workflow by ID.
 * If the workflow is already present in _workflowsCache with actions/triggers,
 * returns it immediately with 0 network requests.
 */
export async function fetchWorkflowByIdCached(
  url: string,
  wfId: string,
  init?: RequestInit,
): Promise<any | null> {
  if (_workflowsCache && _workflowsCache.length > 0) {
    const existing = _workflowsCache.find((w: any) => w.id === wfId);
    if (existing && (existing.actions?.length || existing.triggers?.length)) {
      return existing;
    }
  }
  return fetchJsonCached(url, init, WORKFLOWS_TTL_MS);
}

/**
 * Cached org defaults / settings (e.g. notification workflow ID).
 */
export async function fetchOrgCached(url: string, init?: RequestInit): Promise<any> {
  return fetchJsonCached(url, init, WORKFLOWS_TTL_MS);
}

/**
 * Cached category automations (e.g. AI Agent on shuffle-security_incidents).
 */
export async function fetchCategoryAutomationsCached(url: string, init?: RequestInit): Promise<any> {
  return fetchJsonCached(url, init, JSON_CACHE_TTL_MS);
}

// Module-level parsed in-memory caches
let _cachedIntegrations: IntegrationItem[] | null = null;
let _cachedCatalogIcons: Record<string, string> = {};
let _cachedCategoryAppNames: Record<string, string[]> | null = null;
let _cachedValidatedAppsByCategory: Record<string, Array<{ name: string; icon: string }>> | null = null;
let _cachedValidatedCategories: Set<string> | null = null;
let _cachedValidatedAppNames: Set<string> | null = null;
let _alluvialCache: AlluvialCache | null = null;
export const _algoliaIconCache = new Map<string, string>();

export function getCachedIntegrations(): IntegrationItem[] | null {
  return _cachedIntegrations;
}
export function setCachedIntegrations(items: IntegrationItem[]) {
  _cachedIntegrations = items;
}

export function getCachedCatalogIcons(): Record<string, string> {
  return _cachedCatalogIcons;
}
export function updateCachedCatalogIcons(icons: Record<string, string>) {
  Object.assign(_cachedCatalogIcons, icons);
}

export function getCachedCategoryAppNames(): Record<string, string[]> | null {
  return _cachedCategoryAppNames;
}
export function setCachedCategoryAppNames(val: Record<string, string[]>) {
  _cachedCategoryAppNames = val;
}

export function getCachedValidatedAppsByCategory(): Record<string, Array<{ name: string; icon: string }>> | null {
  return _cachedValidatedAppsByCategory;
}
export function setCachedValidatedAppsByCategory(val: Record<string, Array<{ name: string; icon: string }>>) {
  _cachedValidatedAppsByCategory = val;
}

export function getCachedValidatedCategories(): Set<string> | null {
  return _cachedValidatedCategories;
}
export function setCachedValidatedCategories(val: Set<string>) {
  _cachedValidatedCategories = val;
}

export function getCachedValidatedAppNames(): Set<string> | null {
  return _cachedValidatedAppNames;
}
export function setCachedValidatedAppNames(val: Set<string>) {
  _cachedValidatedAppNames = val;
}

export function getAlluvialCache(): AlluvialCache | null {
  return _alluvialCache;
}
export function setAlluvialCache(cache: AlluvialCache) {
  _alluvialCache = cache;
}
export function updateAlluvialIngest(appName: string, enabled: boolean, normalizeAppName: (n: string) => string) {
  if (!_alluvialCache) return;
  const next = new Set(_alluvialCache.ingestAppNames);
  const norm = normalizeAppName(appName);
  if (enabled) next.add(norm); else next.delete(norm);
  _alluvialCache.ingestAppNames = next;
  _alluvialCache.ts = Date.now();
}
export function updateAlluvialVuln(appName: string, enabled: boolean, normalizeAppName: (n: string) => string) {
  if (!_alluvialCache) return;
  const next = new Set(_alluvialCache.vulnAppNames || []);
  const norm = normalizeAppName(appName);
  if (enabled) next.add(norm); else next.delete(norm);
  _alluvialCache.vulnAppNames = next;
  _alluvialCache.ts = Date.now();
}
export function updateAlluvialForward(desiredAppNames: string[], normalizeAppName: (n: string) => string) {
  if (!_alluvialCache) return;
  _alluvialCache.forwardAppNames = new Set(desiredAppNames.map(normalizeAppName));
  _alluvialCache.ts = Date.now();
}
export function invalidateAlluvialCache() {
  _alluvialCache = null;
}

export function invalidateAuthCache() {
  for (const key of _jsonCache.keys()) {
    if (key.includes('/api/v1/apps/authentication')) {
      _jsonCache.delete(key);
    }
  }
  for (const key of _inFlightPromises.keys()) {
    if (key.includes('/api/v1/apps/authentication')) {
      _inFlightPromises.delete(key);
    }
  }
}

export function invalidateAppsCache() {
  _jsonCache.clear();
  _inFlightPromises.clear();
  _workflowsCache = null;
  _cachedIntegrations = null;
  _cachedCatalogIcons = {};
  _cachedCategoryAppNames = null;
  _cachedValidatedAppsByCategory = null;
  _cachedValidatedCategories = null;
  _cachedValidatedAppNames = null;
  _alluvialCache = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('shuffle-apps-invalidated'));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('shuffle-auth-invalidated', () => invalidateAuthCache());
}

