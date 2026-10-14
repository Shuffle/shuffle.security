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

// Partial hard-coded docs list so the sidebar keeps working when the network is down.
// Also used to tell "known page failed to load" apart from "page does not exist".
export const KNOWN_DOCS: RemoteDocEntry[] = [
  'getting_started', 'about', 'tenants', 'features', 'API',
  'workflows', 'apps', 'AI',
  'incidents', 'vulnerabilities', 'detection',
  'architecture', 'configuration', 'extensions', 'troubleshooting',
].map((name) => ({ name }) as RemoteDocEntry);

const withFallback = (folder: string | undefined, list: RemoteDocEntry[]) =>
  list.length === 0 && (!folder || folder === 'docs') ? KNOWN_DOCS : list;

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
  const list = await fetchDocsList(resetCache, folder, signal);
  const match = list.find((d) => docSlug(d.name) === slug.toLowerCase());
  return match?.name ?? null;
};

// Fetch the raw markdown for an exact document name from /api/v1/docs/{name}.
export const fetchDocMarkdown = async (
  name: string,
  resetCache = false,
  folder?: string,
  signal?: AbortSignal,
): Promise<string | null> => {
  const data = await fetchDocsJson(
    `/api/v1/docs/${encodeURIComponent(name)}${docsQuery(folder, resetCache)}`,
    signal,
  );
  if (data?.success && typeof data.reason === 'string' && data.reason.trim().length > 0) {
    return data.reason as string;
  }
  return null;
};
