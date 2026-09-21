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
} from '@shuffleio/shuffle-mcps';

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
      // Fetch all pages automatically by following cursors
      let allItems: DatastoreItem[] = [];
      let currentCursor: string | undefined = cursorParam;
      let lastResponse: Awaited<ReturnType<typeof getDatastoreByCategory>> | null = null;
      const MAX_PAGES = 10; // Safety limit to prevent infinite loops
      let page = 0;

      do {
        page++;
        const response = await getDatastoreByCategory(category, currentCursor);
        lastResponse = response;
        setLastDiagnostics(response.diagnostics || null);
        console.log(`[useDatastore] fetchItems category=${category} page=${page} success=${response.success} dataLength=${response.data?.length} cursor=${response.cursor || 'none'}`);

        if (!response.success) {
          console.error('[useDatastore] fetchItems failed', {
            category,
            error: response.error,
            diagnostics: response.diagnostics,
          });
          break;
        }

        if (response.data) {
          allItems = [...allItems, ...response.data];
        }

        if (response.categoryConfig) {
          setCategoryConfig(response.categoryConfig);
        }
        if (response.totalAmount != null) {
          setTotalAmount(response.totalAmount);
        }

        // A short page means this was the last one — the backend still
        // returns a cursor there, so don't chase it.
        // Use rawItemCount so cross-category filtering doesn't stop pagination early.
        const backendItemsCount = response.rawItemCount ?? (response.data?.length || 0);
        if (backendItemsCount < getDatastorePageSize(category)) {
          currentCursor = undefined;
          break;
        }

        currentCursor = response.cursor || undefined;
      } while (currentCursor && page < MAX_PAGES);

      if (lastResponse?.success && allItems.length > 0) {
        if (cursorParam) {
          // Manual pagination call — append
          setItems(prev => [...prev, ...allItems]);
        } else {
          // Fresh fetch — only update if data actually changed to avoid scroll reset
          setItems(prev => {
            if (prev.length === allItems.length && prev.every((item, i) => item.key === allItems[i].key && item.edited === allItems[i].edited)) {
              return prev;
            }
            return allItems;
          });
        }
        setCursor(currentCursor || null);
        setHasMore(!!currentCursor);
      } else if (lastResponse?.success && allItems.length === 0) {
        if (!cursorParam) {
          setItems([]);
        }
        setCursor(null);
        setHasMore(false);
      } else {
        setError(lastResponse?.error || 'Failed to fetch items');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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

  // Demo Mode: if data was just seeded for our category, refetch so the open
  // page updates live as the user advances through the tour.
  useEffect(() => {
    const onRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.category === category) {
        fetchItems();
      }
    };
    window.addEventListener('demo:refresh', onRefresh);
    return () => window.removeEventListener('demo:refresh', onRefresh);
  }, [category, fetchItems]);

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
      const response = await deleteDatastoreItem(key, category);
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
