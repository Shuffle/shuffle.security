/**
 * Hook to fetch sub-tenants for the current org.
 * Used for multi-tenant views where parent orgs can see child tenant data.
 */
import { useState, useEffect, useCallback } from 'react';
import { getApiUrl, getAuthHeader, mapCloudRegionUrl } from '@/Shuffle-Core/api';
import { registerTenantRegions } from '@/lib/tenantApiUrl';


export interface SubOrg {
  id: string;
  name: string;
  image?: string;
  creator_org?: string;
  region_url?: string;
  isParent?: boolean;
}

interface UseSubOrgsReturn {
  subOrgs: SubOrg[];
  parentOrg: SubOrg | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isParentOrg: boolean;
}

export const useSubOrgs = (currentOrgId: string | undefined): UseSubOrgsReturn => {
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([]);
  const [parentOrg, setParentOrg] = useState<SubOrg | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The /suborgs API already scopes its response to what the user may see,
  // including when the active org is itself a sub-tenant, so the response is
  // trusted as-is.

  const fetchSubOrgs = useCallback(async () => {
    if (!currentOrgId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(getApiUrl(`/api/v1/orgs/${currentOrgId}/suborgs`), {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Not a parent org or API not available — not an error, just no sub-orgs
        setSubOrgs([]);
        return;
      }

      const data = await response.json();
      
      if (data.success !== false) {
        // Handle both { subOrgs: [...] } and direct array formats
        const orgs = Array.isArray(data) ? data : (data.child_orgs || data.orgs || data.subOrgs || []);
        // Trust the API: it returns the sub-tenants the user has access to.
        // When the active org is itself a sub-tenant, the API returns the
        // parent's children, so do not filter them by creator_org here.
        const trueChildren = orgs.filter((org: any) => !!org?.id && org.id !== currentOrgId);
        setSubOrgs(trueChildren.map((org: any) => ({
          id: org.id,
          name: org.name || org.id,
          image: org.image,
          creator_org: org.creator_org,
          region_url: org.region_url ? (mapCloudRegionUrl(org.region_url) || org.region_url) : undefined,
        })));

        registerTenantRegions(trueChildren);
        // Extract parent org if available
        const parent = data.parentOrg || data.parent_org;
        if (parent && parent.id) {
          registerTenantRegions([parent]);
          setParentOrg({
            id: parent.id,
            name: parent.name || parent.id,
            image: parent.image,
            creator_org: parent.creator_org,
            region_url: parent.region_url ? (mapCloudRegionUrl(parent.region_url) || parent.region_url) : undefined,
            isParent: true,
          });
        } else {
          setParentOrg(null);
        }
      } else {
        setSubOrgs([]);
        setParentOrg(null);
      }
    } catch (err) {
      setSubOrgs([]);
      setParentOrg(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrgId]);

  useEffect(() => {
    fetchSubOrgs();
  }, [fetchSubOrgs]);

  return {
    subOrgs,
    parentOrg,
    isLoading,
    error,
    refetch: fetchSubOrgs,
    // Multi-tenant view is available when we have child orgs or a parent org
    isParentOrg: subOrgs.length > 0 || parentOrg !== null,
  };
};
