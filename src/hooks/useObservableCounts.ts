/**
 * useObservableCounts — for each enabled IOC type name, fetch
 * `total_amount` from the `ioc_<type>` datastore category so the
 * /incidents/observables page can show how many observables of each
 * kind have been collected.
 *
 * Single-query design: one batched react-query call fans out to the
 * `list_cache?category=ioc_<type>&top=1` endpoint (the response
 * carries `total_amount` regardless of `top`), so we only pay for the
 * count, not the rows.
 */
import { useQuery } from '@tanstack/react-query';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

const getOrgId = (): string | null => {
  try {
    const info = localStorage.getItem('shuffle_user_info');
    return info ? JSON.parse(info)?.active_org?.id ?? null : null;
  } catch {
    return null;
  }
};

const fetchTotal = async (orgId: string, iocName: string): Promise<number> => {
  const category = `ioc_${iocName}`;
  const url = getApiUrl(
    `/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(category)}&top=1`,
  );
  try {
    const res = await fetch(url, { credentials: 'include', headers: { ...getAuthHeader() } });
    if (!res.ok) return 0;
    const data = await res.json();
    const n = data?.total_amount ?? data?.total ?? data?.amount ?? 0;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

export const useObservableCounts = (enabledNames: string[]) => {
  // Stable cache key — order-independent.
  const sorted = [...enabledNames].sort();
  return useQuery<Record<string, number>>({
    queryKey: ['observable-counts', sorted],
    enabled: sorted.length > 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const orgId = getOrgId();
      if (!orgId) return {};
      const entries = await Promise.all(
        sorted.map(async (name) => [name, await fetchTotal(orgId, name)] as const),
      );
      return Object.fromEntries(entries);
    },
  });
};
