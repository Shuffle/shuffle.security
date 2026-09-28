import { WorkflowSummary } from "@/hooks/useWorkflows";
import { EnvironmentItem, isRunning } from "@/components/settings/DefaultEnvironmentSelector";

export type ProblemSeverity = "critical" | "warning" | "info";

export type ProblemType =
  | "runtime_offline"
  | "workflow_stopped"
  | "queue_jammed"
  | "config_missing";

export interface EntityProblem {
  id: string;
  type: ProblemType;
  severity: ProblemSeverity;
  title: string;
  description: string;
  runtimeLocationName?: string;
  workflowId?: string;
  workflowName?: string;
  actionUrl: string;
  actionLabel: string;
}

export interface EntityHealth {
  status: "healthy" | "problem" | "offline" | "unknown";
  hasProblem: boolean;
  primaryProblem?: EntityProblem;
  problems: EntityProblem[];
  activeCount?: number;
  blockedCount?: number;
}

export type WorkflowLike = {
  id?: string;
  name?: string;
  execution_environment?: string;
  environment?: string;
  actions?: Array<{ environment?: string; [key: string]: any }>;
  triggers?: Array<{ environment?: string; [key: string]: any }>;
  tags?: string[];
  [key: string]: any;
};

/**
 * Resolves the effective runtime location and online status for a workflow.
 */
export function getWorkflowRuntimeLocation(
  workflow: WorkflowLike,
  environments: EnvironmentItem[],
): {
  envName: string;
  isExplicit: boolean;
  isOnline: boolean;
  environment?: EnvironmentItem;
} {
  const actionEnv = workflow.actions?.find((a) => a?.environment)?.environment;
  const triggerEnv = workflow.triggers?.find((t) => t?.environment)?.environment;
  const explicitEnv = workflow.environment || actionEnv || triggerEnv;

  if (!environments || environments.length === 0) {
    const targetName = explicitEnv || "Cloud";
    return {
      envName: targetName,
      isExplicit: Boolean(explicitEnv),
      isOnline: true,
      environment: undefined,
    };
  }

  const defaultEnv = environments.find((e) => e.default);
  const targetName = explicitEnv || defaultEnv?.Name || "Cloud";
  const normalizedTarget = targetName.trim().toLowerCase();

  const matchedEnv = environments.find(
    (e) =>
      (e.Name && e.Name.trim().toLowerCase() === normalizedTarget) ||
      (e.id && e.id === targetName) ||
      (normalizedTarget === "default" && e.default),
  );

  const isCloud =
    normalizedTarget === "cloud" ||
    normalizedTarget === "shuffle cloud" ||
    (normalizedTarget === "default" &&
      (!defaultEnv || defaultEnv.Type === "cloud"));

  const isOnline = matchedEnv ? isRunning(matchedEnv) : isCloud;

  return {
    envName: targetName,
    isExplicit: Boolean(explicitEnv),
    isOnline,
    environment: matchedEnv,
  };
}

/**
 * Diagnoses a single workflow's runtime health.
 */
export function diagnoseWorkflow(
  workflow: WorkflowLike,
  environments: EnvironmentItem[],
): EntityHealth {
  const { envName, isOnline, environment } = getWorkflowRuntimeLocation(
    workflow,
    environments,
  );

  const problems: EntityProblem[] = [];

  if (!isOnline) {
    const queueCount = Number(environment?.queue) || 0;
    problems.push({
      id: `offline-${workflow.id}-${envName}`,
      type: "runtime_offline",
      severity: "critical",
      title: `Runtime Location "${envName}" is Offline`,
      description: queueCount > 0
        ? `Location "${envName}" has stopped reporting with ${queueCount} queued execution${queueCount === 1 ? "" : "s"}. Workflow "${workflow.name || "Untitled"}" cannot execute.`
        : `Location "${envName}" is offline. Workflow "${workflow.name || "Untitled"}" cannot execute until it is reallocated or restarted.`,
      runtimeLocationName: envName,
      workflowId: workflow.id,
      workflowName: workflow.name,
      actionUrl: `/admin/runtime-locations?highlight=${encodeURIComponent(envName)}`,
      actionLabel: "Fix Runtime Location",
    });
  }

  const hasProblem = problems.length > 0;
  return {
    status: hasProblem ? "problem" : "healthy",
    hasProblem,
    primaryProblem: problems[0],
    problems,
    activeCount: hasProblem ? 0 : 1,
    blockedCount: hasProblem ? 1 : 0,
  };
}

/**
 * Diagnoses the overall health of a usecase based on its associated workflows.
 */
export function diagnoseUsecase(
  usecaseWorkflows: WorkflowLike[],
  environments: EnvironmentItem[],
): EntityHealth {
  if (!usecaseWorkflows || usecaseWorkflows.length === 0) {
    return {
      status: "unknown",
      hasProblem: false,
      problems: [],
      activeCount: 0,
      blockedCount: 0,
    };
  }

  const problems: EntityProblem[] = [];
  let blockedCount = 0;
  let activeCount = 0;

  for (const wf of usecaseWorkflows) {
    const wfHealth = diagnoseWorkflow(wf, environments);
    if (wfHealth.hasProblem) {
      blockedCount += 1;
      for (const p of wfHealth.problems) {
        if (!problems.some((existing) => existing.id === p.id)) {
          problems.push(p);
        }
      }
    } else {
      activeCount += 1;
    }
  }

  const hasProblem = problems.length > 0;
  return {
    status: hasProblem ? "problem" : "healthy",
    hasProblem,
    primaryProblem: problems[0],
    problems,
    activeCount,
    blockedCount,
  };
}

/**
 * Checks webhook ingestion workflow health (e.g. Ingestion Webhook / Vulnerability Ingestion Webhook).
 */
export function diagnoseWebhookIngestion(
  workflows: WorkflowSummary[],
  environments: EnvironmentItem[],
  mode: "tickets" | "vulnerabilities" = "tickets",
): EntityHealth {
  const targetLabel = mode === "vulnerabilities" ? "Vulnerability Ingestion Webhook" : "Ingestion Webhook";
  const normTarget = targetLabel.toLowerCase();

  const webhookWf = workflows.find((w) => {
    const name = (w.name || "").toLowerCase();
    return name === normTarget || name.includes(normTarget);
  });

  if (!webhookWf) {
    return {
      status: "unknown",
      hasProblem: false,
      problems: [],
    };
  }

  return diagnoseWorkflow(webhookWf, environments);
}

/**
 * Checks ingestion app health (e.g. Gmail in Ingest Tickets).
 */
export function diagnoseIngestionSource(
  sourceKey: string,
  workflows: WorkflowSummary[],
  environments: EnvironmentItem[],
  mode: "tickets" | "vulnerabilities" = "tickets",
): EntityHealth {
  const parentWorkflowName = mode === "vulnerabilities" ? "Ingest Vulnerabilities" : "Ingest Tickets";
  const normName = parentWorkflowName.toLowerCase();

  const parentWf = workflows.find((w) => {
    const name = (w.name || "").toLowerCase();
    return name === normName || name.includes(normName);
  });

  if (!parentWf) {
    return {
      status: "unknown",
      hasProblem: false,
      problems: [],
    };
  }

  const wfHealth = diagnoseWorkflow(parentWf, environments);
  if (wfHealth.hasProblem && wfHealth.primaryProblem) {
    return {
      status: "problem",
      hasProblem: true,
      primaryProblem: {
        ...wfHealth.primaryProblem,
        title: `${sourceKey} Ingestion Blocked`,
        description: `Runtime location "${wfHealth.primaryProblem.runtimeLocationName}" is offline. Ingestion workflows for ${sourceKey} cannot execute until resolved.`,
      },
      problems: wfHealth.problems,
    };
  }

  return wfHealth;
}
