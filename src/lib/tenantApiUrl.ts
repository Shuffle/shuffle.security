/**
 * Per-tenant API URL resolution for multi-tenant views.
 *
 * The Org-Id header does not cross regions: a child tenant in ca./us./eu2.
 * must be addressed on its own region host. Multi-tenant fetches call
 * `tenantApiUrl(path, orgId)` instead of `getApiUrl(path)`. Tenants whose
 * region is unknown or equal to the current one fall back to getApiUrl.
 */
import { API_CONFIG, getApiUrl, isDevEnvironment, mapCloudRegionUrl } from '@/Shuffle-MCPs/api';

const regionByOrg = new Map<string, string>();

export const registerTenantRegions = (
  orgs: Array<{ id?: string; region_url?: string | null } | null | undefined> | null | undefined,
): void => {
  if (!Array.isArray(orgs)) return;
  for (const o of orgs) {
    if (o?.id && typeof o.region_url === 'string' && o.region_url.trim()) {
      regionByOrg.set(o.id, o.region_url.trim());
    }
  }
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
