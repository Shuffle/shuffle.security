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
 * A workflow is considered active if:
 * 1. It is valid (`is_valid !== false`).
 * 2. Background processing is not disabled (`background_processing !== false`).
 * 3. Triggers (if configured) are not all in a 'stopped' state.
 */
export function isRoutingWorkflowActive(workflow: WorkflowSummary | null | undefined): boolean {
  if (!workflow) return false;
  if (workflow.is_valid === false) return false;
  if (workflow.background_processing === false) return false;

  const triggers = workflow.triggers;
  if (Array.isArray(triggers) && triggers.length > 0) {
    const allStopped = triggers.every(
      (t: any) => (t?.status || '').toLowerCase() === 'stopped',
    );
    if (allStopped) return false;
  }

  return true;
}
