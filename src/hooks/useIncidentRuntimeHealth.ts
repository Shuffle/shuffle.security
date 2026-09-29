import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiUrl, getAuthHeader, hasShuffleAuth } from '@/Shuffle-Core/api';
import { useAuth } from '@/context/AuthContext';
import { WorkflowSummary, useWorkflows } from '@/hooks/useWorkflows';
import { EnvironmentItem, isRunning } from '@/components/settings/DefaultEnvironmentSelector';

export interface BlockedRuntimeInfo {
  id: string;
  name: string;
  queue: number;
  isDefault: boolean;
  affectedWorkflows: string[];
  affectedUsecases: string[];
}

export interface IncidentRuntimeHealthResult {
  hasBlockedRuntime: boolean;
  blockedEnvironments: BlockedRuntimeInfo[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

// Canonical usecase / workflow keywords associated with /incidents
const INCIDENT_WORKFLOW_PATTERNS = [
  'ingest tickets',
  'forward tickets',
  'ingestion webhook',
  'enable threat feeds',
  'realtime ioc extraction',
  'assign & escalate',
  'incident routing rules',
  'schedules & phone notifications',
  'ai incident handling',
];

/**
 * Checks whether any runtime location required by /incidents usecases is stopped
 * (no Orborus check-in within 300s) AND has more than 2 pending executions in queue.
 *
 * Runs once on page load — does not poll continuously in the background.
 */
export const useIncidentRuntimeHealth = (): IncidentRuntimeHealthResult => {
  const { userInfo } = useAuth();
  const orgId = userInfo?.active_org?.id;

  // Workflows query — runs on load, does not poll continuously
  const {
    data: workflows = [],
    isLoading: workflowsLoading,
    refetch: refetchWorkflows,
  } = useWorkflows();

  // Environments query — runs on load, does not poll continuously
  const {
    data: environments = [],
    isLoading: envsLoading,
    refetch: refetchEnvs,
  } = useQuery<EnvironmentItem[]>({
    queryKey: ['incident-runtime-health-environments', orgId || 'active'],
    queryFn: async () => {
      const headers: Record<string, string> = { ...getAuthHeader() };
      if (orgId) headers['Org-Id'] = orgId;
      const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: hasShuffleAuth(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const blockedEnvironments = useMemo<BlockedRuntimeInfo[]>(() => {
    if (!environments || environments.length === 0) return [];

    const defaultEnv = environments.find((e) => e.default);

    // Helper to test if an environment is stopped and has queue > 2
    const checkEnvironmentBlocked = (env: EnvironmentItem | undefined): boolean => {
      if (!env) return false;
      const running = isRunning(env);
      const queue = Math.max(0, Number(env.queue) || 0);
      return !running && queue > 2;
    };

    // Filter incident-related workflows
    const incidentWorkflows = (workflows || []).filter((wf: WorkflowSummary) => {
      const name = (wf.name || '').toLowerCase();
      const tags = (wf.tags || []).map((t) => String(t).toLowerCase());
      return (
        INCIDENT_WORKFLOW_PATTERNS.some((p) => name.includes(p) || tags.some((t) => t.includes(p))) ||
        wf.category === 'cases' ||
        wf.category === 'incidents'
      );
    });

    const blockedMap = new Map<string, BlockedRuntimeInfo>();

    // 1. Check workflows specifically tied to /incidents
    incidentWorkflows.forEach((wf) => {
      const actionEnv = wf.actions?.find((a: { environment?: string }) => a?.environment)?.environment;
      const triggerEnv = wf.triggers?.find((t: { environment?: string }) => t?.environment)?.environment;
      const explicitEnv = wf.environment || actionEnv || triggerEnv;

      const targetEnv = explicitEnv
        ? environments.find(
            (e) => e.Name.toLowerCase() === explicitEnv.toLowerCase() || e.id === explicitEnv
          )
        : defaultEnv;

      if (targetEnv && checkEnvironmentBlocked(targetEnv)) {
        const key = targetEnv.id || targetEnv.Name;
        const existing = blockedMap.get(key) || {
          id: targetEnv.id,
          name: targetEnv.Name,
          queue: Math.max(0, Number(targetEnv.queue) || 0),
          isDefault: Boolean(targetEnv.default),
          affectedWorkflows: [],
          affectedUsecases: [],
        };

        if (wf.name && !existing.affectedWorkflows.includes(wf.name)) {
          existing.affectedWorkflows.push(wf.name);
        }
        blockedMap.set(key, existing);
      }
    });

    // 2. If the default runtime location is stopped with queue > 2,
    // all standard /incidents usecases (e.g. Ingest Tickets, Threat Intel, Forwarding)
    // rely on it by default unless explicitly overridden.
    if (defaultEnv && checkEnvironmentBlocked(defaultEnv)) {
      const key = defaultEnv.id || defaultEnv.Name;
      const existing = blockedMap.get(key) || {
        id: defaultEnv.id,
        name: defaultEnv.Name,
        queue: Math.max(0, Number(defaultEnv.queue) || 0),
        isDefault: true,
        affectedWorkflows: [],
        affectedUsecases: [],
      };

      if (!existing.affectedUsecases.includes('Automatic Ingestion')) {
        existing.affectedUsecases.push('Automatic Ingestion');
      }
      if (!existing.affectedUsecases.includes('Incident Automations')) {
        existing.affectedUsecases.push('Incident Automations');
      }
      blockedMap.set(key, existing);
    }

    return Array.from(blockedMap.values());
  }, [environments, workflows]);

  const refetch = async () => {
    await Promise.allSettled([refetchWorkflows(), refetchEnvs()]);
  };

  return {
    hasBlockedRuntime: blockedEnvironments.length > 0,
    blockedEnvironments,
    isLoading: workflowsLoading || envsLoading,
    refetch,
  };
};
