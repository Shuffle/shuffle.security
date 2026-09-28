/**
 * Shared, module-level cache for correlation-related incident lookups.
 *
 * Correlation UIs (popover preview + inline recency/severity strip) all fetch
 * the same incidents from the datastore repeatedly as the user hovers/opens
 * different correlation rows. Two problems this cache solves:
 *
 *  1. Duplicate fetches for the same key across components and remounts.
 *  2. "Incident no longer exists" being re-fetched on every hover — once we
 *     know the key is missing, remember it. Missing correlations don't
 *     un-delete themselves during a session.
 *
 * We also coalesce concurrent in-flight requests for the same key so a burst
 * of hovers on the same chip fires exactly one network call.
 */
import { getDatastoreItem } from '@/Shuffle-MCPs/datastore';
import { toCanonicalIncidentId } from '@/lib/incidentUrl';

export type IncidentLookupResult =
  | { status: 'found'; raw: unknown; item: { created?: number; edited?: number; value?: unknown } }
  | { status: 'not_found' }
  | { status: 'error'; error: string };

const cache = new Map<string, IncidentLookupResult>();
const inflight = new Map<string, Promise<IncidentLookupResult>>();

const cacheKey = (key: string, category: string) => `${category}::${toCanonicalIncidentId(key)}`;

export const getCachedIncidentLookup = (
  key: string,
  category: string,
): IncidentLookupResult | undefined => cache.get(cacheKey(key, category));

/**
 * Lookup an incident from the datastore with caching.
 *
 * Successful and "not found" results are cached permanently for the session.
 * Transport errors are NOT cached — the next call retries.
 */
export const lookupIncidentCached = (
  key: string,
  category: string,
): Promise<IncidentLookupResult> => {
  const canonicalKey = toCanonicalIncidentId(key);
  const ck = cacheKey(canonicalKey, category);
  const cached = cache.get(ck);
  if (cached && cached.status !== 'error') return Promise.resolve(cached);

  const existing = inflight.get(ck);
  if (existing) return existing;

  const promise = (async (): Promise<IncidentLookupResult> => {
    try {
      const result = await getDatastoreItem(canonicalKey, category);
      if (!result?.success) {
        return { status: 'error', error: result?.error || 'Failed to load incident' };
      }
      const item = result.item as { created?: number; edited?: number; value?: unknown } | undefined;
      if (!item || item.value === undefined || item.value === null || item.value === '') {
        const nf: IncidentLookupResult = { status: 'not_found' };
        cache.set(ck, nf);
        return nf;
      }
      const found: IncidentLookupResult = { status: 'found', raw: item.value, item };
      cache.set(ck, found);
      return found;
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : 'Failed to load incident' };
    } finally {
      inflight.delete(ck);
    }
  })();

  inflight.set(ck, promise);
  return promise;
};

/** Manually invalidate a single key (e.g. after a delete). */
export const invalidateIncidentLookup = (key: string, category: string) => {
  cache.delete(cacheKey(key, category));
};
