/**
 * Tenant-level SLA / SLO controls, stored in org_settings next to `sla`.
 *
 *   sla_controls.incidentSlaEnabled  incident SLA timers on/off
 *   sla_controls.taskSlaEnabled      task SLA timers on/off
 *   sla_controls.taskTargets         per task category "complete within" (minutes)
 *   sla_controls.sloEnabled          SLO attainment tracking on/off (independent of SLA)
 *   sla_controls.incidentSloPercent  target % of incidents within SLA
 *   sla_controls.taskSloPercent      target % of tasks within SLA
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { taskCategories } from '@/config/ocsfIncidentSchema';

export interface SlaControls {
  incidentSlaEnabled: boolean;
  taskSlaEnabled: boolean;
  taskTargets: Record<string, number>;
  sloEnabled: boolean;
  incidentSloPercent: number;
  taskSloPercent: number;
}

export const TASK_SLA_CATEGORIES: { value: string; label: string; color: string }[] = [
  ...taskCategories,
  { value: 'general', label: 'General (no category)', color: '#94a3b8' },
];

export const DEFAULT_TASK_SLA_TARGETS: Record<string, number> = {
  triage: 60,
  investigation: 8 * 60,
  containment: 4 * 60,
  eradication: 24 * 60,
  recovery: 72 * 60,
  communication: 4 * 60,
  documentation: 72 * 60,
  general: 24 * 60,
};

export const DEFAULT_SLA_CONTROLS: SlaControls = {
  incidentSlaEnabled: true,
  taskSlaEnabled: false,
  taskTargets: DEFAULT_TASK_SLA_TARGETS,
  sloEnabled: false,
  incidentSloPercent: 95,
  taskSloPercent: 90,
};

const LOCAL_KEY = 'shuffle-sla-controls';
const DATASTORE_KEY = 'org_settings';
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const notify = () => listeners.forEach(cb => cb());

const pct = (v: unknown, d: number) => (typeof v === 'number' && v > 0 && v <= 100 ? v : d);

export function normalizeSlaControls(input: unknown): SlaControls {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const rawTargets = (i.taskTargets && typeof i.taskTargets === 'object' ? i.taskTargets : {}) as Record<string, unknown>;
  const taskTargets: Record<string, number> = { ...DEFAULT_TASK_SLA_TARGETS };
  for (const [k, v] of Object.entries(rawTargets)) {
    if (typeof v === 'number' && v > 0) taskTargets[k] = Math.floor(v);
  }
  return {
    incidentSlaEnabled: typeof i.incidentSlaEnabled === 'boolean' ? i.incidentSlaEnabled : DEFAULT_SLA_CONTROLS.incidentSlaEnabled,
    taskSlaEnabled: typeof i.taskSlaEnabled === 'boolean' ? i.taskSlaEnabled : DEFAULT_SLA_CONTROLS.taskSlaEnabled,
    taskTargets,
    sloEnabled: typeof i.sloEnabled === 'boolean' ? i.sloEnabled : DEFAULT_SLA_CONTROLS.sloEnabled,
    incidentSloPercent: pct(i.incidentSloPercent, DEFAULT_SLA_CONTROLS.incidentSloPercent),
    taskSloPercent: pct(i.taskSloPercent, DEFAULT_SLA_CONTROLS.taskSloPercent),
  };
}

let _cached = DEFAULT_SLA_CONTROLS;
let _cachedRaw: string | null = null;
function getSnapshot(): SlaControls {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCAL_KEY);
  if (raw === _cachedRaw) return _cached;
  _cachedRaw = raw;
  try { _cached = raw ? normalizeSlaControls(JSON.parse(raw)) : DEFAULT_SLA_CONTROLS; } catch { _cached = DEFAULT_SLA_CONTROLS; }
  return _cached;
}
const getServerSnapshot = () => DEFAULT_SLA_CONTROLS;

let _fetched = false;
let _inflight: Promise<void> | null = null;
async function readOrgSettings(): Promise<Record<string, unknown>> {
  const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
  if (result.success && result.item?.value) {
    return typeof result.item.value === 'string' ? JSON.parse(result.item.value) : result.item.value;
  }
  return {};
}

export async function loadSlaControls(): Promise<void> {
  if (_fetched) return;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const data = await readOrgSettings();
      if (data?.sla_controls) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(normalizeSlaControls(data.sla_controls)));
        _cachedRaw = null;
        notify();
      }
      _fetched = true;
    } catch { /* keep local cache */ } finally { _inflight = null; }
  })();
  return _inflight;
}

export async function setSlaControls(next: SlaControls) {
  const normalized = normalizeSlaControls(next);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized));
  _cachedRaw = null;
  notify();
  try {
    let existing: Record<string, unknown> = {};
    try { existing = await readOrgSettings(); } catch { /* empty */ }
    await setDatastoreItem(DATASTORE_KEY, { ...existing, sla_controls: normalized }, DATASTORE_CATEGORIES.CONFIGURATION);
  } catch { /* local cache already set */ }
}

export function useSlaControls(): SlaControls {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { if (!_fetched) loadSlaControls(); }, []);
  return value;
}
