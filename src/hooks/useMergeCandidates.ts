import { useEffect, useMemo, useRef, useState } from 'react';
import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import {
  scoreMergeCandidates,
  ScoredMergeCandidate,
  RawCandidateIncident,
} from '@/utils/mergeCandidateScoring';

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_LIMIT = 3;

interface UseMergeCandidatesArgs {
  /** Datastore id of the current incident — excluded from results. */
  currentIncidentId: string | undefined;
  currentTitle: string;
  /** Already-lowercased `${type}::${value}` keys of the current incident's observables. */
  currentObservableKeys: Set<string>;
  /** Lowercased keys that the current incident has correlations on. */
  currentCorrelationKeys: Set<string>;
  /** Lowercased observable keys flagged as known IOCs on the current incident. */
  currentIocKeys: Set<string>;
  /** Optional override for the look-back window. */
  maxAgeMs?: number;
  /** Optional override for the result count. */
  limit?: number;
  /** Skip fetching while still gathering inputs. */
  enabled?: boolean;
}

export interface UseMergeCandidatesResult {
  candidates: ScoredMergeCandidate[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Look across the INCIDENTS datastore for likely merge targets for the
 * incident currently being viewed. Result is sorted by score desc and
 * capped by `limit`.
 *
 * The hook fetches once per (currentIncidentId, refresh tick) and re-scores
 * locally whenever the input signal sets change — this avoids hammering the
 * datastore as correlations stream in.
 */
export const useMergeCandidates = ({
  currentIncidentId,
  currentTitle,
  currentObservableKeys,
  currentCorrelationKeys,
  currentIocKeys,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UseMergeCandidatesArgs): UseMergeCandidatesResult => {
  const [rawIncidents, setRawIncidents] = useState<RawCandidateIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !currentIncidentId) return;
    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS)
      .then(result => {
        if (cancelledRef.current) return;
        if (!result.success || !result.data) {
          setError(result.error || 'Failed to load candidates');
          setRawIncidents([]);
          return;
        }

        const parsed: RawCandidateIncident[] = [];
        for (const item of result.data) {
          if (item.key === currentIncidentId) continue;
          try {
            const raw = JSON.parse(item.value);
            parsed.push({ id: item.key, raw, created: item.created || 0 });
          } catch {
            // Skip malformed entries silently — they are surfaced elsewhere.
          }
        }
        setRawIncidents(parsed);
      })
      .catch(err => {
        if (cancelledRef.current) return;
        setError(err?.message || 'Failed to load candidates');
        setRawIncidents([]);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoading(false);
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [currentIncidentId, enabled, refreshTick]);

  const candidates = useMemo(() => {
    if (!rawIncidents.length) return [];
    if (
      currentObservableKeys.size === 0 &&
      currentCorrelationKeys.size === 0 &&
      currentIocKeys.size === 0 &&
      !currentTitle
    ) {
      return [];
    }
    return scoreMergeCandidates(rawIncidents, {
      currentObservableKeys,
      currentCorrelationKeys,
      currentIocKeys,
      currentTitle,
      maxAgeMs,
      limit,
    });
  }, [
    rawIncidents,
    currentObservableKeys,
    currentCorrelationKeys,
    currentIocKeys,
    currentTitle,
    maxAgeMs,
    limit,
  ]);

  return {
    candidates,
    loading,
    error,
    refresh: () => setRefreshTick(t => t + 1),
  };
};
