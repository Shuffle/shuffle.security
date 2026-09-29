/**
 * Lazy multi-datastore loader: only fetches a category when explicitly
 * requested (typically when the user activates a tab). Caches per key so
 * switching tabs back is instant.
 */
import { useCallback, useRef, useState } from 'react';
import { getDatastoreByCategory, DatastoreItem } from '@/Shuffle-Core/datastore';

export interface CategoryLoadState {
  key: string;
  items: DatastoreItem[];
  isLoading: boolean;
  error: string | null;
  hasFetched: boolean;
}

interface UseMultiDatastoreReturn {
  states: Record<string, CategoryLoadState>;
  isAnyLoading: boolean;
  fetchKey: (key: string, force?: boolean) => Promise<void>;
  refetch: (key: string) => Promise<void>;
}

const emptyState = (key: string): CategoryLoadState => ({
  key, items: [], isLoading: false, error: null, hasFetched: false,
});

export const useMultiDatastore = (): UseMultiDatastoreReturn => {
  const [states, setStates] = useState<Record<string, CategoryLoadState>>({});
  const inFlight = useRef<Record<string, Promise<void> | undefined>>({});
  const statesRef = useRef(states);
  statesRef.current = states;

  const fetchKey = useCallback(async (key: string, force = false): Promise<void> => {
    if (!force) {
      if (statesRef.current[key]?.hasFetched) return;
      const existing = inFlight.current[key];
      if (existing) return existing;
    }

    const promise = (async () => {
      setStates(prev => ({ ...prev, [key]: { ...(prev[key] || emptyState(key)), isLoading: true, error: null } }));
      try {
        let cursor: string | undefined;
        let all: DatastoreItem[] = [];
        const MAX = 5;
        let page = 0;
        do {
          page++;
          const res = await getDatastoreByCategory(key, cursor);
          if (!res.success) {
            setStates(prev => ({
              ...prev,
              [key]: { ...(prev[key] || emptyState(key)), isLoading: false, hasFetched: true, error: res.error || 'Failed to fetch' },
            }));
            return;
          }
          if (res.data) all = [...all, ...res.data];
          cursor = res.cursor || undefined;
        } while (cursor && page < MAX);

        setStates(prev => ({
          ...prev,
          [key]: { key, items: all, isLoading: false, hasFetched: true, error: null },
        }));
      } catch (err) {
        setStates(prev => ({
          ...prev,
          [key]: { ...(prev[key] || emptyState(key)), isLoading: false, hasFetched: true, error: err instanceof Error ? err.message : 'Unknown error' },
        }));
      } finally {
        inFlight.current[key] = undefined;
      }
    })();

    inFlight.current[key] = promise;
    return promise;
  }, []);

  const refetch = useCallback((key: string) => fetchKey(key, true), [fetchKey]);

  const isAnyLoading = Object.values(states).some(s => s.isLoading);
  return { states, isAnyLoading, fetchKey, refetch };
};
