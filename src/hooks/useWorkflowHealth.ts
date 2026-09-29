import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, getAuthHeader, hasShuffleAuth } from "@/Shuffle-Core/api";
import { useAuth } from "@/context/AuthContext";
import { WorkflowSummary, useWorkflows } from "@/hooks/useWorkflows";
import { EnvironmentItem } from "@/components/settings/DefaultEnvironmentSelector";
import {
  EntityHealth,
  diagnoseWorkflow,
  diagnoseUsecase,
  diagnoseWebhookIngestion,
  diagnoseIngestionSource,
} from "@/services/workflowHealth";

export interface WorkflowHealthHookResult {
  environments: EnvironmentItem[];
  workflows: WorkflowSummary[];
  isLoading: boolean;
  refetch: () => Promise<void>;
  getWorkflowHealth: (workflow: WorkflowSummary) => EntityHealth;
  getUsecaseHealth: (usecaseWorkflows: WorkflowSummary[]) => EntityHealth;
  getWebhookHealth: (mode?: "tickets" | "vulnerabilities") => EntityHealth;
  getSourceHealth: (
    sourceKey: string,
    mode?: "tickets" | "vulnerabilities",
  ) => EntityHealth;
}

export const useWorkflowHealth = (): WorkflowHealthHookResult => {
  const { userInfo } = useAuth();
  const orgId = userInfo?.active_org?.id;

  const {
    data: workflows = [],
    isLoading: workflowsLoading,
    refetch: refetchWorkflows,
  } = useWorkflows();

  const {
    data: environments = [],
    isLoading: envsLoading,
    refetch: refetchEnvs,
  } = useQuery<EnvironmentItem[]>({
    queryKey: ["workflow-health-environments", orgId || "active"],
    queryFn: async () => {
      const headers: Record<string, string> = { ...getAuthHeader() };
      if (orgId) headers["Org-Id"] = orgId;
      const res = await fetch(getApiUrl("/api/v1/getenvironments"), {
        credentials: "include",
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

  const getWorkflowHealth = useCallback(
    (workflow: WorkflowSummary): EntityHealth => {
      return diagnoseWorkflow(workflow, environments);
    },
    [environments],
  );

  const getUsecaseHealth = useCallback(
    (usecaseWorkflows: WorkflowSummary[]): EntityHealth => {
      return diagnoseUsecase(usecaseWorkflows, environments);
    },
    [environments],
  );

  const getWebhookHealth = useCallback(
    (mode: "tickets" | "vulnerabilities" = "tickets"): EntityHealth => {
      return diagnoseWebhookIngestion(workflows, environments, mode);
    },
    [workflows, environments],
  );

  const getSourceHealth = useCallback(
    (
      sourceKey: string,
      mode: "tickets" | "vulnerabilities" = "tickets",
    ): EntityHealth => {
      return diagnoseIngestionSource(sourceKey, workflows, environments, mode);
    },
    [workflows, environments],
  );

  const refetch = useCallback(async () => {
    await Promise.allSettled([refetchWorkflows(), refetchEnvs()]);
  }, [refetchWorkflows, refetchEnvs]);

  return {
    environments,
    workflows,
    isLoading: workflowsLoading || envsLoading,
    refetch,
    getWorkflowHealth,
    getUsecaseHealth,
    getWebhookHealth,
    getSourceHealth,
  };
};
