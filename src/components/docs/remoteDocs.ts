import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export interface RemoteDocEntry {
  name: string;
  contributors?: { name?: string; url?: string; image?: string }[];
  read_time?: number;
  edited?: string;
  link?: string;
}

// Slugs are lowercase/dashed for URLs, but the API name is case sensitive ("AI", "API").
export const docSlug = (name: string) => name.replace(/_+/g, '-').toLowerCase();

/** Build the query string for the docs API (optional folder + cache reset). */
const docsQuery = (folder?: string, resetCache = false) => {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (resetCache) params.set('resetCache', 'true');
  const query = params.toString();
  return query ? `?${query}` : '';
};

const cachedList: Record<string, RemoteDocEntry[]> = {};
const inflight: Record<string, Promise<RemoteDocEntry[]> | null> = {};

// Partial hard-coded docs list so the sidebar keeps working when the network is down
// and renders immediately on first paint before /api/v1/docs resolves.
// Also used to tell "known page failed to load" apart from "page does not exist".
export const KNOWN_DOCS: RemoteDocEntry[] = [
  'getting_started', 'about', 'tenants', 'features', 'API',
  'workflows', 'apps', 'AI',
  'incidents', 'vulnerabilities', 'monitors', 'detection',
  'architecture', 'configuration', 'extensions', 'troubleshooting',
].map((name) => ({ name }) as RemoteDocEntry);

export const KNOWN_LEGAL_DOCS: RemoteDocEntry[] = [
  'privacy_policy', 'terms_of_service', 'cookie_policy', 'compliance',
].map((name) => ({ name }) as RemoteDocEntry);

const STORAGE_LIST_PREFIX = 'shuffle_docs_list_v1:';
const STORAGE_DOC_PREFIX = 'shuffle_docs_md_v1:';
const cachedMarkdown: Record<string, string> = {};

const readStoredDocsList = (key: string): RemoteDocEntry[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.localStorage.getItem(`${STORAGE_LIST_PREFIX}${key}`) ??
      window.sessionStorage.getItem(`${STORAGE_LIST_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((d): d is RemoteDocEntry => Boolean(d?.name));
    }
  } catch {
    // Ignore storage errors
  }
  return null;
};

const writeStoredDocsList = (key: string, list: RemoteDocEntry[]) => {
  if (typeof window === 'undefined' || list.length === 0) return;
  try {
    const payload = JSON.stringify(list);
    window.localStorage.setItem(`${STORAGE_LIST_PREFIX}${key}`, payload);
    window.sessionStorage.setItem(`${STORAGE_LIST_PREFIX}${key}`, payload);
  } catch {
    // Ignore storage quota / privacy errors
  }
};

export const readStoredDocMarkdown = (cacheKey: string): string | null => {
  if (cachedMarkdown[cacheKey]) return cachedMarkdown[cacheKey];
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_DOC_PREFIX}${cacheKey}`);
    if (raw && raw.trim().length > 0) {
      cachedMarkdown[cacheKey] = raw;
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
};

export const writeStoredDocMarkdown = (cacheKey: string, markdown: string) => {
  cachedMarkdown[cacheKey] = markdown;
  if (typeof window === 'undefined' || !markdown) return;
  try {
    window.localStorage.setItem(`${STORAGE_DOC_PREFIX}${cacheKey}`, markdown);
  } catch {
    // Ignore storage quota / privacy errors
  }
};

export const removeStoredDocMarkdown = (cacheKey: string) => {
  delete cachedMarkdown[cacheKey];
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${STORAGE_DOC_PREFIX}${cacheKey}`);
  } catch {
    // Ignore storage errors
  }
};

const getFallbackDocs = (folder?: string): RemoteDocEntry[] => {
  if (!folder || folder === 'docs') return KNOWN_DOCS;
  if (folder === 'legal') return KNOWN_LEGAL_DOCS;
  return [];
};

const withFallback = (folder: string | undefined, list: RemoteDocEntry[]) =>
  list.length === 0 ? getFallbackDocs(folder) : list;

/**
 * Synchronously returns the best available docs list for immediate rendering
 * (in-memory cache -> localStorage/sessionStorage cache -> static known docs fallback).
 */
export const getInitialDocsList = (folder?: string): RemoteDocEntry[] => {
  const key = folder || 'docs';
  if (cachedList[key] && cachedList[key].length > 0) {
    return cachedList[key];
  }
  const fromStorage = readStoredDocsList(key);
  if (fromStorage && fromStorage.length > 0) {
    cachedList[key] = fromStorage;
    return fromStorage;
  }
  return getFallbackDocs(folder);
};

export const fetchDocsList = async (
  resetCache = false,
  folder?: string,
  signal?: AbortSignal,
): Promise<RemoteDocEntry[]> => {
  const key = folder || 'docs';
  return withFallback(folder, await fetchDocsListRaw(resetCache, folder, signal, key));
};

// Docs-only fallback backend. When the local / primary backend is unreachable
// (offline dev, self-hosted without the docs API), retry against the public
// Shuffle backend so documentation still loads.
const DOCS_FALLBACK_BASE = 'https://uk.shuffler.io';

export const fetchDocsJson = async (
  path: string,
  signal?: AbortSignal,
): Promise<any | null> => {
  const bases = [getApiUrl(path), `${DOCS_FALLBACK_BASE}${path}`];
  for (const url of bases) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { ...getAuthHeader() },
        signal,
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // try next base
    }
  }
  return null;
};

const fetchDocsListRaw = async (
  resetCache: boolean,
  folder: string | undefined,
  signal: AbortSignal | undefined,
  key: string,
): Promise<RemoteDocEntry[]> => {
  if (!resetCache && cachedList[key]) return cachedList[key];
  if (!resetCache && inflight[key]) return inflight[key]!;

  const run = (async () => {
    try {
      const data = await fetchDocsJson(`/api/v1/docs${docsQuery(folder, resetCache)}`, signal);
      if (!data?.success || !Array.isArray(data.list)) return cachedList[key] ?? [];
      cachedList[key] = (data.list as RemoteDocEntry[]).filter((d) => d?.name);
      writeStoredDocsList(key, cachedList[key]);
      return cachedList[key];
    } finally {
      inflight[key] = null;
    }
  })();

  inflight[key] = run;
  return run;
};

// Resolve a URL slug to the exact document name the API expects.
export const resolveDocName = async (
  slug: string,
  resetCache = false,
  folder?: string,
  signal?: AbortSignal,
): Promise<string | null> => {
  const target = slug.toLowerCase();
  if (!resetCache) {
    const initial = getInitialDocsList(folder);
    const knownMatch = initial.find((d) => docSlug(d.name) === target);
    if (knownMatch?.name) return knownMatch.name;
  }
  const list = await fetchDocsList(resetCache, folder, signal);
  const match = list.find((d) => docSlug(d.name) === target);
  return match?.name ?? null;
};

// Fetch the raw markdown for an exact document name from /api/v1/docs/{name}.
export const fetchDocMarkdown = async (
  name: string,
  resetCache = false,
  folder?: string,
  signal?: AbortSignal,
): Promise<string | null> => {
  const cacheKey = `${folder || 'docs'}:${name.toLowerCase()}`;
  if (!resetCache) {
    const stored = readStoredDocMarkdown(cacheKey);
    if (stored) return stored;
  }

  const data = await fetchDocsJson(
    `/api/v1/docs/${encodeURIComponent(name)}${docsQuery(folder, resetCache)}`,
    signal,
  );
  if (data?.success && typeof data.reason === 'string' && data.reason.trim().length > 0) {
    writeStoredDocMarkdown(cacheKey, data.reason);
    return data.reason as string;
  }
  return null;
};
