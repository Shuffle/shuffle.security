/**
 * Hook to fetch sub-tenants for the current org.
 * Used for multi-tenant views where parent orgs can see child tenant data.
 */
import { useState, useEffect, useCallback } from 'react';
import { getApiUrl, getAuthHeader, mapCloudRegionUrl } from '@/Shuffle-MCPs/api';
import { useAuth } from '@/context/AuthContext';
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
  const { userInfo } = useAuth();
  // When the active org is itself a child tenant, it must never fan out to
  // other tenants. The /suborgs API can return siblings in some setups, which
  // would make a child look like a parent and trigger cross-tenant fetching.
  const isChildTenant = !!userInfo?.active_org?.creator_org && userInfo?.active_org?.id === currentOrgId;

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
        // Only keep TRUE descendants of the current org. The API can return
        // peers/siblings in some configurations, which would otherwise make a
        // sub-tenant look like a parent and pull in data from other tenants.
        // Multi-tenant fan-out must always distribute downwards only.
        const trueChildren = orgs.filter((org: any) => {
          if (!org?.id || org.id === currentOrgId) return false;
          // If creator_org is present, it must point to the current org.
          // If absent, fall back to accepting it (older API responses).
          if (org.creator_org) return org.creator_org === currentOrgId;
          return true;
        });
        setSubOrgs(isChildTenant ? [] : trueChildren.map((org: any) => ({
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
  }, [currentOrgId, isChildTenant]);

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
