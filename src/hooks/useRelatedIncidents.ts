/**
 * useRelatedIncidents — cross-loads incidents pointed to by
 * `related_incidents` on the current incident's raw payload.
 *
 * Returns:
 *   - `primary`: the primary side of a merge pair (when this incident is
 *     non-primary), or null.
 *   - `linked`:  incidents that point back to this incident as their
 *     primary (i.e. the ones merged INTO this one).
 *   - `invisibleCount`: number of pointers we could not resolve (deleted,
 *     multi-tenant permission mismatch, etc.).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeHtmlEntities } from '@/lib/utils';
import {
  getDatastoreItem,
  DATASTORE_CATEGORIES,
} from '@/Shuffle-Core/datastore';
import {
  getPrimaryPointer,
  getLinkedPointers,
  RelatedIncidentPointer,
} from '@/lib/incidentRelations';

export interface LinkedIncidentSummary {
  id: string;
  title: string;
  description?: string;
  status?: string;
  status_id?: number;
  severity?: string;
  severity_id?: number;
  raw: any;
}

export interface UseRelatedIncidentsResult {
  primary: LinkedIncidentSummary | null;
  linked: LinkedIncidentSummary[];
  invisibleCount: number;
  loading: boolean;
  refresh: () => void;
}

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

export const extractReadableTitle = (raw: any, fallback: string): string => {
  const fi = raw?.finding_info_list?.[0] || raw?.finding_info || {};
  const candidates: unknown[] = [
    fi.title,
    raw?.title,
    raw?.subject,
    raw?.email?.subject,
    raw?.message,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const s = decodeHtmlEntities(c).trim();
    if (!s) continue;
    // Skip anything that looks like a JSON blob dump
    if ((s.startsWith('[') || s.startsWith('{')) && (s.includes('"name"') || s.includes('"value"'))) continue;
    return s.length > 140 ? s.slice(0, 140).trimEnd() + '…' : s;
  }
  return fallback;
};

export const extractReadableDescription = (raw: any): string | undefined => {
  const fi = raw?.finding_info_list?.[0] || raw?.finding_info || {};
  const candidates: unknown[] = [
    fi.desc,
    raw?.description,
    raw?.desc,
    raw?.email?.snippet,
    raw?.summary,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const s = decodeHtmlEntities(c).replace(/\s+/g, ' ').trim();
    if (!s) continue;
    if ((s.startsWith('[') || s.startsWith('{')) && (s.includes('"name"') || s.includes('"value"'))) continue;
    return s.length > 200 ? s.slice(0, 200).trimEnd() + '…' : s;
  }
  return undefined;
};

export const useRelatedIncidents = (
  incidentId: string | undefined,
  raw: any,
): UseRelatedIncidentsResult => {
  const [primary, setPrimary] = useState<LinkedIncidentSummary | null>(null);
  const [linked, setLinked] = useState<LinkedIncidentSummary[]>([]);
  const [invisibleCount, setInvisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const cancelled = useRef(false);

  const primaryPtr = useMemo(() => getPrimaryPointer(raw), [raw]);
  const linkedPtrs = useMemo(() => getLinkedPointers(raw), [raw]);
  const pointerKey = useMemo(
    () => [primaryPtr?.id, ...linkedPtrs.map(p => p.id)].filter(Boolean).join('|'),
    [primaryPtr, linkedPtrs],
  );

  useEffect(() => {
    if (!incidentId) return;
    if (!primaryPtr && linkedPtrs.length === 0) {
      setPrimary(null);
      setLinked([]);
      setInvisibleCount(0);
      return;
    }
    cancelled.current = false;
    setLoading(true);
    let missed = 0;

    const load = async (ptr: RelatedIncidentPointer): Promise<LinkedIncidentSummary | null> => {
      try {
        const res = await getDatastoreItem(ptr.id, DATASTORE_CATEGORIES.INCIDENTS);
        if (!res.success || !res.item) {
          missed++;
          return null;
        }
        const s = parseSummary(ptr.id, res.item.value);
        if (!s) missed++;
        return s;
      } catch {
        missed++;
        return null;
      }
    };

    (async () => {
      const [primaryResult, linkedResults] = await Promise.all([
        primaryPtr ? load(primaryPtr) : Promise.resolve(null),
        Promise.all(linkedPtrs.map(load)),
      ]);
      if (cancelled.current) return;
      setPrimary(primaryResult);
      setLinked(linkedResults.filter((x): x is LinkedIncidentSummary => x !== null));
      setInvisibleCount(missed);
      setLoading(false);
    })();

    return () => {
      cancelled.current = true;
    };
  }, [incidentId, pointerKey, tick, primaryPtr, linkedPtrs]);

  return {
    primary,
    linked,
    invisibleCount,
    loading,
    refresh: () => setTick(t => t + 1),
  };
};
