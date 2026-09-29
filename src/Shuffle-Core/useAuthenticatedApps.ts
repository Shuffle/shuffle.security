/**
 * Shared React Query hook for `/api/v1/apps/authentication`.
 *
 * Multiple components on a single page (sidebar IntegrationStatus, the
 * incident header source-app logo, the Forward dialog, etc.) all need this
 * data. Without a shared cache they each fired their own request on mount,
 * which showed up as 3+ identical requests on every incident detail load.
 * React Query dedupes them into a single in-flight request and caches the
 * result for subsequent consumers.
 */

import { useQuery } from '@tanstack/react-query';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { fetchJsonCached } from './views/appsFetchCache';

export interface AuthenticatedApp {
  id?: string;
  active?: boolean;
  label?: string;
  app?: {
    name?: string;
    large_image?: string;
    small_image?: string;
    categories?: string[];
    [key: string]: unknown;
  };
  validation?: { valid?: boolean; [key: string]: unknown };
  fields?: Array<{ key: string; value: string }>;
  [key: string]: unknown;
}

export const AUTHENTICATED_APPS_QUERY_KEY = ['apps', 'authentication'] as const;

const fetchAuthenticatedApps = async (crossOrgId?: string | null): Promise<AuthenticatedApp[]> => {
  const headers: Record<string, string> = {
    ...getAuthHeader(),
    ...(crossOrgId ? { 'Org-Id': crossOrgId } : {}),
  };
  try {
    const result = await fetchJsonCached(getApiUrl('/api/v1/apps/authentication'), {
      credentials: 'include',
      headers,
    });
    const data = result?.data || result;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const useAuthenticatedApps = (crossOrgId?: string | null) => {
  return useQuery({
    queryKey: [...AUTHENTICATED_APPS_QUERY_KEY, crossOrgId || null],
    queryFn: () => fetchAuthenticatedApps(crossOrgId),
    // Authenticated apps change rarely — keep them fresh for a minute so
    // navigating between incident detail / list / sidebar does not refire.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
};
