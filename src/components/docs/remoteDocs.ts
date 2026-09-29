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

export const fetchDocsList = async (
  resetCache = false,
  folder?: string,
  signal?: AbortSignal,
): Promise<RemoteDocEntry[]> => {
  const key = folder || 'docs';
  if (!resetCache && cachedList[key]) return cachedList[key];
  if (!resetCache && inflight[key]) return inflight[key]!;

  const run = (async () => {
    try {
      const res = await fetch(getApiUrl(`/api/v1/docs${docsQuery(folder, resetCache)}`), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
        signal,
      });
      if (!res.ok) return cachedList[key] ?? [];
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.list)) return cachedList[key] ?? [];
      cachedList[key] = (data.list as RemoteDocEntry[]).filter((d) => d?.name);
      return cachedList[key];
    } catch {
      return cachedList[key] ?? [];
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
  try {
    const res = await fetch(
      getApiUrl(`/api/v1/docs/${encodeURIComponent(name)}${docsQuery(folder, resetCache)}`),
      {
        credentials: 'include',
        headers: { ...getAuthHeader() },
        signal,
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success && typeof data.reason === 'string' && data.reason.trim().length > 0) {
      return data.reason as string;
    }
  } catch {
    // ignore
  }
  return null;
};
