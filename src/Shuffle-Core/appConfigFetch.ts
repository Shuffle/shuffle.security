/**
 * appConfigFetch — Shared, deduplicating fetcher for `/api/v1/apps/:id/config`.
 *
 * Prior versions of the app-config lookup re-hit the endpoint every time a
 * drawer re-opened or a sibling component mounted, so a 401 on one app
 * turned into a firehose of failing requests. This helper:
 *
 *   1. Coalesces concurrent in-flight requests for the same id.
 *   2. Caches successful responses for a short TTL.
 *   3. **Negative-caches** 401/403/404 responses for the whole session so a
 *      known-bad id is never re-requested — the caller gets the failure
 *      status immediately and can render an error state.
 *   4. Never throws — always returns `{ data, status, ok }`.
 */

import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export interface AppConfigFetchResult {
  ok: boolean;
  status: number;
  data: any | null;
}

interface CacheEntry {
  result?: AppConfigFetchResult;
  promise?: Promise<AppConfigFetchResult>;
  at?: number;
}

const OK_TTL_MS = 5 * 60_000;
const FAIL_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

// Statuses we consider permanent for the session (no point retrying on the
// same id — the user has to reauth or the app really doesn't exist).
const HARD_FAIL_STATUSES = new Set([401, 403, 404]);

const decodeAppConfigPayload = (payload: any): any => {
  if (!payload || typeof payload !== 'object' || typeof payload.app !== 'string') {
    return payload;
  }

  try {
    const decoded = JSON.parse(atob(payload.app));
    return {
      ...decoded,
      openapi: payload.openapi,
      success: payload.success,
    };
  } catch {
    return payload;
  }
};

const doFetch = async (appId: string): Promise<AppConfigFetchResult> => {
  try {
    const response = await fetch(
      getApiUrl(`/api/v1/apps/${encodeURIComponent(appId)}/config`),
      { credentials: 'include', headers: { ...getAuthHeader() } },
    );
    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }
    const rawData = await response.json().catch(() => null);
    const data = decodeAppConfigPayload(rawData);
    return { ok: true, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
};

export const fetchAppConfig = (appId: string): Promise<AppConfigFetchResult> => {
  if (!appId) return Promise.resolve({ ok: false, status: 0, data: null });

  const entry = cache.get(appId) || {};

  // Hard-fail: never retry a known-bad id during the session.
  if (entry.result && !entry.result.ok && HARD_FAIL_STATUSES.has(entry.result.status)) {
    return Promise.resolve(entry.result);
  }
  // Transient failure cooldown. Even non-permanent failures should not be
  // retried in a render loop; allow a later explicit retry after the cooldown.
  if (entry.result && !entry.result.ok && entry.at && Date.now() - entry.at < FAIL_TTL_MS) {
    return Promise.resolve(entry.result);
  }
  // Fresh success within TTL.
  if (entry.result?.ok && entry.at && Date.now() - entry.at < OK_TTL_MS) {
    return Promise.resolve(entry.result);
  }
  // Coalesce in-flight.
  if (entry.promise) return entry.promise;

  const promise = doFetch(appId).then((result) => {
    cache.set(appId, { result, at: Date.now() });
    return result;
  });
  cache.set(appId, { ...entry, promise });
  return promise;
};

/** Clear the cache — call after a user re-authenticates. */
export const invalidateAppConfigCache = (appId?: string) => {
  if (appId === undefined) cache.clear();
  else cache.delete(appId);
};
