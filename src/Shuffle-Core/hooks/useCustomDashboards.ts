/**
 * Hook for loading, caching, creating, updating, and deleting custom dashboards
 * stored in the Shuffle Datastore category `shuffle-security_dashboards`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  DATASTORE_CATEGORIES,
  deleteDatastoreItem,
  filterItemsByCategory,
  getDatastoreByCategory,
  setDatastoreItem,
} from '../datastore';
import {
  type CustomDashboardConfig,
  validateCustomDashboardConfig,
} from '../components/dashboard/customDashboardTypes';

const STORAGE_PREFIX = 'shuffle-custom-dashboards:';
const SYNC_EVENT = 'shuffle:custom-dashboards-updated';

const storageKeyForOrg = (orgId?: string | null) =>
  `${STORAGE_PREFIX}${orgId && orgId.trim() ? orgId.trim() : 'default'}`;

function readLocalDashboards(orgId?: string | null): CustomDashboardConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKeyForOrg(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: CustomDashboardConfig[] = [];
    for (const item of parsed) {
      const res = validateCustomDashboardConfig(item);
      if (res.valid) valid.push(res.config);
    }
    return valid.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function writeLocalDashboards(orgId: string | null | undefined, list: CustomDashboardConfig[]) {
  if (typeof window === 'undefined') return;
  try {
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    window.localStorage.setItem(storageKeyForOrg(orgId), JSON.stringify(sorted));
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, {
        detail: { orgKey: storageKeyForOrg(orgId), dashboards: sorted },
      }),
    );
  } catch {
    /* ignore storage quota errors */
  }
}

export interface UseCustomDashboardsResult {
  dashboards: CustomDashboardConfig[];
  isLoading: boolean;
  isSaving: boolean;
  refresh: () => Promise<void>;
  saveDashboard: (config: CustomDashboardConfig) => Promise<CustomDashboardConfig>;
  deleteDashboard: (id: string) => Promise<boolean>;
}

export function useCustomDashboards(orgId?: string | null): UseCustomDashboardsResult {
  const [dashboards, setDashboards] = useState<CustomDashboardConfig[]>(() =>
    readLocalDashboards(orgId),
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sync across components within the same tab when a dashboard is added/edited/deleted
  useEffect(() => {
    setDashboards(readLocalDashboards(orgId));
    const expectedKey = storageKeyForOrg(orgId);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ orgKey: string; dashboards: CustomDashboardConfig[] }>).detail;
      if (detail && detail.orgKey === expectedKey && Array.isArray(detail.dashboards)) {
        setDashboards(detail.dashboards);
      }
    };
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, [orgId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getDatastoreByCategory(
        DATASTORE_CATEGORIES.DASHBOARDS,
        undefined,
        100,
        orgId || undefined,
      );
      if (res.success && Array.isArray(res.data)) {
        const items = filterItemsByCategory(res.data, DATASTORE_CATEGORIES.DASHBOARDS);
        const remoteMap = new Map<string, CustomDashboardConfig>();
        for (const item of items) {
          try {
            const rawVal = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
            const validated = validateCustomDashboardConfig(rawVal);
            if (validated.valid) {
              remoteMap.set(validated.config.id, validated.config);
            }
          } catch {
            /* skip malformed item */
          }
        }
        // Merge with local dashboards so locally created dashboards in demo/offline mode
        // or not-yet-indexed writes remain available.
        const local = readLocalDashboards(orgId);
        for (const loc of local) {
          const rem = remoteMap.get(loc.id);
          if (!rem || (loc.updatedAt || 0) > (rem.updatedAt || 0)) {
            remoteMap.set(loc.id, loc);
          }
        }
        const merged = Array.from(remoteMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setDashboards(merged);
        writeLocalDashboards(orgId, merged);
      }
    } catch {
      /* keep cached dashboards */
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveDashboard = useCallback(
    async (config: CustomDashboardConfig): Promise<CustomDashboardConfig> => {
      const now = Date.now();
      const updated: CustomDashboardConfig = {
        ...config,
        version: 1,
        createdAt: config.createdAt || now,
        updatedAt: now,
      };
      setIsSaving(true);
      try {
        const current = readLocalDashboards(orgId);
        const next = current.some((d) => d.id === updated.id)
          ? current.map((d) => (d.id === updated.id ? updated : d))
          : [...current, updated];
        setDashboards(next.sort((a, b) => a.name.localeCompare(b.name)));
        writeLocalDashboards(orgId, next);

        await setDatastoreItem(
          updated.id,
          updated,
          DATASTORE_CATEGORIES.DASHBOARDS,
          orgId || undefined,
        ).catch(() => {
          /* In guest/sample mode or offline mode, local persistence still succeeds */
        });
        return updated;
      } finally {
        setIsSaving(false);
      }
    },
    [orgId],
  );

  const deleteDashboard = useCallback(
    async (id: string): Promise<boolean> => {
      setIsSaving(true);
      try {
        const current = readLocalDashboards(orgId);
        const next = current.filter((d) => d.id !== id);
        setDashboards(next);
        writeLocalDashboards(orgId, next);

        await deleteDatastoreItem(
          id,
          DATASTORE_CATEGORIES.DASHBOARDS,
          orgId || undefined,
        ).catch(() => {
          /* Ignore remote failure in guest/offline mode */
        });
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [orgId],
  );

  return {
    dashboards,
    isLoading,
    isSaving,
    refresh,
    saveDashboard,
    deleteDashboard,
  };
}
