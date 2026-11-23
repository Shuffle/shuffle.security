import { useEffect, useRef, useState } from 'react';
import { getListPage, readStoredListPage, writeStoredListPage } from './listPaginationState';

interface Options {
  /** localStorage key, normally list name + tenant id. */
  storageKey: string;
  /** Serialized filter/search/sort state; a stored page is only restored when it matches. */
  signature: string;
  totalItems: number;
  itemsPerPage: number;
  isRefreshing: boolean;
  /** Whether the first load has finished; nothing is saved before that. */
  hasFetched: boolean;
  hasMore: boolean;
}

/**
 * Shared page state for every list using ListPaginationBar: restores the page per
 * filter state, resets to page 1 on change, and saves once loading has settled.
 * Spread `barProps` onto ListPaginationBar so all lists behave identically.
 */
export function usePersistentListPage({ storageKey, signature, totalItems, itemsPerPage, isRefreshing, hasFetched, hasMore }: Options) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rememberedTotalPages, setRememberedTotalPages] = useState(0);
  const restoredSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = readStoredListPage(storageKey);
    if (stored && stored.signature === signature) {
      setCurrentPage(Math.max(1, stored.page));
      setRememberedTotalPages(stored.totalPages);
    } else {
      setCurrentPage(1);
      setRememberedTotalPages(0);
    }
    restoredSignatureRef.current = signature;
  }, [storageKey, signature]);

  useEffect(() => {
    if (isRefreshing || !hasFetched || restoredSignatureRef.current !== signature) return;
    writeStoredListPage(storageKey, {
      page: currentPage,
      signature,
      totalPages: Math.max(1, Math.ceil(totalItems / itemsPerPage)),
      hasMore,
    });
  }, [currentPage, isRefreshing, hasFetched, signature, storageKey, totalItems, itemsPerPage, hasMore]);

  const visiblePage = getListPage(currentPage, totalItems, itemsPerPage);

  return {
    currentPage,
    setCurrentPage,
    visiblePage,
    barProps: {
      currentPage,
      onPageChange: setCurrentPage,
      isRefreshing,
      rememberedTotalPages,
      totalItems,
      itemsPerPage,
    },
  };
}
