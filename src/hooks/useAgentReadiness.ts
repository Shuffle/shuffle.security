import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkflows } from './useWorkflows';
import { useAssignEscalateStatus } from './useAssignEscalateStatus';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { getAutomationLabels } from '@/config/usecases';
import { CategoryAutomation, CategoryConfig, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { isDemoActive } from '@/services/demoMode';

/**
 * "Ask agent" / @AIAgent readiness — SINGLE SOURCE OF TRUTH for whether
 * a @AIAgent comment will actually trigger anything on this incident.
 *
 * The definitive check lives in useAssignEscalateStatus (same rule the
 * Automation Readiness banner on /incidents shows). We reuse it here so
 * the incident page, the readiness banner, and any other consumer can
 * never disagree about whether the agent is "connected".

 *
 * Rule (from useAssignEscalateStatus.isOrgActive):
 *   The "Assign & Escalate" background workflow exists AND a "Run workflow"
 *   automation on the incidents category is enabled AND points at that
 *   workflow id. A disabled "Run workflow" automation means the @AIAgent
 *   comment never fires, even if a "Run AI Agent" (type=ai_agent) automation
 *   is toggled on — so we do NOT short-circuit on that alone.
 *
 * `enable()` fixes this path end-to-end (mirroring /onboarding/automate).
 */


export interface AgentReadinessStatus {
  /** Either path A or path B is satisfied */
  active: boolean;
  /** Path A: "Run AI Agent" automation is enabled */
  hasAiAgentAutomation: boolean;
  /** Path B part 1: workflow exists with background_processing=true */
  hasWorkflow: boolean;
  /** Path B part 2: "Run workflow" enabled with this workflow id */
  hasCategoryAutomation: boolean;
  /** Still loading server state */
  isLoading: boolean;
  /** Force-enable the legacy path: generates workflow + wires up category automation */
  enable: () => Promise<void>;
  /** Enable in-flight */
  isEnabling: boolean;
}

const getOrgId = (): string | null => {
  try {
    const info = localStorage.getItem('shuffle_user_info');
    return info ? JSON.parse(info)?.active_org?.id || null : null;
  } catch {
    return null;
  }
};

// Sentinel returned when /list_cache responded successfully but didn't
// include a category_config (org likely has no incidents yet). We treat
// this as UNKNOWN rather than "disabled" — see Option A below.
const CATEGORY_CONFIG_MISSING = Symbol('category_config_missing');
type FetchedCategoryConfig = CategoryConfig | typeof CATEGORY_CONFIG_MISSING | null;

const fetchIncidentsCategoryConfig = async (orgIdArg?: string): Promise<FetchedCategoryConfig> => {
  const orgId = orgIdArg || getOrgId();
  if (!orgId) return null;
  const url = getApiUrl(
    `/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(
      DATASTORE_CATEGORIES.INCIDENTS,
    )}&top=1`,
  );
  const headers: Record<string, string> = { ...getAuthHeader() };
  if (orgIdArg) headers['Org-Id'] = orgIdArg;
  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error(`list_cache responded with ${res.status}`);
  const data = await res.json();
  const cfg = (data?.category_config as CategoryConfig | undefined) || null;
  return cfg ?? CATEGORY_CONFIG_MISSING;
};

/**
 * @param orgId - Validate the agent wiring inside THIS tenant instead of the
 *   active org. Incidents that live in a sub-org (route id "orgId::incidentId")
 *   must pass their own org id, otherwise readiness reports the parent org's
 *   configuration while the incident's workflows live somewhere else.
 */
export const useAgentReadiness = (orgId?: string): AgentReadinessStatus => {
  const { data: workflows, isLoading: wfLoading, refetch: refetchWorkflows } = useWorkflows(orgId);
  const queryClient = useQueryClient();
  const [isEnabling, setIsEnabling] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const labels = useMemo(() => getAutomationLabels('assign_escalate'), []);

  const { data: fetched, isLoading: cfgLoading } = useQuery<FetchedCategoryConfig>({
    queryKey: ['agent-readiness-category-config', orgId || 'active'],
    queryFn: () => fetchIncidentsCategoryConfig(orgId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const categoryConfigMissing = fetched === CATEGORY_CONFIG_MISSING;
  const categoryConfig: CategoryConfig | null = categoryConfigMissing
    ? null
    : ((fetched as CategoryConfig | null | undefined) ?? null);

  const matchingWorkflow = useMemo(() => {
    if (!workflows || labels.length === 0) return null;
    return (
      workflows.find(
        (w) => labels.includes(w.name) && w.background_processing === true,
      ) || null
    );
  }, [workflows, labels]);

  const hasWorkflow = !!matchingWorkflow;

  const hasAiAgentAutomation = useMemo(() => {
    if (!categoryConfig?.automations) return false;
    return categoryConfig.automations.some(
      (a) => a.enabled && ((a as any).type === 'ai_agent' || a.name === 'Run AI Agent'),
    );
  }, [categoryConfig]);

  const hasCategoryAutomation = useMemo(() => {
    if (!hasWorkflow || !categoryConfig?.automations) return false;
    const wfAutomation = categoryConfig.automations.find(
      (a) => a.name === 'Run workflow' && a.enabled,
    );
    if (!wfAutomation) return false;
    const wfOption = wfAutomation.options?.find((o) => o.key === 'workflow_id');
    if (!wfOption?.value) return false;
    const ids = wfOption.value.split(',').map((s) => s.trim()).filter(Boolean);
    return matchingWorkflow ? ids.includes(matchingWorkflow.id) : false;
  }, [categoryConfig, hasWorkflow, matchingWorkflow]);

  // SINGLE SOURCE OF TRUTH: defer the "is the agent actually wired up?"
  // decision to useAssignEscalateStatus — the same hook that powers the
  // Automation Readiness banner. Any consumer that reads agentReadiness.active
  // now agrees with that banner by construction (no more "AI Agent is on but
  // Assign & Escalate is off" mismatches).
  const assignOptions = useMemo(() => (orgId ? { orgIds: [orgId] } : undefined), [orgId]);
  const assign = useAssignEscalateStatus(assignOptions);
  const serverActive = assign.active;
  const active = optimistic !== null ? optimistic : serverActive;


  const refetchAll = useCallback(async () => {
    await Promise.allSettled([
      refetchWorkflows(),
      queryClient.invalidateQueries({ queryKey: ['agent-readiness-category-config', orgId || 'active'] }),
    ]);
  }, [refetchWorkflows, queryClient, orgId]);

  const enable = useCallback(async () => {
    setOptimistic(true);
    setIsEnabling(true);
    try {
      const orgHeaders: Record<string, string> = orgId ? { 'Org-Id': orgId } : {};
      // Step 1: ensure the Assign & Escalate workflow exists.
      let workflowId = matchingWorkflow?.id || null;
      if (!workflowId) {
        // Trust the generate API: success: true + an id means it's enabled.
        const results = await Promise.allSettled(
          labels.map((label) =>
            fetch(getApiUrl('/api/v2/workflows/generate'), {
              method: 'POST',
              credentials: 'include',
              headers: { ...getAuthHeader(), ...orgHeaders, 'Content-Type': 'application/json' },
              // schedule-based — no apps required
              body: JSON.stringify({ label, category: 'cases' }),
            }).then(async (r) => {
              try { return await r.json(); } catch { return null; }
            }),
          ),
        );

        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          const body: any = r.value;
          const id = body?.id || body?.workflow_id || body?.workflow?.id;
          if (body?.success === true && id) {
            workflowId = id;
            break;
          }
          if (id && !workflowId) workflowId = id;
        }
        // Best-effort background refresh so cached lists catch up.
        refetchWorkflows();
      }

      if (!workflowId) {
        throw new Error('Assign & Escalate workflow could not be created');
      }

      // Step 2: wire up the "Run workflow" automation on the incidents category.
      // Re-fetch latest config so we don't clobber other automations.
      const latestFetched = await fetchIncidentsCategoryConfig(orgId);
      const latestConfig: CategoryConfig | null =
        latestFetched === CATEGORY_CONFIG_MISSING
          ? null
          : ((latestFetched as CategoryConfig | null | undefined) ?? null);
      const existing = latestConfig?.automations || [];
      const existingByName = new Map(existing.map((a) => [a.name, a]));

      const wfAutomation = existingByName.get('Run workflow');
      const currentIds = (
        wfAutomation?.options?.find((o) => o.key === 'workflow_id')?.value || ''
      )
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!currentIds.includes(workflowId)) currentIds.push(workflowId);

      const updatedRunWorkflow = {
        name: 'Run workflow',
        description:
          wfAutomation?.description ||
          'Runs one or more workflows with the updated value as runtime argument',
        type: undefined as string | undefined,
        options: [{ key: 'workflow_id', value: currentIds.join(',') }],
        icon: '',
        enabled: true,
      };

      // Preserve every other automation as-is, only replace "Run workflow".
      const merged: any[] = existing
        .filter((a) => a.name !== 'Run workflow')
        .map((a) => ({
          name: a.name,
          description: a.description || '',
          type: (a as any).type,
          options: a.options || [],
          icon: (a as any).icon || '',
          enabled: a.enabled,
          ...((a as any).disabled ? { disabled: true } : {}),
        }));
      merged.push(updatedRunWorkflow);

      const payload: any = {
        category: DATASTORE_CATEGORIES.INCIDENTS,
        automations: merged,
        settings: { timeout: latestConfig?.settings?.timeout || 0 },
      };

      await fetch(getApiUrl('/api/v2/datastore/automate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), ...orgHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await refetchAll();
    } finally {
      setIsEnabling(false);
      // Keep optimistic=true sticky. The workflow list cache can lag well
      // past any timeout, and the generate API already confirmed success.
      // Only clear once the server-side state catches up (handled below).
    }
  }, [labels, matchingWorkflow, refetchWorkflows, refetchAll, orgId]);

  // Clear optimistic flag once the server agrees we're active, so we never
  // flicker back to "not enabled" after a successful enable().
  useEffect(() => {
    if (optimistic === true && serverActive) setOptimistic(null);
  }, [optimistic, serverActive]);

  const demoActive = isDemoActive();

  return {
    active: demoActive || active,
    hasAiAgentAutomation: demoActive || hasAiAgentAutomation,
    hasWorkflow: demoActive || hasWorkflow,
    hasCategoryAutomation: demoActive || hasCategoryAutomation,
    isLoading: demoActive ? false : (wfLoading || cfgLoading || assign.isLoading),
    enable,
    isEnabling,
  };
};
