/**
 * SLA configuration — per-severity response & resolution targets used to
 * track incident timeliness on /incidents.
 *
 * Defaults are aligned with widely-used incident response baselines
 * (NIST SP 800-61, FIRST CSIRT services framework, common MSSP playbooks):
 *
 *   Severity    Respond within   Resolve within
 *   ─────────────────────────────────────────────
 *   Critical    15 min            4 h
 *   High        1 h               8 h
 *   Medium      4 h               24 h (1 business day)
 *   Low         24 h              72 h (3 business days)
 *   Fallback    8 h               40 h (5 business days)
 *
 * Times are stored in MINUTES so the UI can render them in the most natural
 * unit per row (minutes / hours / days) without losing precision.
 *
 * Persistence mirrors the other org_settings entries (see useEntityLabel.ts):
 * cache to localStorage immediately, sync to the org datastore in the
 * background, and broadcast via the shared subscribe()/listeners pattern so
 * every consumer re-renders instantly.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';

export type SlaSeverity = 'critical' | 'high' | 'medium' | 'low' | 'fallback';

export interface SlaTarget {
  /** Time (in minutes) the team has to acknowledge / first-respond. */
  respondMinutes: number;
  /** Time (in minutes) the team has to fully resolve the incident. */
  resolveMinutes: number;
}

export type SlaConfig = Record<SlaSeverity, SlaTarget>;

export const SLA_SEVERITY_ORDER: SlaSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'fallback',
];

export const SLA_SEVERITY_META: Record<SlaSeverity, { label: string; description: string; color: string }> = {
  critical: {
    label: 'Critical',
    description: 'Active breach, ransomware, business-impacting outage',
    color: 'hsl(0, 84%, 60%)',
  },
  high: {
    label: 'High',
    description: 'Confirmed compromise of a single host or account',
    color: 'hsl(25, 95%, 55%)',
  },
  medium: {
    label: 'Medium',
    description: 'Suspicious activity needing investigation',
    color: 'hsl(45, 93%, 50%)',
  },
  low: {
    label: 'Low',
    description: 'Informational findings, policy violations',
    color: 'hsl(210, 80%, 55%)',
  },
  fallback: {
    label: 'Fallback (no severity)',
    description: 'Used when an incident has no severity set',
    color: 'hsl(215, 16%, 47%)',
  },
};

/** Industry-aligned defaults — see file header for sourcing. */
export const DEFAULT_SLA_CONFIG: SlaConfig = {
  critical: { respondMinutes: 15, resolveMinutes: 4 * 60 },
  high:     { respondMinutes: 60, resolveMinutes: 8 * 60 },
  medium:   { respondMinutes: 4 * 60, resolveMinutes: 24 * 60 },
  low:      { respondMinutes: 24 * 60, resolveMinutes: 72 * 60 },
  fallback: { respondMinutes: 8 * 60, resolveMinutes: 40 * 60 },
};

const LOCAL_SLA_KEY = 'shuffle-sla-config';
const DATASTORE_KEY = 'org_settings';

// Shared external store — own listener set so this hook stays self-contained
// and doesn't depend on useEntityLabel's internal `listeners` constant.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

let _cached: SlaConfig = DEFAULT_SLA_CONFIG;
let _cachedRaw: string | null = null;

function normalize(input: unknown): SlaConfig {
  const out: SlaConfig = { ...DEFAULT_SLA_CONFIG };
  if (input && typeof input === 'object') {
    for (const sev of SLA_SEVERITY_ORDER) {
      const entry = (input as Record<string, unknown>)[sev];
      if (entry && typeof entry === 'object') {
        const r = (entry as Record<string, unknown>).respondMinutes;
        const f = (entry as Record<string, unknown>).resolveMinutes;
        out[sev] = {
          respondMinutes: typeof r === 'number' && r > 0 ? Math.floor(r) : DEFAULT_SLA_CONFIG[sev].respondMinutes,
          resolveMinutes: typeof f === 'number' && f > 0 ? Math.floor(f) : DEFAULT_SLA_CONFIG[sev].resolveMinutes,
        };
      }
    }
  }
  return out;
}

function getSnapshot(): SlaConfig {
  const raw = localStorage.getItem(LOCAL_SLA_KEY);
  if (raw === _cachedRaw) return _cached;
  _cachedRaw = raw;
  try {
    _cached = raw ? normalize(JSON.parse(raw)) : DEFAULT_SLA_CONFIG;
  } catch {
    _cached = DEFAULT_SLA_CONFIG;
  }
  return _cached;
}

let _fetched = false;
let _inflight: Promise<void> | null = null;

/** Load the SLA config from the org datastore on first use. */
export async function loadSlaConfig(): Promise<void> {
  if (_fetched) return;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        const data = typeof result.item.value === 'string'
          ? JSON.parse(result.item.value)
          : result.item.value;
        if (data?.sla) {
          localStorage.setItem(LOCAL_SLA_KEY, JSON.stringify(normalize(data.sla)));
          _cachedRaw = null;
          listeners.forEach(cb => cb());
        }
      }
      _fetched = true;
    } catch {
      // keep local cache; allow retry next mount
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/** Save the org's SLA config. Mirrors the merge-then-save pattern used by
 *  the other org_settings helpers so we never clobber sibling preferences. */
export async function setSlaConfig(config: SlaConfig) {
  const normalized = normalize(config);
  localStorage.setItem(LOCAL_SLA_KEY, JSON.stringify(normalized));
  _cachedRaw = null;
  listeners.forEach(cb => cb());

  try {
    let existing: Record<string, unknown> = {};
    try {
      const result = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
      if (result.success && result.item?.value) {
        existing = typeof result.item.value === 'string'
          ? JSON.parse(result.item.value)
          : result.item.value;
      }
    } catch { /* empty */ }
    await setDatastoreItem(
      DATASTORE_KEY,
      { ...existing, sla: normalized },
      DATASTORE_CATEGORIES.CONFIGURATION,
    );
  } catch {
    // local cache already set
  }
}

export function useSlaConfig(): SlaConfig {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { if (!_fetched) loadSlaConfig(); }, []);
  return value;
}

/** Format a minutes value as a compact human string (e.g. 15m, 4h, 3d). */
export function formatSlaDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) {
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
  const days = hours / 24;
  return Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`;
}
