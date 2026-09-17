/**
 * Shared, request-coalescing fetcher for `/api/v1/apps/authentication`.
 *
 * Multiple components on a single page (sidebar `IntegrationStatus`, the
 * incident header source-app logo, the Forward dialog, the Automations
 * dialog, etc.) all need the authenticated-apps list. Without coordination
 * they each fired their own HTTP request on mount, producing 3+ identical
 * requests on every incident detail load.
 *
 * This helper:
 *   1. Coalesces concurrent in-flight calls into a single Promise so
 *      simultaneous mounts only trigger one network round-trip.
 *   2. Caches the resolved JSON for a short TTL so a follow-up mount within
 *      that window can read the result synchronously instead of refetching.
 *   3. Exposes an `invalidateAuthenticatedAppsCache()` so code paths that
 *      mutate authentications (delete, reauth, etc.) can force a refresh.
 *
 * The cache key includes the optional `Org-Id` header value so cross-org
 * lookups stay isolated from the active org's data.
 */

import { getApiUrl, getAuthHeader, hasShuffleAuth } from '@/Shuffle-MCPs/api';
import { invalidateAuthCache } from '@/Shuffle-Core/views/appsFetchCache';

export interface AuthenticatedAppRaw {
  id?: string;
  active?: boolean;
  label?: string;
  app?: {
    name?: string;
    id?: string;
    large_image?: string;
    small_image?: string;
    categories?: string[];
    [key: string]: unknown;
  };
  validation?: { valid?: boolean; [key: string]: unknown };
  fields?: Array<{ key: string; value: string }>;
  [key: string]: unknown;
}

interface CacheEntry {
  promise?: Promise<AuthenticatedAppRaw[]>;
  data?: AuthenticatedAppRaw[];
  fetchedAt?: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

const cacheKey = (crossOrgId?: string | null): string => crossOrgId || '';

// Mirror of processAuthData in useAppAuth.ts: invalidate validations that are
// older than 30 days so every consumer of this fetcher (IntegrationStatus dot,
// AppDetailDrawer badge, etc.) agrees on whether an auth is still "valid".
// Without this, the sidebar could show a green dot while the drawer shows
// yellow "Pending" — they were reading the same row but applying different
// freshness rules.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const applyValidationStaleness = (data: AuthenticatedAppRaw[]): AuthenticatedAppRaw[] => {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  return data.map((entry) => {
    const v: any = entry.validation;
    if (v?.valid === true && v?.last_valid) {
      const lastValidMs = v.last_valid > 1e12 ? v.last_valid : v.last_valid * 1000;
      if (lastValidMs < cutoff) {
        return { ...entry, validation: { ...v, valid: false, error: 'Validation expired (older than 30 days)' } };
      }
    }
    return entry;
  });
};

interface FetchOutcome {
  data: AuthenticatedAppRaw[];
  /** True when the request could not be completed (offline, 5xx, parse error).
   *  Failures must never be cached as an empty-but-valid result, otherwise a
   *  brief loss of connectivity leaves rows blank until a full page reload. */
  failed: boolean;
}

const doFetch = async (crossOrgId?: string | null): Promise<FetchOutcome> => {
  if (!hasShuffleAuth()) return { data: [], failed: false };

  // getAuthHeader() now scopes to the active org by default; pass crossOrgId
  // explicitly to override when reading from a different tenant.
  const headers: Record<string, string> = {
    ...getAuthHeader(crossOrgId ?? undefined),
  };
  try {
    const resp = await fetch(getApiUrl('/api/v1/apps/authentication'), {
      credentials: 'include',
      headers,
    });
    if (!resp.ok) return { data: [], failed: true };
    const result = await resp.json();
    const data = result?.data || result;
    if (!Array.isArray(data)) return { data: [], failed: true };
    return { data: applyValidationStaleness(data), failed: false };
  } catch {
    return { data: [], failed: true };
  }
};

/**
 * Get the raw authenticated-apps list. Returns the cached value if it is
 * still within the TTL; otherwise fires (or joins) a single network request.
 */
export const fetchAuthenticatedApps = (crossOrgId?: string | null): Promise<AuthenticatedAppRaw[]> => {
  const key = cacheKey(crossOrgId);
  const entry = cache.get(key) || {};

  // Fresh cache hit — return it without touching the network.
  if (entry.data && entry.fetchedAt && Date.now() - entry.fetchedAt < TTL_MS) {
    return Promise.resolve(entry.data);
  }
  // In-flight request — join it instead of firing a duplicate.
  if (entry.promise) return entry.promise;

  const promise = doFetch(crossOrgId)
    .then((outcome) => {
      if (outcome.failed) {
        // Keep any previously fetched data available, but clear the in-flight
        // promise and timestamp so the very next call retries the network.
        const previous = cache.get(key)?.data;
        cache.delete(key);
        return previous || [];
      }
      cache.set(key, { data: outcome.data, fetchedAt: Date.now() });
      return outcome.data;
    })
    .catch(() => {
      // On failure, drop the in-flight promise so the next caller can retry.
      cache.delete(key);
      return [];
    });

  cache.set(key, { ...entry, promise });
  return promise;
};


/**
 * Invalidate the cached entry for one (or all) cross-org keys. Call after
 * mutating authentications (delete, create, reauth) so the next read fires
 * a fresh request.
 */
export const invalidateAuthenticatedAppsCache = (crossOrgId?: string | null) => {
  if (crossOrgId === undefined) {
    cache.clear();
  } else {
    cache.delete(cacheKey(crossOrgId));
  }
  invalidateAuthCache();
};
