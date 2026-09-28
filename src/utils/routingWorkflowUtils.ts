/**
 * Utilities for resolving and validating the backing workflow for category routing rules.
 *
 * Routing rules can be scoped to various entity categories (incidents,
 * vulnerabilities, infrastructure/sensors, assets, packages, software, users).
 * Each category relies on a backing workflow (e.g. "Incident Routing Rules",
 * "Vulnerabilities Routing Rules") to evaluate rules when items are created or edited.
 */

import type { WorkflowSummary } from '@/hooks/useWorkflows';

export interface EntityLabel {
  singular: string;
  plural: string;
}

/**
 * Returns the canonical workflow label sent to POST /api/v2/workflows/generate
 * when creating a routing workflow for an entity category.
 */
export function getExpectedRoutingWorkflowLabel(
  entityLabel?: EntityLabel,
  entityCategory?: string,
): string {
  const singular = (entityLabel?.singular || 'incident').toLowerCase();
  const plural = (entityLabel?.plural || 'incidents').toLowerCase();

  // Incidents use the legacy canonical label defined in platform usecases
  if (singular === 'incident' || entityCategory?.includes('incident') || entityCategory === 'cases') {
    return 'Incident Routing Rules';
  }

  const plurCap = plural.charAt(0).toUpperCase() + plural.slice(1);
  return `${plurCap} Routing Rules`;
}

/**
 * Normalizes string for fuzzy/alias comparisons.
 */
function normalize(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the workflow responsible for executing routing rules for the given entity category.
 * Strictly scopes matches so categories never falsely claim another category's workflow.
 */
export function findRoutingWorkflow(
  workflows: WorkflowSummary[] | undefined | null,
  entityLabel?: EntityLabel,
  entityCategory?: string,
): WorkflowSummary | null {
  if (!Array.isArray(workflows) || workflows.length === 0) return null;

  const singular = (entityLabel?.singular || 'incident').toLowerCase();
  const plural = (entityLabel?.plural || 'incidents').toLowerCase();
  const singCap = singular.charAt(0).toUpperCase() + singular.slice(1);
  const plurCap = plural.charAt(0).toUpperCase() + plural.slice(1);

  const isIncident =
    singular === 'incident' ||
    entityCategory?.includes('incident') ||
    entityCategory === 'cases' ||
    entityCategory === 'shuffle-security_cases';

  const isVuln =
    singular.startsWith('vuln') ||
    entityCategory?.includes('vuln');

  const isSensor =
    singular === 'sensor' ||
    singular.includes('infra') ||
    entityCategory?.includes('infrastructure');

  const isAsset =
    singular === 'asset' ||
    entityCategory?.includes('asset');

  // Candidate exact labels (normalized)
  const canonicalCandidates = new Set<string>([
    normalize(`${plurCap} Routing Rules`),
    normalize(`${singCap} Routing Rules`),
    normalize(`${plurCap} Routing`),
    normalize(`${singCap} Routing`),
  ]);

  if (isIncident) {
    canonicalCandidates.add(normalize('Incident Routing Rules'));
    canonicalCandidates.add(normalize('Incidents Routing Rules'));
    canonicalCandidates.add(normalize('Incident Routing'));
    canonicalCandidates.add(normalize('Cases Routing Rules'));
  } else if (isVuln) {
    canonicalCandidates.add(normalize('Vulnerability Routing Rules'));
    canonicalCandidates.add(normalize('Vulnerabilities Routing Rules'));
    canonicalCandidates.add(normalize('Vulnerability Routing'));
    canonicalCandidates.add(normalize('Vulnerabilities Routing'));
  } else if (isSensor) {
    canonicalCandidates.add(normalize('Sensors Routing Rules'));
    canonicalCandidates.add(normalize('Sensor Routing Rules'));
    canonicalCandidates.add(normalize('Infrastructure Routing Rules'));
    canonicalCandidates.add(normalize('Infrastructure Routing'));
  } else if (isAsset) {
    canonicalCandidates.add(normalize('Assets Routing Rules'));
    canonicalCandidates.add(normalize('Asset Routing Rules'));
    canonicalCandidates.add(normalize('Asset Routing'));
  }

  // 1. Pass 1: Exact match on normalized workflow name
  for (const wf of workflows) {
    const nameNorm = normalize(wf?.name || '');
    if (canonicalCandidates.has(nameNorm)) {
      return wf;
    }
  }

  // 2. Pass 2: Exact match on any tag
  for (const wf of workflows) {
    const tags = Array.isArray(wf?.tags) ? wf.tags : [];
    for (const tag of tags) {
      if (canonicalCandidates.has(normalize(String(tag)))) {
        return wf;
      }
    }
  }

  // 3. Pass 3: Fuzzy keyword match with category boundary enforcement
  for (const wf of workflows) {
    const nameNorm = normalize(wf?.name || '');
    const tagsNorm = (Array.isArray(wf?.tags) ? wf.tags : []).map((t) => normalize(String(t)));
    const hasRouting = nameNorm.includes('routing') || tagsNorm.some((t) => t.includes('routing'));
    if (!hasRouting) continue;

    // Reject cross-category matches
    if (isIncident) {
      if (nameNorm.includes('vuln') || nameNorm.includes('sensor') || nameNorm.includes('asset')) continue;
      const matchesIncident =
        nameNorm.includes('incident') ||
        nameNorm.includes('case') ||
        tagsNorm.some((t) => t.includes('incident') || t.includes('case'));
      if (matchesIncident) return wf;
    } else if (isVuln) {
      if (nameNorm.includes('incident') || nameNorm.includes('case') || nameNorm.includes('sensor')) continue;
      const matchesVuln =
        nameNorm.includes('vuln') ||
        tagsNorm.some((t) => t.includes('vuln'));
      if (matchesVuln) return wf;
    } else if (isSensor) {
      if (nameNorm.includes('incident') || nameNorm.includes('vuln')) continue;
      const matchesSensor =
        nameNorm.includes('sensor') ||
        nameNorm.includes('infra') ||
        tagsNorm.some((t) => t.includes('sensor') || t.includes('infra'));
      if (matchesSensor) return wf;
    } else if (isAsset) {
      if (nameNorm.includes('incident') || nameNorm.includes('vuln')) continue;
      const matchesAsset =
        nameNorm.includes('asset') ||
        tagsNorm.some((t) => t.includes('asset'));
      if (matchesAsset) return wf;
    } else {
      // General entity match
      const matchesGeneric =
        nameNorm.includes(singular) ||
        nameNorm.includes(plural) ||
        tagsNorm.some((t) => t.includes(singular) || t.includes(plural));
      if (matchesGeneric) return wf;
    }
  }

  return null;
}

/**
 * Checks whether the workflow is actively executing routing rules.
 * Deprecated: Routing rules are event-driven via category automations.
 * Evaluates whether the workflow exists. Use isRoutingWorkflowConfigured instead.
 */
export function isRoutingWorkflowActive(workflow: WorkflowSummary | null | undefined): boolean {
  return !!workflow;
}

/**
 * Checks the two primary criteria for category routing rules:
 * 1. Does the workflow exist?
 * 2. Is it in the "Automation for X" category settings?
 */
export function isRoutingWorkflowConfigured(
  workflow: WorkflowSummary | null | undefined,
  categoryConfig: any,
): {
  workflowExists: boolean;
  isInAutomations: boolean;
  isAutomated: boolean;
} {
  const workflowExists = !!workflow;
  const isInAutomations = isWorkflowHookedToCategory(workflow?.id, categoryConfig);
  return {
    workflowExists,
    isInAutomations,
    isAutomated: workflowExists && isInAutomations,
  };
}

/**
 * Verifies whether a workflow ID is registered as an active 'Run workflow'
 * automation in the given datastore category configuration.
 */
export function isWorkflowHookedToCategory(
  workflowId: string | undefined | null,
  categoryConfig: any,
): boolean {
  if (!workflowId || !categoryConfig) return false;
  const automations = Array.isArray(categoryConfig.automations)
    ? categoryConfig.automations
    : Array.isArray(categoryConfig.Automations)
      ? categoryConfig.Automations
      : [];

  return automations.some((auto: any) => {
    const name = (auto?.name || auto?.Name || '').toLowerCase();
    if (name !== 'run workflow') return false;
    if (auto?.enabled === false || auto?.Enabled === false) return false;

    const options = Array.isArray(auto?.options)
      ? auto.options
      : Array.isArray(auto?.Options)
        ? auto.Options
        : [];

    const wfOption = options.find((opt: any) => {
      const k = (opt?.key || opt?.Key || '').toLowerCase();
      return k === 'workflow_id';
    });

    if (!wfOption) return false;
    const val = String(wfOption.value || wfOption.Value || '');
    return val.split(',').some((id) => id.trim() === workflowId);
  });
}

export type RoutingWorkflowHealthStatus =
  | 'checking'
  | 'not_automated'
  | 'hook_missing'
  | 'execution_error'
  | 'automated';

export interface RoutingWorkflowExecutionSummary {
  id: string;
  status: string; // e.g., 'finished', 'failed', 'aborted', 'running'
  started_at?: number | string;
  completed_at?: number | string;
  error?: string;
}

export interface RoutingWorkflowHealth {
  status: RoutingWorkflowHealthStatus;
  label: string;
  message: string;
  isHooked: boolean;
  lastExecution?: RoutingWorkflowExecutionSummary | null;
}

/**
 * Computes end-to-end health of routing automation for an entity category.
 * Strictly enforces:
 * 1. Does the workflow exist?
 * 2. Is it in the "Automation for X" category settings?
 */
export function evaluateRoutingWorkflowHealth(params: {
  workflow: WorkflowSummary | null | undefined;
  categoryConfig: any;
  lastExecution?: RoutingWorkflowExecutionSummary | null;
  loading?: boolean;
  entityLabel?: EntityLabel;
}): RoutingWorkflowHealth {
  const { workflow, categoryConfig, lastExecution, loading, entityLabel } = params;
  const plural = entityLabel?.plural || 'incidents';
  const plurCap = plural.charAt(0).toUpperCase() + plural.slice(1);

  if (loading) {
    return {
      status: 'checking',
      label: 'Checking…',
      message: 'Checking workflow and category automation status.',
      isHooked: false,
      lastExecution: null,
    };
  }

  // 1. Does the workflow exist?
  if (!workflow) {
    return {
      status: 'not_automated',
      label: 'Not automated',
      message: `No workflow found for ${plural}. Rules will not run until a workflow is created.`,
      isHooked: false,
      lastExecution: null,
    };
  }

  // 2. Is it in the "Automation for X" category settings?
  const isHooked = isWorkflowHookedToCategory(workflow.id, categoryConfig);

  if (!isHooked) {
    return {
      status: 'hook_missing',
      label: 'Not in category automations',
      message: `Workflow exists (${workflow.name}), but is not configured in "Automation for ${plurCap}" category settings. Edits will not trigger rules.`,
      isHooked: false,
      lastExecution,
    };
  }

  const execStatus = (lastExecution?.status || '').toLowerCase();
  if (execStatus === 'failed' || execStatus === 'aborted') {
    return {
      status: 'execution_error',
      label: 'Run error',
      message: `The most recent workflow execution (${lastExecution?.id || 'unknown'}) failed: ${lastExecution?.error || 'Execution encountered an error.'}`,
      isHooked: true,
      lastExecution,
    };
  }

  return {
    status: 'automated',
    label: 'Automated',
    message: `Rules evaluated in realtime by "${workflow.name}".`,
    isHooked: true,
    lastExecution,
  };
}
