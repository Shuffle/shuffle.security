/**
 * Merge host data from multiple sources for the Monitors UI.
 *
 * The /environments API now only returns lightweight host stubs (uuid, hostname,
 * group association, last check-in). Full host details live in two datastore
 * categories that we cross-load and merge by hostname:
 *
 *   - shuffle-security_sensors  → authoritative host runtime data (software,
 *                                 code_scanner, response_actions, encryption,
 *                                 screen-lock, etc.)
 *   - shuffle-security_assets   → asset-inventory metadata (owner, tags,
 *                                 location, asset id, etc.)
 *
 * Precedence (highest → lowest): sensors > assets > environments.
 *
 * This module is intentionally framework-agnostic so both the list page
 * (VulnAssetsPage) and the detail page (MonitorDetailPage) can reuse it.
 */
import { getDatastoreByCategory } from '@/Shuffle-MCPs/datastore';

const SENSORS_CATEGORY = 'shuffle-security_sensors';
const ASSETS_CATEGORY = 'shuffle-security_assets';

export interface SupplementResult {
  /** keyed by lowercased hostname */
  sensorsByHost: Map<string, Record<string, unknown>>;
  assetsByHost: Map<string, Record<string, unknown>>;
  /** Soft errors — caller may surface but should not block rendering. */
  errors: { source: 'sensors' | 'assets'; message: string }[];
}

const safeParse = (raw: unknown): Record<string, unknown> | null => {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const indexByHostname = (
  items: { key: string; value: unknown }[],
): Map<string, Record<string, unknown>> => {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const parsed = safeParse(item.value);
    if (!parsed) continue;
    const hostname = String(
      (parsed.hostname as string | undefined) ??
        (parsed.host as string | undefined) ??
        item.key ??
        '',
    )
      .trim()
      .toLowerCase();
    if (!hostname) continue;
    // Last write wins — datastore returns most recent edits last.
    map.set(hostname, parsed);
  }
  return map;
};

/** Fetch shuffle-security_sensors + shuffle-security_assets and index by hostname. */
export const fetchHostSupplements = async (overrideOrgId?: string): Promise<SupplementResult> => {
  const errors: SupplementResult['errors'] = [];

  const [sensorsRes, assetsRes] = await Promise.allSettled([
    getDatastoreByCategory(SENSORS_CATEGORY, undefined, undefined, overrideOrgId),
    getDatastoreByCategory(ASSETS_CATEGORY, undefined, undefined, overrideOrgId),
  ]);

  let sensorsByHost = new Map<string, Record<string, unknown>>();
  let assetsByHost = new Map<string, Record<string, unknown>>();

  if (sensorsRes.status === 'fulfilled' && sensorsRes.value.success) {
    sensorsByHost = indexByHostname(sensorsRes.value.data || []);
  } else if (sensorsRes.status === 'fulfilled') {
    errors.push({ source: 'sensors', message: sensorsRes.value.error || 'Failed to load sensors datastore' });
  } else {
    errors.push({ source: 'sensors', message: sensorsRes.reason?.message || 'Failed to load sensors datastore' });
  }

  if (assetsRes.status === 'fulfilled' && assetsRes.value.success) {
    assetsByHost = indexByHostname(assetsRes.value.data || []);
  } else if (assetsRes.status === 'fulfilled') {
    errors.push({ source: 'assets', message: assetsRes.value.error || 'Failed to load assets datastore' });
  } else {
    errors.push({ source: 'assets', message: assetsRes.reason?.message || 'Failed to load assets datastore' });
  }

  return { sensorsByHost, assetsByHost, errors };
};

/**
 * Fields where /api/v1/environments is authoritative when its checkin is more
 * recent than the sensors datastore record. The environments API receives
 * real-time updates from orborus, so its values for these specific fields are
 * fresher than the periodically-snapshotted sensors datastore.
 */
const ENV_FRESH_FIELDS = ['arch', 'hostname', 'checkin', 'uuid'] as const;

const toCheckinNumber = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(v);
    if (Number.isFinite(t)) return Math.floor(t / 1000);
  }
  return 0;
};

/**
 * Merge a single environment host stub with its sensor + asset records.
 * Precedence (highest → lowest): sensors > assets > environments.
 *
 * Exception: when the env stub's `checkin` is newer than the sensor record's
 * `checkin`, the env values for arch/hostname/checkin/uuid take precedence
 * (the environments API gets these updated more frequently than the sensors
 * datastore snapshot).
 *
 * Undefined values from higher-precedence sources do NOT override lower ones,
 * so partial records still benefit from data filled in further down the chain.
 */
export const mergeHost = <T extends Record<string, unknown>>(
  envHost: T,
  sensorsByHost: Map<string, Record<string, unknown>>,
  assetsByHost: Map<string, Record<string, unknown>>,
): T => {
  const hostname = String(envHost.hostname || '').trim().toLowerCase();
  if (!hostname) return envHost;

  const asset = assetsByHost.get(hostname);
  const sensor = sensorsByHost.get(hostname);

  const merged: Record<string, unknown> = { ...envHost };

  // Apply assets first (lower precedence than sensors, higher than env)
  if (asset) {
    for (const [k, v] of Object.entries(asset)) {
      if (v !== undefined) merged[k] = v;
    }
  }
  // Then sensors — overrides anything from assets/env
  if (sensor) {
    for (const [k, v] of Object.entries(sensor)) {
      if (v !== undefined) merged[k] = v;
    }
  }

  // Env-fresh override: if env checkin is newer than sensor checkin, prefer
  // env values for the small set of fields the environments API keeps current.
  const envCheckin = toCheckinNumber(envHost.checkin);
  const sensorCheckin = sensor ? toCheckinNumber(sensor.checkin) : 0;
  if (envCheckin > sensorCheckin) {
    for (const k of ENV_FRESH_FIELDS) {
      const v = envHost[k];
      if (v !== undefined && v !== null && v !== '') {
        merged[k] = v;
      }
    }
  }

  return merged as T;
};

/** Merge an array of env-stub hosts. */
export const mergeHosts = <T extends Record<string, unknown>>(
  envHosts: T[],
  supplement: Pick<SupplementResult, 'sensorsByHost' | 'assetsByHost'>,
): T[] => envHosts.map(h => mergeHost(h, supplement.sensorsByHost, supplement.assetsByHost));
