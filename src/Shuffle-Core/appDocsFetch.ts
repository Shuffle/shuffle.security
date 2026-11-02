import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export type AppDocLocation = 'python' | 'openapi';

export interface AppDocContributor {
  name?: string;
  url?: string;
  image?: string;
}

export interface AppDocMeta {
  name?: string;
  contributors?: AppDocContributor[];
  edited?: string;
  read_time?: number;
  link?: string;
}

export interface AppDocResult {
  markdown: string;
  meta?: AppDocMeta;
  location: AppDocLocation;
  version?: string;
  updatedAt: number;
}

interface StoredAppDocEntry {
  found: boolean;
  markdown: string;
  meta?: AppDocMeta;
  location: AppDocLocation;
  version?: string;
  updatedAt: number;
}

const STORAGE_PREFIX = 'shuffle_app_doc_v1:';
const POSITIVE_TTL_MS = 60 * 60 * 1000; // 1 hour fresh window (serves stale immediately while revalidating)
const NEGATIVE_TTL_MS = 10 * 60 * 1000; // 10 minutes for missing docs
const DOCS_FALLBACK_BASE = 'https://uk.shuffler.io';

const memoryCache = new Map<string, StoredAppDocEntry>();
const inflightRequests = new Map<string, Promise<AppDocResult | null>>();

export function normalizeAppDocKey(appName: string): string {
  return (appName || '')
    .toLowerCase()
    .trim()
    .replace(/%20/g, '_')
    .replace(/[\s\-_]+/g, '_');
}

export function formatAppNameForLocation(appName: string, location: AppDocLocation): string {
  const cleaned = (appName || '').toLowerCase().trim().replace(/%20/g, ' ');
  if (location === 'python') {
    return cleaned.replace(/[\s_]+/g, '-');
  }
  return cleaned.replace(/[\s\-]+/g, '_');
}

export function buildAppDocCacheKey(
  appName: string,
  location: AppDocLocation,
  version?: string | null,
): string {
  const norm = normalizeAppDocKey(appName);
  if (location === 'python') {
    const resolvedVersion = (version || '1.0.0').trim() || '1.0.0';
    return `${STORAGE_PREFIX}python:${norm}:${resolvedVersion}`;
  }
  return `${STORAGE_PREFIX}openapi:${norm}`;
}

function readStoredEntry(cacheKey: string): StoredAppDocEntry | null {
  const inMem = memoryCache.get(cacheKey);
  if (inMem) return inMem;

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAppDocEntry;
    if (parsed && typeof parsed.updatedAt === 'number' && typeof parsed.found === 'boolean') {
      memoryCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch {
    // Ignore localStorage parse or quota errors
  }
  return null;
}

function writeStoredEntry(cacheKey: string, entry: StoredAppDocEntry): void {
  memoryCache.set(cacheKey, entry);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // Ignore localStorage quota / privacy errors
  }
}

function sanitizeAppDocMarkdown(raw: string): string {
  const imgRegex = /<img[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
  return raw.replace(imgRegex, '![]($1)').trim();
}

function toResult(entry: StoredAppDocEntry | null): AppDocResult | null {
  if (!entry || !entry.found || !entry.markdown) return null;
  return {
    markdown: entry.markdown,
    meta: entry.meta,
    location: entry.location,
    version: entry.version,
    updatedAt: entry.updatedAt,
  };
}

export interface AppDocLookupOptions {
  /** True for OpenAPI/generated apps, false for Python apps */
  generated?: boolean | null;
  /** App version (only used when location is 'python') */
  version?: string | null;
  /** Force bypass cache */
  resetCache?: boolean;
}

/**
 * Synchronously reads cached app documentation from memory or localStorage.
 * Checks the resolved location (or both 'openapi' and 'python' if generated is unknown).
 */
export function getCachedAppDoc(
  appName: string | null | undefined,
  options?: AppDocLookupOptions,
): AppDocResult | null {
  if (!appName) return null;
  const generated = options?.generated;
  const version = options?.version || '1.0.0';

  if (generated === false) {
    return toResult(readStoredEntry(buildAppDocCacheKey(appName, 'python', version)));
  }
  if (generated === true) {
    return toResult(readStoredEntry(buildAppDocCacheKey(appName, 'openapi')));
  }

  const openapiEntry = readStoredEntry(buildAppDocCacheKey(appName, 'openapi'));
  if (openapiEntry?.found) return toResult(openapiEntry);

  const pythonEntry = readStoredEntry(buildAppDocCacheKey(appName, 'python', version));
  if (pythonEntry?.found) return toResult(pythonEntry);

  return null;
}

async function fetchLocationDocFromNetwork(
  appName: string,
  location: AppDocLocation,
  version?: string | null,
  resetCache = false,
): Promise<StoredAppDocEntry | null> {
  const formattedName = formatAppNameForLocation(appName, location);
  if (!formattedName) return null;

  const params = new URLSearchParams();
  params.set('location', location);
  if (location === 'python') {
    params.set('version', (version || '1.0.0').trim() || '1.0.0');
  }
  if (resetCache) {
    params.set('resetCache', 'true');
  }

  const path = `/api/v1/docs/${encodeURIComponent(formattedName)}?${params.toString()}`;
  const urls = [getApiUrl(path), `${DOCS_FALLBACK_BASE}${path}`];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...getAuthHeader(),
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (
        data?.success === true &&
        typeof data.reason === 'string' &&
        !data.reason.includes('404: Not Found') &&
        data.reason.trim().length > 25
      ) {
        const markdown = sanitizeAppDocMarkdown(data.reason);
        return {
          found: true,
          markdown,
          meta: data.meta && typeof data.meta === 'object' ? data.meta : undefined,
          location,
          version: location === 'python' ? ((version || '1.0.0').trim() || '1.0.0') : undefined,
          updatedAt: Date.now(),
        };
      }
      // Valid response from backend indicating no documentation exists for this location
      return {
        found: false,
        markdown: '',
        location,
        version: location === 'python' ? ((version || '1.0.0').trim() || '1.0.0') : undefined,
        updatedAt: Date.now(),
      };
    } catch {
      // Try fallback base URL
    }
  }

  return null;
}

/**
 * Fetches app documentation from localStorage cache or `/api/v1/docs/{appname}`.
 * - Uses `location=openapi` (without version) or `location=python&version=...`
 * - If `generated` is unknown (`undefined`/`null`), tries `openapi` first and falls back to `python`.
 */
export async function fetchAppDoc(
  appName: string | null | undefined,
  options?: AppDocLookupOptions,
): Promise<AppDocResult | null> {
  if (!appName) return null;

  const generated = options?.generated;
  const version = (options?.version || '1.0.0').trim() || '1.0.0';
  const resetCache = Boolean(options?.resetCache);

  const locationsToTry: AppDocLocation[] =
    generated === false
      ? ['python']
      : generated === true
        ? ['openapi']
        : ['openapi', 'python'];

  for (const loc of locationsToTry) {
    const cacheKey = buildAppDocCacheKey(appName, loc, loc === 'python' ? version : undefined);
    const cached = !resetCache ? readStoredEntry(cacheKey) : null;
    const now = Date.now();

    if (cached) {
      const ttl = cached.found ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      const isFresh = now - cached.updatedAt < ttl;
      if (cached.found) {
        if (!isFresh && !inflightRequests.has(cacheKey)) {
          // Revalidate in background
          const bg = fetchLocationDocFromNetwork(appName, loc, version, false)
            .then((fresh) => {
              if (fresh) writeStoredEntry(cacheKey, fresh);
              return toResult(fresh ?? cached);
            })
            .finally(() => {
              inflightRequests.delete(cacheKey);
            });
          inflightRequests.set(cacheKey, bg);
        }
        return toResult(cached);
      }
      if (isFresh) {
        // Negative cache hit for this location; try next location if any
        continue;
      }
    }

    let pending = inflightRequests.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        try {
          const entry = await fetchLocationDocFromNetwork(appName, loc, version, resetCache);
          if (entry) {
            writeStoredEntry(cacheKey, entry);
            return toResult(entry);
          }
          return toResult(cached);
        } finally {
          inflightRequests.delete(cacheKey);
        }
      })();
      inflightRequests.set(cacheKey, pending);
    }

    const result = await pending;
    if (result) return result;
  }

  return null;
}
