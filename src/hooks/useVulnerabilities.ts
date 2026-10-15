/**
 * Hook for fetching and managing vulnerability data from the Shuffle datastore.
 * Category: shuffle-vulnerabilities
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useDatastore } from './useDatastore';

export type VulnSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type VulnCategory = 'software_cve' | 'user_identity' | 'cloud_misconfig' | 'code_dependency';
export type VulnStatus = 'open' | 'in_progress' | 'resolved' | 'accepted';
export type VulnAssetType = 'asset' | 'user';

export interface Vulnerability {
  id: string;
  /** Stable record id without the per-host suffix (e.g. CVE-2024-xxxx) */
  record_id?: string;
  title: string;
  description?: string;
  severity: VulnSeverity;
  category: VulnCategory;
  status: VulnStatus;
  source?: string;
  asset_type: VulnAssetType;
  asset_id?: string;
  asset_name?: string;
  cve_id?: string;
  /** OSV affected package name (preserved separately from asset_id when host-scoped) */
  package_name?: string;
  /** OSV affected package ecosystem (e.g. PyPI, npm) */
  ecosystem?: string;
  /** Per-host install paths from the OSV record */
  paths?: Array<{ path?: string; version?: string; last_seen?: string }>;
  remediation?: string;
  first_seen?: string;
  last_seen?: string;
  resolved_at?: string;
}

const DATASTORE_CATEGORY = 'shuffle-security_vulns';

function normalizeOsvSeverity(raw?: string | null): VulnSeverity {
  if (!raw) return 'info';
  const s = String(raw).trim().toLowerCase();
  if (s.startsWith('crit')) return 'critical';
  if (s.startsWith('high') || s === 'severe') return 'high';
  if (s.startsWith('mod') || s.startsWith('med')) return 'medium';
  if (s.startsWith('low')) return 'low';
  const num = parseFloat(s);
  if (!Number.isNaN(num)) {
    if (num >= 9) return 'critical';
    if (num >= 7) return 'high';
    if (num >= 4) return 'medium';
    if (num > 0) return 'low';
  }
  return 'info';
}

/**
 * Parse a single datastore record. Supports two shapes:
 *  1. Native vuln record (legacy): matches the Vulnerability interface directly.
 *  2. OSV record (from /packages and /software lookups): has `id`, `summary`,
 *     `affected[].package.ecosystem`, optional `hosts: [{ hostname, paths }]`.
 *     We expand to one Vulnerability row per affected hostname.
 */
/** Datastore timestamps may be seconds or milliseconds — normalize to ISO. */
function toIso(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function parseRecord(raw: any, discoveredAt?: number): Vulnerability[] {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.id) return [];

    const isOsv = Array.isArray(data.affected) || Array.isArray(data.severity) || data.database_specific;

    if (isOsv) {
      const sevRaw = data.database_specific?.severity || data.severity?.[0]?.score;
      const severity = normalizeOsvSeverity(sevRaw);
      const ecosystem: string = data.affected?.[0]?.package?.ecosystem || '';
      const pkgName: string = data.affected?.[0]?.package?.name || '';
      const isCve = String(data.id).toUpperCase().startsWith('CVE-');
      const cveId = isCve ? data.id : (data.aliases || []).find((a: string) => /^CVE-/i.test(a));
      const title = data.summary || data.id;
      const description = data.details || '';
      const discovered = toIso(discoveredAt);
      const firstSeen = discovered || data.published || data.modified || '';
      const lastSeen = data.modified || data.published || '';
      const source = ecosystem ? `osv:${ecosystem.toLowerCase()}` : 'osv';
      const hosts: Array<{ hostname: string; paths?: any[]; resolution?: any }> = Array.isArray(data.hosts) ? data.hosts : [];
      // Root-level resolution (legacy whole-vuln close) is treated as a fallback only.
      const rootStatus: VulnStatus = (['open', 'in_progress', 'resolved', 'accepted'].includes(data.status) ? data.status : 'open') as VulnStatus;
      const rootResolvedAt: string = data.resolved_at || '';

      if (hosts.length === 0) {
        return [{
          id: data.id,
          record_id: data.id,
          title,
          description,
          severity,
          category: 'code_dependency',
          status: rootStatus,
          source,
          asset_type: 'asset',
          asset_id: pkgName,
          asset_name: pkgName,
          cve_id: cveId,
          package_name: pkgName,
          ecosystem: ecosystem || undefined,
          first_seen: firstSeen,
          last_seen: lastSeen,
          resolved_at: rootResolvedAt,
        }];
      }

      return hosts.map(h => {
        // Per-host resolution wins. Fall back to legacy root-level resolution
        // when present (covers vulns closed before per-host resolution shipped).
        const hostResolution = h.resolution;
        const hasHostResolution = hostResolution && hostResolution.reason;
        const status: VulnStatus = hasHostResolution
          ? (hostResolution.reason === 'accepted' ? 'accepted' : 'resolved')
          : rootStatus;
        const resolvedAt = hasHostResolution ? (hostResolution.at || '') : rootResolvedAt;
        return {
          id: `${data.id}::${h.hostname}`,
          record_id: data.id,
          title,
          description,
          severity,
          category: 'code_dependency',
          status,
          source,
          asset_type: 'asset',
          asset_id: h.hostname,
          asset_name: h.hostname,
          cve_id: cveId,
          package_name: pkgName,
          ecosystem: ecosystem || undefined,
          paths: Array.isArray(h.paths) ? h.paths : undefined,
          first_seen: firstSeen,
          last_seen: lastSeen,
          resolved_at: resolvedAt,
        };
      });
    }

    if (!data.title) return [];
    return [{
      id: data.id,
      title: data.title,
      description: data.description || '',
      severity: (['critical', 'high', 'medium', 'low', 'info'].includes(data.severity) ? data.severity : 'medium') as VulnSeverity,
      category: (['software_cve', 'user_identity', 'cloud_misconfig', 'code_dependency'].includes(data.category) ? data.category : 'software_cve') as VulnCategory,
      status: (['open', 'in_progress', 'resolved', 'accepted'].includes(data.status) ? data.status : 'open') as VulnStatus,
      source: data.source || '',
      asset_type: data.asset_type === 'user' ? 'user' : 'asset',
      asset_id: data.asset_id || '',
      asset_name: data.asset_name || '',
      cve_id: data.cve_id || '',
      remediation: data.remediation || '',
      first_seen: toIso(discoveredAt) || data.first_seen || '',
      last_seen: data.last_seen || '',
      resolved_at: data.resolved_at || '',
    }];
  } catch {
    return [];
  }
}

interface UseVulnerabilitiesOptions {
  tab?: 'assets' | 'users';
}

export const useVulnerabilities = ({ tab = 'assets' }: UseVulnerabilitiesOptions = {}) => {
  const { items, isLoading, isRefreshing, hasFetched, error, fetchItems, hasMore, fetchNextPage } = useDatastore({ category: DATASTORE_CATEGORY });
  const [hasInitialFetch, setHasInitialFetch] = useState(false);

  useEffect(() => {
    if (!hasInitialFetch) {
      fetchItems();
      setHasInitialFetch(true);
    }
  }, [hasInitialFetch, fetchItems]);

  const allVulnerabilities = useMemo(() => {
    const out: Vulnerability[] = [];
    for (const item of items) {
      try {
        const parsed = item?.value != null ? (typeof item.value === 'string' ? JSON.parse(item.value) : item.value) : item;
        out.push(...parseRecord(parsed, (item as any).created));
      } catch {
        // skip
      }
    }
    return out;
  }, [items]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const v of allVulnerabilities) {
      if (v.severity in counts) counts[v.severity]++;
    }
    return counts;
  }, [allVulnerabilities]);

  return {
    vulnerabilities: allVulnerabilities,
    allVulnerabilities,
    severityCounts,
    isLoading,
    isRefreshing,
    hasFetched,
    error,
    refresh: fetchItems,
    hasMore,
    fetchNextPage,
  };
};
