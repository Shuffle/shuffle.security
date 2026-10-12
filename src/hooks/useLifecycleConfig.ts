/**
 * Tenant lifecycle overrides (status + severity). Mirrors useSlaConfig:
 * localStorage cache, background sync to org_settings.lifecycle_overrides,
 * shared subscribe store. Overrides are applied onto the shared incident
 * config so every view picks them up.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import {
  LifecycleOverrides,
  EMPTY_LIFECYCLE,
  sanitizeLifecycle,
  applyLifecycleOverrides,
} from '@/config/lifecycleOverrides';

const LOCAL_KEY = 'shuffle-lifecycle-overrides';
const DATASTORE_KEY = 'org_settings';

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

let _cached: LifecycleOverrides = EMPTY_LIFECYCLE;
let _cachedRaw: string | null = null;

function readLocal(): string | null {
  try { return localStorage.getItem(LOCAL_KEY); } catch { return null; }
}

function getSnapshot(): LifecycleOverrides {
  const raw = readLocal();
  if (raw === _cachedRaw) return _cached;
  _cachedRaw = raw;
  try { _cached = raw ? sanitizeLifecycle(JSON.parse(raw)) : EMPTY_LIFECYCLE; } catch { _cached = EMPTY_LIFECYCLE; }
  applyLifecycleOverrides(_cached);
  return _cached;
}
const getServerSnapshot = () => EMPTY_LIFECYCLE;

function store(value: LifecycleOverrides) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  _cachedRaw = null;
  getSnapshot();
  listeners.forEach(cb => cb());
}

let _fetched = false;
let _inflight: Promise<void> | null = null;

export async function loadLifecycleConfig(): Promise<void> {
  if (_fetched) return;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        const data = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
        if (data?.lifecycle_overrides) store(sanitizeLifecycle(data.lifecycle_overrides));
      }
      _fetched = true;
    } catch { /* keep cache */ } finally { _inflight = null; }
  })();
  return _inflight;
}

export async function setLifecycleConfig(config: LifecycleOverrides): Promise<boolean> {
  const normalized = sanitizeLifecycle(config);
  store(normalized);
  try {
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
      }
    } catch { /* empty */ }
    const res: any = await setDatastoreItem(
      DATASTORE_KEY,
      { ...existing, lifecycle_overrides: normalized },
      DATASTORE_CATEGORIES.CONFIGURATION,
    );
    return res?.success !== false;
  } catch {
    return false;
  }
}

export function useLifecycleConfig(): LifecycleOverrides {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { if (!_fetched) loadLifecycleConfig(); }, []);
  return value;
}

/** Call once at app start so overrides apply before any page renders. */
export function initLifecycleConfig() {
  if (typeof window === 'undefined') return;
  getSnapshot();
  loadLifecycleConfig();
}
