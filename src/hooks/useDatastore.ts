/**
 * React hook for Shuffle Datastore operations
 * Provides a convenient interface for components to interact with the datastore
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  setDatastoreItem,
  setDatastoreItems,
  getDatastoreItem,
  getDatastoreByCategory,
  getDatastorePageSize,
  deleteDatastoreItem,
  DatastoreItem,
  DatastoreDiagnostics,
  CategoryConfig,
} from '@/Shuffle-MCPs/datastore';

interface UseDatastoreOptions {
  category: string;
  orgId?: string;
}

interface UseDatastoreReturn {
  items: DatastoreItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasFetched: boolean;
  error: string | null;
  lastDiagnostics: DatastoreDiagnostics | null;
  cursor: string | null;
  hasMore: boolean;
  totalAmount: number | null;
  categoryConfig: CategoryConfig | null;
  fetchItems: (cursorParam?: string) => Promise<void>;
  fetchNextPage: () => Promise<void>;
  resetPagination: () => void;
  addItem: (key: string, value: string | object, skipRefresh?: boolean) => Promise<boolean>;
  addItems: (items: { key: string; value: string | object }[]) => Promise<boolean>;
  getItem: (key: string) => Promise<DatastoreItem | null>;
  removeItem: (key: string) => Promise<boolean>;
}

export const useDatastore = ({ category, orgId: overrideOrgId }: UseDatastoreOptions): UseDatastoreReturn => {
  const [items, setItems] = useState<DatastoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<DatastoreDiagnostics | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfig | null>(null);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);

  // Track hasFetched in a ref so fetchItems' identity stays stable across renders.
  // Without this, each fetch flips hasFetched -> recreates fetchItems -> retriggers caller's effects.
  const hasFetchedRef = useRef(false);

  const fetchItems = useCallback(async (cursorParam?: string) => {
    // Only show full loading spinner on initial fetch to avoid UI flicker
    if (!hasFetchedRef.current) {
      setIsLoading(true);
    }
    setIsRefreshing(true);
    setError(null);
    setLastDiagnostics(null);
    try {
      // Fetch all pages automatically by following cursors.
      // IMPORTANT: stream each page into state as soon as it arrives so the
      // UI can render the first results immediately instead of blocking on
      // every page completing. Subsequent pages append progressively.
      let allItems: DatastoreItem[] = [];
      let currentCursor: string | undefined = cursorParam;
      let lastResponse: Awaited<ReturnType<typeof getDatastoreByCategory>> | null = null;
      const MAX_PAGES = 10; // Safety limit to prevent infinite loops
      let page = 0;
      const isFreshFetch = !cursorParam;
      let firstPageApplied = false;

      do {
        page++;
        const response = await getDatastoreByCategory(category, currentCursor, undefined, overrideOrgId);
        lastResponse = response;
        setLastDiagnostics(response.diagnostics || null);
        console.log(`[useDatastore] fetchItems category=${category} page=${page} success=${response.success} dataLength=${response.data?.length} cursor=${response.cursor || 'none'}`);

        if (!response.success) {
          // Client-side circuit breaker: transient self-throttle. Don't spam
          // errors — just stop this pass silently and let the next fetch retry.
          if (response.error === 'circuit_breaker_open') {
            console.debug('[useDatastore] fetchItems paused by client-side circuit breaker', { category });
            break;
          }
          console.error('[useDatastore] fetchItems failed', {
            category,
            error: response.error,
            diagnostics: response.diagnostics,
          });
          break;
        }

        const pageItems = response.data || [];
        allItems = [...allItems, ...pageItems];

        if (response.categoryConfig) {
          setCategoryConfig(response.categoryConfig);
        }
        if (response.totalAmount != null) {
          setTotalAmount(response.totalAmount);
        }

        // Progressive render: push results to state after each page.
        if (isFreshFetch) {
          if (!firstPageApplied) {
            // Replace on first page — only if data actually changed (avoids
            // scroll reset when the list is identical to the previous fetch).
            const snapshot = [...allItems];
            setItems(prev => {
              if (prev.length === snapshot.length && prev.every((item, i) => item.key === snapshot[i].key && item.edited === snapshot[i].edited)) {
                return prev;
              }
              return snapshot;
            });
            // Flip hasFetched after first page so the page can exit its
            // initial loading state and start showing rows immediately.
            setIsLoading(false);
            setHasFetched(true);
            hasFetchedRef.current = true;
            firstPageApplied = true;
          } else if (pageItems.length > 0) {
            setItems(prev => [...prev, ...pageItems]);
          }
        } else if (pageItems.length > 0) {
          // Manual pagination call — append each page as it arrives.
          setItems(prev => [...prev, ...pageItems]);
        }

        // The backend hands back a cursor even on the final page. A short
        // page (fewer items than the page size) means there is nothing more
        // to fetch, so stop instead of firing a pointless cursor request.
        // Use rawItemCount (before cross-category filtering) so that category
        // deduplication doesn't falsely truncate pagination when the backend
        // actually has more pages.
        const backendItemsCount = response.rawItemCount ?? pageItems.length;
        if (backendItemsCount < getDatastorePageSize(category)) {
          currentCursor = undefined;
          break;
        }

        currentCursor = response.cursor || undefined;
      } while (currentCursor && page < MAX_PAGES);

      if (lastResponse?.success) {
        if (isFreshFetch && allItems.length === 0 && !firstPageApplied) {
          setItems([]);
        }
        setCursor(currentCursor || null);
        setHasMore(!!currentCursor);
      } else {
        // Don't surface breaker no-ops as a user-visible failure.
        if (lastResponse?.error && lastResponse.error !== 'circuit_breaker_open') {
          setError(lastResponse.error || 'Failed to fetch items');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (!/circuit[_ ]breaker/i.test(msg)) {
        setError(msg);
      }
      setLastDiagnostics({
        operation: 'list',
        category,
        orgId: overrideOrgId || null,
        cursor: cursorParam,
        errorStage: 'unknown',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setHasFetched(true);
      hasFetchedRef.current = true;
    }
  }, [category, overrideOrgId]);

  const fetchNextPage = useCallback(async () => {
    if (cursor && !isLoading) {
      await fetchItems(cursor);
    }
  }, [cursor, isLoading, fetchItems]);

  const resetPagination = useCallback(() => {
    setItems([]);
    setCursor(null);
    setHasMore(false);
  }, []);

  // Reset state and re-fetch when overrideOrgId changes
  const prevOrgIdRef = useRef(overrideOrgId);
  useEffect(() => {
    if (prevOrgIdRef.current !== overrideOrgId) {
      prevOrgIdRef.current = overrideOrgId;
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setTotalAmount(null);
      setHasFetched(false);
      hasFetchedRef.current = false;
      fetchItems();
    }
  }, [overrideOrgId, fetchItems]);

  // Listen to refresh, tenant change, and cross-tenant incident move events
  useEffect(() => {
    const onRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.category || detail.category === category) {
        fetchItems();
      }
    };

    const onOrgChange = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const newOrgId = detail?.orgId;
      if (!overrideOrgId || overrideOrgId === newOrgId) {
        setItems([]);
        setCursor(null);
        setHasMore(false);
        setTotalAmount(null);
        setHasFetched(false);
        hasFetchedRef.current = false;
        fetchItems();
      }
    };

    const onIncidentMoved = () => {
      if (category === 'incidents' || category === 'cases') {
        fetchItems();
      }
    };

    const onIncidentRefresh = () => {
      if (category === 'incidents' || category === 'cases') {
        fetchItems();
      }
    };

    window.addEventListener('demo:refresh', onRefresh);
    window.addEventListener('shuffle:org-change', onOrgChange);
    window.addEventListener('shuffle:incident-moved', onIncidentMoved);
    window.addEventListener('incident:refresh', onIncidentRefresh);

    return () => {
      window.removeEventListener('demo:refresh', onRefresh);
      window.removeEventListener('shuffle:org-change', onOrgChange);
      window.removeEventListener('shuffle:incident-moved', onIncidentMoved);
      window.removeEventListener('incident:refresh', onIncidentRefresh);
    };
  }, [category, fetchItems, overrideOrgId]);

  const addItem = useCallback(async (key: string, value: string | object, skipRefresh = true): Promise<boolean> => {
    setError(null);
    try {
      const response = await setDatastoreItem(key, value, category, overrideOrgId);
      if (response.success) {
        // Only refresh if explicitly requested (default: skip for performance)
        if (!skipRefresh) {
          await fetchItems();
        }
        return true;
      } else {
        setError(response.error || 'Failed to add item');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [category, fetchItems, overrideOrgId]);

  const addItems = useCallback(async (newItems: { key: string; value: string | object }[]): Promise<boolean> => {
    setError(null);
    try {
      const response = await setDatastoreItems(newItems, category);
      if (response.success) {
        await fetchItems(); // Refresh the list
        return true;
      } else {
        setError(response.error || 'Failed to add items');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [category, fetchItems]);

  const getItem = useCallback(async (key: string): Promise<DatastoreItem | null> => {
    setError(null);
    try {
      const response = await getDatastoreItem(key, category, overrideOrgId);
      if (response.success && response.item) {
        return response.item;
      } else {
        setError(response.error || 'Failed to get item');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [category, overrideOrgId]);

  const removeItem = useCallback(async (key: string): Promise<boolean> => {
    setError(null);
    try {
      const response = await deleteDatastoreItem(key, category, overrideOrgId);
      if (response.success) {
        await fetchItems(); // Refresh the list
        return true;
      } else {
        setError(response.error || 'Failed to delete item');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [category, fetchItems]);

  return {
    items,
    isLoading,
    isRefreshing,
    hasFetched,
    error,
    lastDiagnostics,
    cursor,
    hasMore,
    totalAmount,
    categoryConfig,
    fetchItems,
    fetchNextPage,
    resetPagination,
    addItem,
    addItems,
    getItem,
    removeItem,
  };
};
