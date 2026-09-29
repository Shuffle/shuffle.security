/**
 * Per-tenant API URL resolution for multi-tenant views.
 *
 * The Org-Id header does not cross regions: a child tenant in ca./us./eu2.
 * must be addressed on its own region host. Multi-tenant fetches call
 * `tenantApiUrl(path, orgId)` instead of `getApiUrl(path)`. Tenants whose
 * region is unknown or equal to the current one fall back to getApiUrl.
 */
import { API_CONFIG, getApiUrl, isDevEnvironment, mapCloudRegionUrl } from '@/Shuffle-Core/api';

const STORAGE_KEY = 'shuffle-tenant-regions';

const loadPersistedRegions = (): Map<string, string> => {
  const map = new Map<string, string>();
  if (typeof window === 'undefined') return map;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [orgId, region] of Object.entries(parsed)) {
        if (typeof orgId === 'string' && typeof region === 'string' && region.trim()) {
          map.set(orgId, region.trim());
        }
      }
    }
  } catch {
    // Corrupted or unavailable storage - start empty.
  }
  return map;
};

const regionByOrg = loadPersistedRegions();

const persistRegions = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(regionByOrg)));
  } catch {
    // Storage full or blocked - in-memory map still works for this session.
  }
};

export const registerTenantRegions = (
  orgs: Array<{ id?: string; region_url?: string | null } | null | undefined> | null | undefined,
): void => {
  if (!Array.isArray(orgs)) return;
  let changed = false;
  for (const o of orgs) {
    if (o?.id && typeof o.region_url === 'string' && o.region_url.trim()) {
      const next = o.region_url.trim();
      if (regionByOrg.get(o.id) !== next) {
        regionByOrg.set(o.id, next);
        changed = true;
      }
    }
  }
  // Fresh login info always wins, so a rare region change self-heals.
  if (changed) persistRegions();
};

export const getTenantRegionBase = (orgId?: string | null, regionUrl?: string | null): string | null => {
  if (isDevEnvironment()) return null;
  const raw = regionUrl || (orgId ? regionByOrg.get(orgId) : undefined);
  if (!raw) return null;
  const mapped = (mapCloudRegionUrl(raw) || '').replace(/\/+$/, '');
  if (!mapped) return null;
  const current = (API_CONFIG.baseUrl || '').replace(/\/+$/, '');
  if (mapped === current) return null;
  return mapped;
};

export const tenantApiUrl = (endpoint: string, orgId?: string | null, regionUrl?: string | null): string => {
  const base = getTenantRegionBase(orgId, regionUrl);
  return base ? `${base}${endpoint}` : getApiUrl(endpoint);
};
