import { useQueries, useQuery } from '@tanstack/react-query';
import { getApiUrl, getAuthHeader, hasShuffleAuth } from '@/Shuffle-MCPs/api';
import { fetchWorkflowsCached, invalidateWorkflowsCache } from '@/Shuffle-Core/views/appsFetchCache';

export { invalidateWorkflowsCache };

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  is_valid: boolean;
  actions?: any[];
  triggers?: any[];
  tags?: string[];
  background_processing?: boolean;
  [key: string]: any;
}

export const fetchWorkflows = async (orgId?: string, force = false): Promise<WorkflowSummary[]> => {
  const headers: Record<string, string> = { ...getAuthHeader() };
  if (orgId) headers['Org-Id'] = orgId;
  return fetchWorkflowsCached(getApiUrl('/api/v1/workflows'), {
    credentials: 'include',
    headers,
  }, force);
};

export const useWorkflows = (orgId?: string) => {
  return useQuery<WorkflowSummary[]>({
    queryKey: ['workflows', orgId || 'active'],
    queryFn: () => fetchWorkflows(orgId),
    // Skip entirely while unauthenticated (login page) — the call would go out
    // without an Authorization header and return 401.
    enabled: hasShuffleAuth(),
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnWindowFocus: false,
  });
};

/**
 * Fetch workflows for multiple orgs in parallel. Returns a map of orgId ->
 * workflows list. Used by multi-tenant automation validation on incidents
 * that live in more than one tenant.
 */
export const useWorkflowsMulti = (orgIds: string[]) => {
  const queries = useQueries({
    queries: orgIds.map((oid) => ({
      queryKey: ['workflows', oid],
      queryFn: () => fetchWorkflows(oid),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });
  const isLoading = queries.some((q) => q.isLoading);
  const byOrg: Record<string, WorkflowSummary[]> = {};
  orgIds.forEach((oid, idx) => {
    byOrg[oid] = queries[idx]?.data || [];
  });
  const refetchAll = async () => {
    await Promise.allSettled(queries.map((q) => q.refetch()));
  };
  return { byOrg, isLoading, refetchAll };
};
