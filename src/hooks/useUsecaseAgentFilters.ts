import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { CategoryConfig, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { useAssignEscalateStatus } from '@/hooks/useAssignEscalateStatus';
import type { AgentUsecaseFilter } from '@/Shuffle-MCPs/components/AgentActivityList';

const getOrgId = (): string | null => {
  try {
    const info = localStorage.getItem('shuffle_user_info');
    return info ? JSON.parse(info)?.active_org?.id || null : null;
  } catch {
    return null;
  }
};

const fetchCategoryConfig = async (category: string): Promise<CategoryConfig | null> => {
  const orgId = getOrgId();
  if (!orgId) return null;
  const res = await fetch(
    getApiUrl(`/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(category)}&top=1`),
    { credentials: 'include', headers: { ...getAuthHeader() } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.category_config as CategoryConfig | undefined) || null;
};

const hasAiAgent = (cfg: CategoryConfig | null | undefined): boolean =>
  !!cfg?.automations?.some(
    (a) => a.enabled && ((a as any).type === 'ai_agent' || a.name === 'Run AI Agent'),
  );

/**
 * Usecase-driven agent "types" for the /agents run filter. Only usecases that
 * are actually enabled for the current tenant are returned.
 */
export const useUsecaseAgentFilters = (): AgentUsecaseFilter[] => {
  const [incidents, vulnerabilities] = useQueries({
    queries: [DATASTORE_CATEGORIES.INCIDENTS, DATASTORE_CATEGORIES.VULNERABILITIES].map((category) => ({
      queryKey: ['usecase-agent-filters', category],
      queryFn: () => fetchCategoryConfig(category),
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const assign = useAssignEscalateStatus();

  return useMemo(() => {
    const filters: AgentUsecaseFilter[] = [];
    if (hasAiAgent(incidents.data)) {
      filters.push({
        id: 'incident-response',
        label: 'Incident Handler',
        matchTokens: ['incident', 'alert', 'cases', 'shuffle-security_incidents'],
      });
    }
    if (hasAiAgent(vulnerabilities.data)) {
      filters.push({
        id: 'vulnerability-response',
        label: 'Vulnerability Management',
        matchTokens: ['vulnerab', 'shuffle-security_vulns', 'shuffle-security_vulnerabilities'],
      });
    }
    if (assign.active) {
      filters.push({
        id: 'assign-escalate',
        label: 'Assign & Escalate',
        matchTokens: ['assign', 'escalate'],
      });
    }
    return filters;
  }, [incidents.data, vulnerabilities.data, assign.active]);
};
