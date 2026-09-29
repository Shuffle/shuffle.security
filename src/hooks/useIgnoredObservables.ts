/**
 * useIgnoredObservables — per-org list of observables the user has marked as
 * "uninteresting" so they are hidden from the default observables view.
 *
 * Storage: Shuffle datastore, category `ignored-observables`.
 * Key:     encoded via `encodeCompositeKey(type, value)` so the persisted
 *          key survives `normalizeDatastoreKey`'s legacy `::` stripping.
 *          See `src/utils/compositeKey.ts` for the rationale.
 * Value:   { type, value, reason?, ignored_at } — JSON, so we can show
 *          context later (who/why/when) without another API.
 *
 * Behaviour:
 * - Fetch the full list ONCE on mount.
 * - From then on, keep a local copy in this hook. ignore/unignore mutate the
 *   local set immediately (optimistic) and fire the API call in the background.
 * - We never re-list the category; the local copy is the source of truth for
 *   the rest of the session. This avoids the "item disappears, then comes
 *   back" flicker caused by the datastore hook re-fetching after every write.
 *
 * The datastore itself is org-scoped (the API derives the active org from the
 * session), so this list is automatically per-org without any extra wiring.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDatastoreByCategory,
  setDatastoreItem,
  deleteDatastoreItem,
} from '@/Shuffle-Core/datastore';
import {
  canonicalCompositeKey,
  encodeCompositeKey,
  decodeCompositeKey,
  toCanonicalCompositeKey,
} from '@/utils/compositeKey';

export const IGNORED_OBSERVABLES_CATEGORY = 'ignored-observables';

export interface IgnoredObservableEntry {
  type: string;
  value: string;
  reason?: string;
  ignored_at: number;
}

/** Canonical in-memory key for an observable. Re-exported so other modules
 *  that need to coordinate with this set use the exact same form. */
export const ignoredObservableKey = (type: string, value: string): string =>
  canonicalCompositeKey(type, value);

interface LocalEntry {
  storageKey: string; // what we'd send to the API to delete this row
  entry: IgnoredObservableEntry;
}

const decodeValue = (storedKey: string, raw: unknown): IgnoredObservableEntry => {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      // Trust the JSON payload's type/value since legacy storage may have lost
      // the type segment in the key itself.
      if (parsed && typeof parsed === 'object' && parsed.type && parsed.value) {
        return parsed as IgnoredObservableEntry;
      }
    } catch { /* fall through to key-based decode */ }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Partial<IgnoredObservableEntry>;
    if (obj.type && obj.value) return obj as IgnoredObservableEntry;
  }
  const { type, value } = decodeCompositeKey(storedKey);
  return { type, value, ignored_at: 0 };
};

export const useIgnoredObservables = () => {
  const [local, setLocal] = useState<Map<string, LocalEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // One-shot fetch on mount. We deliberately do NOT re-list after writes.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        let cursor: string | undefined;
        const next = new Map<string, LocalEntry>();
        const MAX_PAGES = 10;
        for (let page = 0; page < MAX_PAGES; page++) {
          const response = await getDatastoreByCategory(IGNORED_OBSERVABLES_CATEGORY, cursor);
          if (!response.success) {
            if (!cancelled) setError(response.error || 'Failed to load ignored observables');
            break;
          }
          for (const item of response.data || []) {
            if (!item?.key) continue;
            const entry = decodeValue(item.key, item.value);
            // Always key the local map by canonical (type::value) so lookups
            // by `(obs.type, obs.value)` match regardless of how the row was
            // originally stored (legacy `::`, new `||`, or value-only).
            const k = canonicalCompositeKey(entry.type, entry.value)
              || toCanonicalCompositeKey(item.key);
            if (!k) continue;
            next.set(k, { storageKey: item.key, entry });
          }
          cursor = response.cursor || undefined;
          if (!cursor) break;
        }
        if (!cancelled) setLocal(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasFetched(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ignoredKeys = useMemo(() => new Set(local.keys()), [local]);
  const entries = useMemo(() => Array.from(local.values()).map(v => v.entry), [local]);

  const isIgnored = useCallback(
    (type: string, value: string) => local.has(canonicalCompositeKey(type, value)),
    [local],
  );

  /** Type-agnostic check: is there ANY ignored observable with this raw value?
   *  Useful when consumers (e.g. correlations) only have a value, not a type. */
  const ignoredValues = useMemo(() => {
    const s = new Set<string>();
    for (const { entry } of local.values()) {
      if (entry?.value) s.add(String(entry.value).toLowerCase());
    }
    return s;
  }, [local]);
  const isValueIgnored = useCallback(
    (value: string) => !!value && ignoredValues.has(String(value).toLowerCase()),
    [ignoredValues],
  );

  const ignore = useCallback(
    async (type: string, value: string, reason?: string) => {
      const canonical = canonicalCompositeKey(type, value);
      const storageKey = encodeCompositeKey(type, value);
      const payload: IgnoredObservableEntry = {
        type,
        value,
        reason,
        ignored_at: Date.now(),
      };
      // Optimistic — update the local map immediately.
      let prev: Map<string, LocalEntry> | null = null;
      setLocal(curr => {
        prev = curr;
        const next = new Map(curr);
        next.set(canonical, { storageKey, entry: payload });
        return next;
      });
      try {
        const response = await setDatastoreItem(storageKey, payload, IGNORED_OBSERVABLES_CATEGORY);
        if (!response.success) {
          if (prev) setLocal(prev);
          setError(response.error || 'Failed to ignore observable');
          return false;
        }
        return true;
      } catch (err) {
        if (prev) setLocal(prev);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      }
    },
    [],
  );

  const unignore = useCallback(
    async (type: string, value: string) => {
      const canonical = canonicalCompositeKey(type, value);
      let prev: Map<string, LocalEntry> | null = null;
      let storageKey = encodeCompositeKey(type, value);
      setLocal(curr => {
        prev = curr;
        const existing = curr.get(canonical);
        if (existing) storageKey = existing.storageKey; // delete the row we actually loaded
        if (!curr.has(canonical)) return curr;
        const next = new Map(curr);
        next.delete(canonical);
        return next;
      });
      try {
        const response = await deleteDatastoreItem(storageKey, IGNORED_OBSERVABLES_CATEGORY);
        if (!response.success) {
          if (prev) setLocal(prev);
          setError(response.error || 'Failed to unignore observable');
          return false;
        }
        return true;
      } catch (err) {
        if (prev) setLocal(prev);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      }
    },
    [],
  );

  const refetch = useCallback(async () => {
    fetchedRef.current = false;
    setHasFetched(false);
  }, []);

  return {
    isLoading,
    hasFetched,
    error,
    ignoredKeys,
    ignoredValues,
    entries,
    isIgnored,
    isValueIgnored,
    ignore,
    unignore,
    refetch,
  };
};
