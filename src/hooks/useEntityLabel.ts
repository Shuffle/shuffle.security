import { useLocation } from '@/lib/router-compat';
import { useMemo, useEffect, useCallback, useSyncExternalStore } from 'react';
import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { SIDEBAR_NAV, ALL_SIDEBAR_KEYS, SIDEBAR_DEFAULT_VISIBILITY, SidebarItemKey } from '@/config/sidebarNav';
import { applyEntityTerminology } from '@/lib/entityTerminology';

export const ENTITY_OPTIONS = [
  { value: 'incidents', singular: 'Incident', plural: 'Incidents', path: '/incidents' },
  { value: 'alerts', singular: 'Alert', plural: 'Alerts', path: '/alerts' },
  { value: 'cases', singular: 'Case', plural: 'Cases', path: '/cases' },
  { value: 'tickets', singular: 'Ticket', plural: 'Tickets', path: '/tickets' },
  { value: 'jobs', singular: 'Job', plural: 'Jobs', path: '/jobs' },
] as const;

export type EntityValue = (typeof ENTITY_OPTIONS)[number]['value'];

const LOCAL_CACHE_KEY = 'shuffle-entity-label';
const LOCAL_AUTOMATION_KEY = 'shuffle-show-automation';
const LOCAL_AUTO_MERGE_THREAD_KEY = 'shuffle-auto-merge-thread';

const LOCAL_SIDEBAR_TABS_KEY = 'shuffle-sidebar-tabs';
const LOCAL_TASK_STATUSES_KEY = 'shuffle-task-statuses';
const DATASTORE_KEY = 'org_settings';
const DEFAULT: EntityValue = 'incidents';

// ---------------------------------------------------------------------------
// Task statuses (kanban lanes on /incidents-simple/<id>)
// ---------------------------------------------------------------------------
// Stored as an ordered list. The `done` lane is special (it represents
// `task.completed === true`) and must always exist — it can be renamed/recolored
// but not removed. Other lanes can be added/removed/renamed by the org.

export interface TaskStatusOption {
  /** Stable key used by the kanban routing logic. The first non-`done` key
   *  is treated as the default "todo" lane and the others act as in-progress
   *  variants. `done` is a reserved special key that maps to `completed`. */
  key: string;
  label: string;
  /** Tailwind/HSL hex — used for the lane header dot and hover ring. */
  color: string;
}

export const DEFAULT_TASK_STATUSES: TaskStatusOption[] = [
  { key: 'todo', label: 'To Do', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'done', label: 'Done', color: '#22c55e' },
];

// ---------------------------------------------------------------------------
// Sidebar tab visibility
// ---------------------------------------------------------------------------
// Both the sidebar and the /preferences toggles are driven by the SAME
// declarative tree in `src/config/sidebarNav.tsx`. The persisted shape here
// is just `{ [SidebarItemKey]: boolean }` — adding a new key in the nav
// config automatically gets a default-true entry below, so newly-added
// items show up in both places without any data migration.
//
// `SidebarTabKey` is re-exported as the original alias so existing call
// sites (AppSidebar, etc.) keep compiling, but it now points at the shared
// SidebarItemKey union.
export type SidebarTabKey = SidebarItemKey;

/** Legacy export kept so downstream code can still import the option list.
 *  Synthesised from SIDEBAR_NAV with `parent` populated, in tree order. */
export const SIDEBAR_TAB_OPTIONS: ReadonlyArray<{
  key: SidebarTabKey;
  label: string;
  parent: SidebarTabKey | null;
}> = SIDEBAR_NAV.flatMap((item) => [
  { key: item.tabKey, label: item.label, parent: null as SidebarTabKey | null },
  ...(item.children?.map((c) => ({ key: c.tabKey, label: c.label, parent: item.tabKey })) ?? []),
]);

// Per-key default visibility — derived from the shared nav config. Items
// can opt out by setting `defaultVisible: false` in `sidebarNav.tsx`.
const DEFAULT_SIDEBAR_TABS: Record<SidebarTabKey, boolean> = ALL_SIDEBAR_KEYS.reduce(
  (acc, key) => { acc[key] = SIDEBAR_DEFAULT_VISIBILITY[key] ?? true; return acc; },
  {} as Record<SidebarTabKey, boolean>,
);

// Shared external store so all consumers react to changes instantly
const listeners = new Set<() => void>();
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getSnapshot(): EntityValue {
  return (localStorage.getItem(LOCAL_CACHE_KEY) as EntityValue) || DEFAULT;
}
function getAutomationSnapshot(): boolean {
  const val = localStorage.getItem(LOCAL_AUTOMATION_KEY);
  return val === null ? true : val === 'true';
}
function getAutoMergeThreadSnapshot(): boolean {
  const val = localStorage.getItem(LOCAL_AUTO_MERGE_THREAD_KEY);
  return val === null ? true : val === 'true';
}

let _cachedSidebarTabs: Record<SidebarTabKey, boolean> = DEFAULT_SIDEBAR_TABS;
let _cachedSidebarTabsRaw: string | null = null;

function getSidebarTabsSnapshot(): Record<SidebarTabKey, boolean> {
  const raw = localStorage.getItem(LOCAL_SIDEBAR_TABS_KEY);
  if (raw === _cachedSidebarTabsRaw) return _cachedSidebarTabs;
  _cachedSidebarTabsRaw = raw;
  try {
    if (raw) {
      // Merge over defaults so newly-added items default to visible, and
      // drop any persisted keys that no longer exist in the current nav
      // tree (avoids ghost toggles after a rename/removal in sidebarNav).
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged = { ...DEFAULT_SIDEBAR_TABS };
      for (const k of ALL_SIDEBAR_KEYS) {
        if (typeof parsed[k] === 'boolean') merged[k] = parsed[k] as boolean;
      }
      _cachedSidebarTabs = merged;
    } else {
      _cachedSidebarTabs = DEFAULT_SIDEBAR_TABS;
    }
  } catch {
    _cachedSidebarTabs = DEFAULT_SIDEBAR_TABS;
  }
  return _cachedSidebarTabs;
}

// Task statuses snapshot — also memoised by raw string so identity is stable
// across renders (required by useSyncExternalStore to avoid render loops).
let _cachedTaskStatuses: TaskStatusOption[] = DEFAULT_TASK_STATUSES;
let _cachedTaskStatusesRaw: string | null = null;

function normalizeTaskStatuses(arr: unknown): TaskStatusOption[] {
  if (!Array.isArray(arr)) return DEFAULT_TASK_STATUSES;
  const cleaned: TaskStatusOption[] = [];
  for (const item of arr) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as TaskStatusOption).key === 'string' &&
      typeof (item as TaskStatusOption).label === 'string' &&
      typeof (item as TaskStatusOption).color === 'string'
    ) {
      cleaned.push({
        key: (item as TaskStatusOption).key,
        label: (item as TaskStatusOption).label,
        color: (item as TaskStatusOption).color,
      });
    }
  }
  // The `done` lane is required — if it was removed, restore it at the end.
  if (!cleaned.some((s) => s.key === 'done')) {
    cleaned.push(DEFAULT_TASK_STATUSES[DEFAULT_TASK_STATUSES.length - 1]);
  }
  return cleaned.length > 0 ? cleaned : DEFAULT_TASK_STATUSES;
}

function getTaskStatusesSnapshot(): TaskStatusOption[] {
  const raw = localStorage.getItem(LOCAL_TASK_STATUSES_KEY);
  if (raw === _cachedTaskStatusesRaw) return _cachedTaskStatuses;
  _cachedTaskStatusesRaw = raw;
  try {
    _cachedTaskStatuses = raw ? normalizeTaskStatuses(JSON.parse(raw)) : DEFAULT_TASK_STATUSES;
  } catch {
    _cachedTaskStatuses = DEFAULT_TASK_STATUSES;
  }
  return _cachedTaskStatuses;
}

let _fetchedFromServer = false;
// In-flight request — multiple hooks mount in parallel on page load (entity
// label, sidebar tabs, task statuses, automation toggle, etc.) and all called
// `loadEntityPreference` before the first await resolved, causing N duplicate
// /get_cache requests for the same `org_settings` key. Sharing the promise
// collapses them into one.
let _inflight: Promise<void> | null = null;

/** Load org setting from datastore and sync to local cache */
export async function loadEntityPreference(): Promise<void> {
  if (_fetchedFromServer) return;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        const data = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
        const val = data?.entity_label;
        if (val && ENTITY_OPTIONS.some(o => o.value === val)) {
          localStorage.setItem(LOCAL_CACHE_KEY, val);
        }
        if (data?.show_automation !== undefined) {
          localStorage.setItem(LOCAL_AUTOMATION_KEY, String(data.show_automation));
        }
        if (data?.auto_merge_thread !== undefined) {
          localStorage.setItem(LOCAL_AUTO_MERGE_THREAD_KEY, String(data.auto_merge_thread));
        }

        if (data?.sidebar_tabs !== undefined) {
          localStorage.setItem(LOCAL_SIDEBAR_TABS_KEY, JSON.stringify(data.sidebar_tabs));
        }
        if (data?.task_statuses !== undefined) {
          localStorage.setItem(LOCAL_TASK_STATUSES_KEY, JSON.stringify(normalizeTaskStatuses(data.task_statuses)));
        }
        listeners.forEach(cb => cb());
      }
      _fetchedFromServer = true;
    } catch {
      // keep local cache; allow a future retry by clearing the inflight ref
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

/** Save preference to both local cache and org datastore */
export async function setEntityPreference(value: EntityValue) {
  localStorage.setItem(LOCAL_CACHE_KEY, value);
  listeners.forEach(cb => cb());

  try {
    // Read existing org_settings, merge, and save
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
      }
    } catch { /* empty */ }
    await setDatastoreItem(DATASTORE_KEY, { ...existing, entity_label: value }, DATASTORE_CATEGORIES.CONFIGURATION);
  } catch {
    // local cache is already set, datastore save failed silently
  }
}

export function getEntityPreference(): EntityValue {
  return getSnapshot();
}

/** Save automation visibility preference */
export async function setShowAutomation(show: boolean) {
  localStorage.setItem(LOCAL_AUTOMATION_KEY, String(show));
  listeners.forEach(cb => cb());

  try {
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
      }
    } catch { /* empty */ }
    await setDatastoreItem(DATASTORE_KEY, { ...existing, show_automation: show }, DATASTORE_CATEGORIES.CONFIGURATION);
  } catch { /* local cache is already set */ }
}

/** Hook to read automation visibility preference */
export function useShowAutomation(): boolean {
  const value = useSyncExternalStore(subscribe, getAutomationSnapshot, getAutomationSnapshot);

  useEffect(() => {
    if (!_fetchedFromServer) loadEntityPreference();
  }, []);

  return value;
}

/** Save auto-merge-thread preference (enabled by default) */
export async function setAutoMergeThread(enabled: boolean) {
  localStorage.setItem(LOCAL_AUTO_MERGE_THREAD_KEY, String(enabled));
  listeners.forEach(cb => cb());

  try {
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
      }
    } catch { /* empty */ }
    await setDatastoreItem(DATASTORE_KEY, { ...existing, auto_merge_thread: enabled }, DATASTORE_CATEGORIES.CONFIGURATION);
  } catch { /* local cache is already set */ }
}

/** Hook to read auto-merge-thread preference (defaults to true) */
export function useAutoMergeThread(): boolean {
  const value = useSyncExternalStore(subscribe, getAutoMergeThreadSnapshot, getAutoMergeThreadSnapshot);

  useEffect(() => {
    if (!_fetchedFromServer) loadEntityPreference();
  }, []);

  return value;
}




/** Returns the preferred entity labels and base path.
 *  If currently on an alias route (/alerts, /tickets, /jobs), uses that route's labels instead. */
export function useEntityLabel() {
  const { pathname } = useLocation();
  const preference = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Load from server on first mount
  useEffect(() => {
    if (!_fetchedFromServer) loadEntityPreference();
  }, []);

  return useMemo(() => {
    // If the current route matches an alias, use that alias's labels
    const routeMatch = ENTITY_OPTIONS.find(o => pathname.startsWith(o.path) && o.value !== 'incidents');
    if (routeMatch) {
      return { singular: routeMatch.singular, plural: routeMatch.plural, basePath: routeMatch.path };
    }
    // Otherwise use the stored preference
    const pref = ENTITY_OPTIONS.find(o => o.value === preference) || ENTITY_OPTIONS[0];
    return { singular: pref.singular, plural: pref.plural, basePath: pref.path };
  }, [pathname, preference]);
}

/** Returns just the stored preference (for sidebar/nav, not route-dependent) */
export function useEntityPreference() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!_fetchedFromServer) loadEntityPreference();
  }, []);

  return useMemo(() => {
    const pref = ENTITY_OPTIONS.find(o => o.value === preference) || ENTITY_OPTIONS[0];
    return { singular: pref.singular, plural: pref.plural, basePath: pref.path, value: pref.value };
  }, [preference]);
}

/** Returns a `t()` function that rewrites the words "incident"/"incidents" in
 *  any user-facing string to match the org's configured terminology (Alert,
 *  Case, Ticket, Job). Use everywhere we render copy that mentions incidents.
 *
 *  Example:
 *    const t = useEntityText();
 *    toast.error(t('Incident not found'));
 *    <Typography>{t('Search incidents…')}</Typography>
 */
export function useEntityText() {
  const { singular, plural } = useEntityLabel();
  return useCallback(
    (text: string) => applyEntityTerminology(text, singular, plural),
    [singular, plural],
  );
}

/** Non-React lookup of the current terminology — for use in services,
 *  contexts, and other places that cannot call hooks. Reads the cached
 *  preference (which is hydrated from the datastore on app boot). */
export function getEntityTerminology(): { singular: string; plural: string } {
  const pref = ENTITY_OPTIONS.find(o => o.value === getSnapshot()) || ENTITY_OPTIONS[0];
  return { singular: pref.singular, plural: pref.plural };
}

/** Save sidebar tab visibility */
export async function setSidebarTabVisibility(tabs: Record<SidebarTabKey, boolean>) {
  localStorage.setItem(LOCAL_SIDEBAR_TABS_KEY, JSON.stringify(tabs));
  listeners.forEach(cb => cb());

  try {
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
      }
    } catch { /* empty */ }
    await setDatastoreItem(DATASTORE_KEY, { ...existing, sidebar_tabs: tabs }, DATASTORE_CATEGORIES.CONFIGURATION);
  } catch { /* local cache is already set */ }
}

/** Hook to read sidebar tab visibility */
export function useSidebarTabs(): Record<SidebarTabKey, boolean> {
  const value = useSyncExternalStore(subscribe, getSidebarTabsSnapshot, getSidebarTabsSnapshot);

  useEffect(() => {
    if (!_fetchedFromServer) loadEntityPreference();
  }, []);

  return value;
}

// ---------------------------------------------------------------------------
// Task statuses — kanban lanes for /incidents-simple/<id>
// ---------------------------------------------------------------------------

/** Save the org's task status configuration. The `done` lane is forced to
 *  remain present (renamed/recoloured but never removed). */
export async function setTaskStatuses(statuses: TaskStatusOption[]) {
  const normalized = normalizeTaskStatuses(statuses);
  localStorage.setItem(LOCAL_TASK_STATUSES_KEY, JSON.stringify(normalized));
  _cachedTaskStatusesRaw = null;
  listeners.forEach((cb) => cb());

  try {
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
      }
    } catch { /* empty */ }
    await setDatastoreItem(
      DATASTORE_KEY,
      { ...existing, task_statuses: normalized },
      DATASTORE_CATEGORIES.CONFIGURATION,
    );
  } catch {
    // local cache already set
  }
}

/** Hook to read the org's configured task statuses. Defaults to the built-in
 *  three-lane setup (To Do / In Progress / Done). */
export function useTaskStatuses(): TaskStatusOption[] {
  const value = useSyncExternalStore(subscribe, getTaskStatusesSnapshot, getTaskStatusesSnapshot);

  useEffect(() => {
    if (!_fetchedFromServer) loadEntityPreference();
  }, []);

  return value;
}
