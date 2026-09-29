/**
 * useThreadCorrelatedIncidents — when the current incident carries a
 * `thread_id` value, we assume every other incident sharing that value is
 * part of the same conversation and should be pulled in.
 *
 * Resolution:
 *   1. Extract thread_id from the raw OCSF payload (top-level or nested
 *      email metadata locations).
 *   2. Ask /api/v2/correlations with `{ type: 'value', key: thread_id }`
 *      to find every datastore ref that mentions that value.
 *   3. Extract incident IDs from the returned refs, drop the current one,
 *      and cross-load each via the incidents datastore.
 *
 * Read-only — no writes to either side. Renders alongside the manual
 * merge-pointer banner so analysts can see automatic thread grouping
 * without collapsing the records.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDatastoreItem,
  DATASTORE_CATEGORIES,
} from '@/Shuffle-Core/datastore';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

import type { LinkedIncidentSummary } from '@/hooks/useRelatedIncidents';
import { extractReadableTitle, extractReadableDescription } from '@/hooks/useRelatedIncidents';

export interface UseThreadCorrelatedIncidentsResult {
  threadId: string | null;
  incidents: LinkedIncidentSummary[];
  /** Sibling count from /correlations, available before datastore summaries finish loading. */
  discoveredCount: number;
  invisibleCount: number;
  loading: boolean;
  loadAll: () => Promise<LinkedIncidentSummary[]>;
  refresh: () => void;
}

/**
 * Pull a thread_id out of a raw OCSF payload. Providers put it in a few
 * different places; check the common ones and normalise to a string.
 */
export const extractThreadId = (raw: any): string | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidates: unknown[] = [
    raw.thread_id,
    raw.threadId,
    raw.email?.thread_id,
    raw.email?.threadId,
    raw.unmapped?.thread_id,
    raw.unmapped_original?.thread_id,
    raw.metadata?.thread_id,
    raw.metadata?.extensions?.custom_attributes?.thread_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number') return String(c);
  }
  return null;
};

/** Refs come back as "prefix|id" or "path/id". Grab the trailing id. */
const refToIncidentId = (ref: string): string => {
  if (!ref) return '';
  if (ref.includes('|')) return ref.split('|').pop() || '';
  if (ref.includes('/')) return ref.split('/').pop() || '';
  return ref;
};

const parseSummary = (id: string, value: string): LinkedIncidentSummary | null => {
  try {
    const raw = JSON.parse(value);
    return {
      id,
      title: extractReadableTitle(raw, id),
      description: extractReadableDescription(raw),
      status: raw.status,
      status_id: raw.status_id,
      severity: raw.severity,
      severity_id: raw.severity_id,
      raw,
    };
  } catch {
    return null;
  }
};

const SUMMARY_PREVIEW_LIMIT = 20;
const SUMMARY_FETCH_CONCURRENCY = 6;

const loadIncidentSummaries = async (ids: string[]) => {
  let missed = 0;
  const resolved: LinkedIncidentSummary[] = [];
  for (let i = 0; i < ids.length; i += SUMMARY_FETCH_CONCURRENCY) {
    const batch = ids.slice(i, i + SUMMARY_FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (rid) => {
        try {
          const res = await getDatastoreItem(rid, DATASTORE_CATEGORIES.INCIDENTS);
          if (!res.success || !res.item) return null;
          const s = parseSummary(rid, res.item.value);
          return s;
        } catch {
          return null;
        }
      }),
    );
    for (const result of results) {
      if (result) resolved.push(result);
      else missed++;
    }
  }
  return { resolved, missed };
};

export const useThreadCorrelatedIncidents = (
  incidentId: string | undefined,
  raw: any,
  crossOrgHeaders: Record<string, string> = {},
): UseThreadCorrelatedIncidentsResult => {
  const threadId = useMemo(() => extractThreadId(raw), [raw]);


  const [incidents, setIncidents] = useState<LinkedIncidentSummary[]>([]);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [invisibleCount, setInvisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const cancelled = useRef(false);
  const runIdRef = useRef(0);
  const identityRef = useRef<string>('');
  const discoveredIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!incidentId || !threadId) {
      setIncidents([]);
      setDiscoveredCount(0);
      setInvisibleCount(0);
      discoveredIdsRef.current = [];
      identityRef.current = '';
      return;
    }
    const identity = `${incidentId}:${threadId}`;
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      discoveredIdsRef.current = [];
      setIncidents([]);
      setDiscoveredCount(0);
      setInvisibleCount(0);
    }
    cancelled.current = false;
    const runId = ++runIdRef.current;
    const isStale = () => cancelled.current || runIdRef.current !== runId;
    setLoading(true);

    (async () => {
      const foundIds = new Set<string>();
      try {
        const resp = await fetch(getApiUrl('/api/v2/correlations'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...crossOrgHeaders,
          },
          body: JSON.stringify({ type: 'value', key: String(threadId).toLowerCase() }),
        });
        if (!resp.ok) {
          // Transient — keep whatever we had so the banner and the
          // "N linked" badge on the source-app logo don't blink to
          // zero on every flaky /correlations response.
          if (!isStale()) setLoading(false);
          return;
        }
        const data = await resp.json();
        const corrData = Array.isArray(data) ? data : (data.correlations || data.data || []);
        const currentLower = incidentId.toLowerCase();
        for (const c of corrData) {
          const refs = Array.isArray(c?.ref) ? c.ref : [];
          for (const r of refs) {
            const rid = refToIncidentId(String(r));
            if (!rid) continue;
            if (rid.toLowerCase() === currentLower) continue;
            foundIds.add(rid);
          }
        }
      } catch (err) {
        // Network error — same policy as !resp.ok above: don't wipe
        // the last-known-good sibling list on a transient failure.
        if (!isStale()) setLoading(false);
        return;
      }

      const ids = Array.from(foundIds);
      if (!isStale()) {
        discoveredIdsRef.current = ids;
        setDiscoveredCount(ids.length);
      }

      // If the correlation endpoint returned zero refs, the thread
      // really has no siblings right now (or the backend just lost
      // them). Clearing here is correct — this is a successful
      // "empty" response, not a fetch failure.
      if (foundIds.size === 0) {
        if (!isStale()) {
          setIncidents([]);
          setDiscoveredCount(0);
          discoveredIdsRef.current = [];
          setInvisibleCount(0);
          setLoading(false);
        }
        return;
      }

      const idsToResolve = ids.slice(0, SUMMARY_PREVIEW_LIMIT);
      const skipped = Math.max(0, ids.length - idsToResolve.length);
      const { resolved, missed } = await loadIncidentSummaries(idsToResolve);

      if (isStale()) return;
      // Only overwrite `incidents` when we actually resolved something.
      // If every per-sibling fetch failed (datastore hiccup) keep the
      // previous list so the banner + Gmail-logo badge stay visible.
      if (resolved.length > 0 || missed === 0) {
        setIncidents(resolved);
      }
      setInvisibleCount(missed + skipped);
      setLoading(false);
    })();


    return () => {
      cancelled.current = true;
    };
    // crossOrgHeaders is stable enough per-render; re-run only on identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId, threadId, tick]);

  const loadAll = useCallback(async (): Promise<LinkedIncidentSummary[]> => {
    const ids = discoveredIdsRef.current;
    if (ids.length === 0) return incidents;
    setLoading(true);
    const { resolved, missed } = await loadIncidentSummaries(ids);
    if (!cancelled.current && identityRef.current === `${incidentId}:${threadId}`) {
      if (resolved.length > 0 || missed === 0) setIncidents(resolved);
      setInvisibleCount(missed);
      setDiscoveredCount(ids.length);
      setLoading(false);
    }
    return resolved;
  }, [incidentId, incidents, threadId]);

  return {
    threadId,
    incidents,
    discoveredCount,
    invisibleCount,
    loading,
    loadAll,
    refresh: () => setTick(t => t + 1),
  };
};
