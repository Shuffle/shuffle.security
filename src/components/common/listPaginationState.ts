/** Keep list navigation and slicing within the currently available rows. */
export function getListPage(currentPage: number, totalItems: number, itemsPerPage: number): number {
  return Math.max(1, Math.min(currentPage, Math.max(1, Math.ceil(totalItems / itemsPerPage))));
}
/** Below this many loaded pages, a list that is still loading shows a loading bar instead of page numbers. */
export const SETTLED_PAGE_COUNT = 5;

/** Whether the bar should keep showing its loading state instead of a still-growing page list. */
export function isPaginationSettling(loadedPages: number, isRefreshing: boolean): boolean {
  return isRefreshing && loadedPages < SETTLED_PAGE_COUNT;
}

export interface StoredListPage {
  page: number;
  signature: string;
  totalPages: number;
  hasMore: boolean;
  savedAt: number;
}

const STORED_PAGE_TTL_MS = 24 * 60 * 60 * 1000;

export function readStoredListPage(storageKey: string): StoredListPage | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredListPage;
    if (!parsed || typeof parsed.page !== 'number' || Date.now() - (parsed.savedAt || 0) > STORED_PAGE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredListPage(storageKey: string, value: Omit<StoredListPage, 'savedAt'>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    // Storage may be full or unavailable; remembering the page is best effort.
  }
}
