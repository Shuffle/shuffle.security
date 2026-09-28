import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { useAuth } from '@/context/AuthContext';
import { useWorkflows, type WorkflowSummary } from '@/hooks/useWorkflows';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { getDatastoreByCategory } from '@/Shuffle-MCPs/datastore';
import {
  findRoutingWorkflow,
  isWorkflowHookedToCategory,
  getExpectedRoutingWorkflowLabel,
  type EntityLabel,
} from '@/utils/routingWorkflowUtils';

export interface UseRoutingWorkflowStatusProps {
  entityCategory?: string;
  entityLabel?: EntityLabel;
  orgId?: string;
}

export type RoutingWorkflowStatusType =
  | 'checking'
  | 'not_automated'
  | 'not_in_automations'
  | 'automated';

export interface RoutingWorkflowStatusResult {
  matchedWorkflow: WorkflowSummary | null;
  categoryConfig: any;
  workflowExists: boolean;
  isInAutomations: boolean;
  isAutomated: boolean;
  status: RoutingWorkflowStatusType;
  label: string;
  message: string;
  isLoading: boolean;
  isLinkingHook: boolean;
  isGeneratingWorkflow: boolean;
  linkHook: () => Promise<boolean>;
  generateWorkflow: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useRoutingWorkflowStatus({
  entityCategory = 'shuffle-security_incidents',
  entityLabel = { singular: 'incident', plural: 'incidents' },
  orgId,
}: UseRoutingWorkflowStatusProps = {}): RoutingWorkflowStatusResult {
  const { userInfo } = useAuth();
  const effectiveOrgId = orgId || userInfo?.active_org?.id;
  const queryClient = useQueryClient();

  const {
    data: workflows = [],
    isLoading: workflowsLoading,
    refetch: refetchWorkflows,
  } = useWorkflows(effectiveOrgId);

  const matchedWorkflow = useMemo(
    () => findRoutingWorkflow(workflows, entityLabel, entityCategory),
    [workflows, entityLabel, entityCategory],
  );

  const {
    data: categoryConfig,
    isLoading: configLoading,
    refetch: refetchCategoryConfig,
  } = useQuery({
    queryKey: ['category-config-automations', effectiveOrgId, entityCategory],
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      try {
        const res: any = await getDatastoreByCategory(entityCategory, undefined, 1, effectiveOrgId);
        return res?.categoryConfig || null;
      } catch (err) {
        console.warn('Failed to fetch category config for routing status:', err);
        return null;
      }
    },
    staleTime: 30_000,
  });

  // Listen for automation updates or workflow toggles across the application
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => {
      refetchWorkflows();
      refetchCategoryConfig();
    };
    window.addEventListener('shuffle-workflows-updated', handleUpdate);
    window.addEventListener('shuffle-workflow-toggled', handleUpdate);
    window.addEventListener('shuffle-category-automations-updated', handleUpdate);
    return () => {
      window.removeEventListener('shuffle-workflows-updated', handleUpdate);
      window.removeEventListener('shuffle-workflow-toggled', handleUpdate);
      window.removeEventListener('shuffle-category-automations-updated', handleUpdate);
    };
  }, [refetchWorkflows, refetchCategoryConfig]);

  // Check 1: Does the workflow exist?
  const workflowExists = !!matchedWorkflow;

  // Check 2: Is it in the "Automation for X" category settings?
  const isInAutomations = useMemo(
    () => isWorkflowHookedToCategory(matchedWorkflow?.id, categoryConfig),
    [matchedWorkflow?.id, categoryConfig],
  );

  const isAutomated = workflowExists && isInAutomations;
  const isLoading = workflowsLoading || (configLoading && !categoryConfig);

  const [isLinkingHook, setIsLinkingHook] = useState(false);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);

  const plural = entityLabel?.plural || 'incidents';
  const plurCap = plural.charAt(0).toUpperCase() + plural.slice(1);

  let status: RoutingWorkflowStatusType = 'not_automated';
  let label = 'Not automated';
  let message = `No workflow found for ${plural}. Rules will not run automatically until a workflow is created. Click to create.`;

  if (isLoading) {
    status = 'checking';
    label = 'Checking…';
    message = 'Checking backing workflow and category automation status.';
  } else if (isAutomated && matchedWorkflow) {
    status = 'automated';
    label = 'Automated';
    message = `Rules automated in background by "${matchedWorkflow.name}". Click to open workflow.`;
  } else if (workflowExists && matchedWorkflow) {
    status = 'not_in_automations';
    label = 'Not in category automations';
    message = `Workflow "${matchedWorkflow.name}" exists, but is not in "Automation for ${plurCap}" category settings. Click to add.`;
  }

  const linkHook = useCallback(async (): Promise<boolean> => {
    if (!matchedWorkflow?.id || !effectiveOrgId) return false;
    setIsLinkingHook(true);
    try {
      const currentAutomations = Array.isArray(categoryConfig?.automations)
        ? [...categoryConfig.automations]
        : Array.isArray(categoryConfig?.Automations)
          ? [...categoryConfig.Automations]
          : [];

      const existingIdx = currentAutomations.findIndex(
        (a: any) => (a?.name || a?.Name || '').toLowerCase() === 'run workflow',
      );

      if (existingIdx >= 0) {
        const existingAuto = { ...currentAutomations[existingIdx] };
        existingAuto.enabled = true;
        const options = Array.isArray(existingAuto.options)
          ? [...existingAuto.options]
          : Array.isArray(existingAuto.Options)
            ? [...existingAuto.Options]
            : [];
        const wfOptIdx = options.findIndex(
          (o: any) => (o.key || o.Key || '').toLowerCase() === 'workflow_id',
        );
        if (wfOptIdx >= 0) {
          const currentVal = String(options[wfOptIdx].value || options[wfOptIdx].Value || '');
          const ids = currentVal.split(',').map((id: string) => id.trim()).filter(Boolean);
          if (!ids.includes(matchedWorkflow.id)) {
            ids.push(matchedWorkflow.id);
          }
          options[wfOptIdx] = { ...options[wfOptIdx], value: ids.join(',') };
        } else {
          options.push({ key: 'workflow_id', value: matchedWorkflow.id });
        }
        existingAuto.options = options;
        currentAutomations[existingIdx] = existingAuto;
      } else {
        currentAutomations.push({
          name: 'Run workflow',
          description: 'Runs one or more workflows with the updated value as runtime argument',
          type: 'workflow',
          enabled: true,
          options: [{ key: 'workflow_id', value: matchedWorkflow.id }],
        });
      }

      const payload = {
        category: entityCategory,
        automations: currentAutomations,
        settings: categoryConfig?.settings || categoryConfig?.Settings || {},
      };

      const res = await fetch(getApiUrl('/api/v2/datastore/automate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(effectiveOrgId),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed to update category automation (${res.status})`);
      }

      toast.success(`Added "${matchedWorkflow.name}" to Automation for ${plurCap}`);
      queryClient.invalidateQueries({
        queryKey: ['category-config-automations', effectiveOrgId, entityCategory],
      });
      window.dispatchEvent(
        new CustomEvent('shuffle-category-automations-updated', {
          detail: { category: entityCategory },
        }),
      );
      await refetchCategoryConfig();
      return true;
    } catch (err: any) {
      console.error('Failed to link category automation hook:', err);
      toast.error(err?.message || 'Failed to add workflow to category automations');
      return false;
    } finally {
      setIsLinkingHook(false);
    }
  }, [matchedWorkflow, effectiveOrgId, categoryConfig, entityCategory, plurCap, queryClient, refetchCategoryConfig]);

  const generateWorkflow = useCallback(async (): Promise<void> => {
    setIsGeneratingWorkflow(true);
    const targetLabel = getExpectedRoutingWorkflowLabel(entityLabel, entityCategory);
    const effectiveCategory =
      entityCategory === 'shuffle-security_incidents' ? 'cases' : entityCategory;
    try {
      const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(effectiveOrgId), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: targetLabel,
          category: effectiveCategory,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.reason || `Failed to create workflow (${res.status})`);
      }
      toast.success(`Workflow "${targetLabel}" created`);
      window.dispatchEvent(
        new CustomEvent('shuffle-workflow-toggled', {
          detail: { label: targetLabel, enabled: true },
        }),
      );
      window.dispatchEvent(new CustomEvent('shuffle-workflows-updated'));
      window.dispatchEvent(
        new CustomEvent('shuffle-category-automations-updated', {
          detail: { category: entityCategory },
        }),
      );
      await refetchWorkflows();
      await refetchCategoryConfig();
    } catch (err: any) {
      console.error('Failed to create routing workflow:', err);
      toast.error(err?.message || 'Failed to create routing workflow');
    } finally {
      setIsGeneratingWorkflow(false);
    }
  }, [effectiveOrgId, entityCategory, entityLabel, refetchWorkflows, refetchCategoryConfig]);

  const refetch = useCallback(async () => {
    await Promise.all([refetchWorkflows(), refetchCategoryConfig()]);
  }, [refetchWorkflows, refetchCategoryConfig]);

  return {
    matchedWorkflow,
    categoryConfig,
    workflowExists,
    isInAutomations,
    isAutomated,
    status,
    label,
    message,
    isLoading,
    isLinkingHook,
    isGeneratingWorkflow,
    linkHook,
    generateWorkflow,
    refetch,
  };
}
