/**
 * Shared app category detection utilities.
 * Used by onboarding (AutomationConfig) and incident automations (CategoryAutomationsDialog).
 */

import { AuthAppEntry, deduplicateAuthApps, isValidationFresh } from './auth-utils';

// ============================================================================
// Category patterns
// ============================================================================
// Patterns are matched as case-insensitive substrings against the app NAME.
// Keep them specific enough to avoid pulling unrelated apps into a column:
//   - Bare 'email' caught random apps like "Send Email" / "Email Validator".
//   - 'vmware' / 'falcon' / 'defender' pulled in non-EDR vendor tools.
//   - 'sentinel' alone catches "Microsoft Sentinel" (SIEM) AND "SentinelOne" (EDR),
//     so SIEM uses 'microsoft sentinel' and 'azure sentinel' explicitly.
export const EMAIL_APP_PATTERNS = ['gmail', 'outlook', 'microsoft_graph', 'office365', 'exchange', 'imap', 'smtp', 'proofpoint', 'mimecast', 'phishing'];
export const CASES_PATTERNS = ['jira', 'servicenow', 'zendesk', 'freshdesk', 'pagerduty', 'opsgenie', 'ticket', 'itsm', 'salesforce', 'thehive', 'cortex'];
export const EDR_PATTERNS = ['crowdstrike', 'sentinelone', 'carbon black', 'cybereason', 'microsoft defender', 'defender for endpoint', 'cylance', 'sophos', 'trellix', 'tanium', 'crowdstrike falcon', 'edr', 'xdr'];
export const SIEM_PATTERNS = ['splunk', 'elastic', 'qradar', 'microsoft sentinel', 'azure sentinel', 'chronicle', 'logrhythm', 'sumo logic', 'graylog', 'wazuh', 'siem', 'arcsight'];
export const THREAT_INTEL_PATTERNS = ['virustotal', 'shodan', 'alienvault', 'otx', 'threatcrowd', 'urlscan', 'hybrid-analysis', 'abuseipdb', 'greynoise', 'urlhaus', 'malwarebazaar', 'threatfox', 'misp', 'opencti', 'recorded future', 'mandiant', 'crowdstrike intel', 'intel471', 'flashpoint', 'domaintools'];
export const COMMUNICATION_PATTERNS_NAMES = ['slack', 'teams', 'discord', 'mattermost', 'telegram', 'webhook'];
export const VULN_SCANNER_PATTERNS = ['qualys', 'tenable', 'nessus', 'rapid7', 'nexpose', 'snyk', 'sonarqube', 'trivy', 'grype', 'anchore', 'dependabot', 'aws_inspector', 'azure_defender', 'gcp_scc', 'scout', 'prowler', 'checkov', 'wiz', 'orca', 'lacework', 'prisma'];

// ============================================================================
// Detection helpers
// ============================================================================
export const isEmailApp = (appName: string): boolean =>
  EMAIL_APP_PATTERNS.some(pattern => appName.toLowerCase().includes(pattern));

export const isThreatIntelApp = (appName: string): boolean =>
  THREAT_INTEL_PATTERNS.some(pattern => appName.toLowerCase().includes(pattern));

export const isVulnScannerApp = (appName: string): boolean =>
  VULN_SCANNER_PATTERNS.some(pattern => appName.toLowerCase().includes(pattern));

export const isIngestionApp = (appName: string): boolean => {
  const name = appName.toLowerCase();
  return isEmailApp(appName) ||
    CASES_PATTERNS.some(p => name.includes(p)) ||
    EDR_PATTERNS.some(p => name.includes(p)) ||
    SIEM_PATTERNS.some(p => name.includes(p));
};

export type IngestionCategory = 'email' | 'cases' | 'edr' | 'siem' | 'other';

export const normalizeAppName = (name: string): string =>
  name.toLowerCase().trim().replace(/[\s_\-]+/g, '_');

/**
 * Internal/framework "apps" that are part of the Shuffle runtime itself rather
 * than third-party integrations. These can appear inside workflow actions
 * (e.g. Shuffle Tools, Singul, generic Integration wrapper, AI Agent) but must
 * never be surfaced as user-facing usecase apps, nor sent back to
 * `/api/v2/workflows/generate` as `app_name` entries.
 *
 * Matched against {@link normalizeAppName} so all casing / spacing / dash
 * variations resolve to the same key.
 */
export const IGNORED_WORKFLOW_APP_NAMES: ReadonlySet<string> = new Set([
  'shuffle_tools',
  'singul',
  'integration',
  'ai_agent',
  'shuffle_agent',
  'shuffle_ai',
]);

/** True if the given (possibly raw) app name is an internal Shuffle runtime
 *  app that should be hidden from usecase UI and excluded from save payloads. */
export const isIgnoredWorkflowAppName = (name: string): boolean =>
  IGNORED_WORKFLOW_APP_NAMES.has(normalizeAppName(name));

/** Hex-string IDs (e.g. "3e2bdf9d5069fe3f4746c29d68785a6a") sometimes leak
 *  into app_name fields. They are not real app names — filter them out. */
const looksLikeOpaqueId = (raw: string): boolean => {
  const trimmed = raw.trim();
  // 16+ char hex strings, or UUID-shaped values.
  if (/^[a-f0-9]{16,}$/i.test(trimmed)) return true;
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed)) return true;
  return false;
};

const addWorkflowAppName = (names: string[], seen: Set<string>, raw: unknown) => {
  if (typeof raw !== 'string' || !raw.trim()) return;
  // Comma-separated app names (e.g. "Wazuh,Gmail") need to be split into
  // individual entries so each app gets its own tile.
  const parts = raw.includes(',') ? raw.split(',') : [raw];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = normalizeAppName(trimmed);
    if (!key || isIgnoredWorkflowAppName(trimmed) || looksLikeOpaqueId(trimmed) || seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
};

const collectParameterAppNames = (input: unknown, names: string[], seen: Set<string>, depth = 0) => {
  if (!input || depth > 4) return;
  if (Array.isArray(input)) {
    input.forEach((item) => collectParameterAppNames(item, names, seen, depth + 1));
    return;
  }
  if (typeof input !== 'object') return;
  const obj = input as Record<string, unknown>;
  if (String(obj.name || '').toLowerCase() === 'app_name') addWorkflowAppName(names, seen, obj.value);
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (lower === 'app_name') addWorkflowAppName(names, seen, value);
    else if (lower === 'parameters' || lower === 'fields' || lower === 'value') collectParameterAppNames(value, names, seen, depth + 1);
  }
};

export function extractActionAppNames(action: any): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  collectParameterAppNames(action?.parameters, names, seen);
  addWorkflowAppName(names, seen, action?.app_name);
  addWorkflowAppName(names, seen, action?.app_id);
  return names;
}

export function extractWorkflowActionAppNames(workflow: any): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  if (!workflow?.actions || !Array.isArray(workflow.actions)) return names;
  for (const action of workflow.actions) {
    for (const name of extractActionAppNames(action)) addWorkflowAppName(names, seen, name);
  }
  return names;
}

export const getIngestionCategory = (appName: string, appCategories?: string[]): IngestionCategory | null => {
  const name = appName.toLowerCase();
  const categories = (appCategories || []).map(c => c.toLowerCase());
  
  if (isEmailApp(name)) return 'email';
  if (CASES_PATTERNS.some(p => name.includes(p)) || categories.includes('cases') || categories.includes('itsm')) return 'cases';
  if (EDR_PATTERNS.some(p => name.includes(p)) || categories.includes('edr') || categories.includes('endpoint')) return 'edr';
  if (SIEM_PATTERNS.some(p => name.includes(p)) || categories.includes('siem')) return 'siem';
  
  return null;
};

// ============================================================================
// Workflow-based ingestion detection
// ============================================================================

/** Name of the workflow that powers automatic ingestion */
export const INGEST_TICKETS_WORKFLOW_NAME = 'Ingest Tickets';

/** Name of the workflow that powers forward tickets */
export const FORWARD_TICKETS_WORKFLOW_NAME = 'Forward Tickets';

/**
 * Extract normalized app names from a workflow's actions.
 * Returns a Set of normalized app names found in the workflow.
 */
export function extractWorkflowAppNames(workflow: any): Set<string> {
  const names = new Set<string>();
  for (const raw of extractWorkflowActionAppNames(workflow)) {
    // Defensive: even if upstream collectors miss it, re-split comma-joined
    // values (e.g. "Wazuh,Gmail") and drop ignored runtime apps + opaque IDs
    // so the "Selected apps" row never renders a single chip like
    // "wazuh,gmail" or a 32-char hex blob.
    const parts = typeof raw === 'string' && raw.includes(',') ? raw.split(',') : [raw];
    for (const part of parts) {
      const trimmed = (part || '').trim();
      if (!trimmed) continue;
      if (isIgnoredWorkflowAppName(trimmed)) continue;
      if (looksLikeOpaqueId(trimmed)) continue;
      const key = normalizeAppName(trimmed);
      if (!key) continue;
      names.add(key);
    }
  }
  return names;
}

/**
 * Find the 'Ingest Tickets' workflow from a list of workflows.
 * Returns the workflow object or null.
 */
export function findIngestTicketsWorkflow(workflows: any[]): any | null {
  return workflows.find(w => w.name === INGEST_TICKETS_WORKFLOW_NAME) || null;
}

/**
 * Check if a workflow's schedule/trigger is stopped.
 * Returns true if all triggers are stopped or the workflow has no triggers.
 */
export function isWorkflowScheduleStopped(workflow: any): boolean {
  if (!workflow) return true;
  const triggers = workflow.triggers;
  if (!Array.isArray(triggers) || triggers.length === 0) return true;
  // If every trigger is explicitly stopped, the workflow is effectively disabled
  return triggers.every(
    (t: any) => (t.status || '').toLowerCase() === 'stopped'
  );
}

/**
 * Find the 'Forward Tickets' workflow from a list of workflows.
 * Returns the workflow object or null.
 */
export function findForwardTicketsWorkflow(workflows: any[]): any | null {
  return workflows.find(w => w.name === FORWARD_TICKETS_WORKFLOW_NAME) || null;
}

// ============================================================================
// Validated ingestion app extraction from raw API data
// ============================================================================
export interface ValidatedIngestionApp {
  id: string;
  name: string;
  image?: string;
  validated: boolean;
  enabled: boolean;
  category: IngestionCategory;
}

/**
 * Extract validated apps from the raw /api/v1/apps/authentication response.
 * Returns deduplicated apps that have valid authentication.
 *
 * Enablement is determined by whether the app appears in the
 * 'Ingest Tickets' workflow's actions (workflows are the source of truth).
 *
 * @param authApiResponse - Raw response from /api/v1/apps/authentication
 * @param workflowAppNames - Set of normalized app names from the Ingest Tickets workflow actions
 */
export function extractValidatedIngestionApps(
  authApiResponse: any[],
  workflowAppNames?: Set<string>,
): ValidatedIngestionApp[] {
  const dedupedApps = deduplicateAuthApps(
    authApiResponse.filter(auth => auth.active || isValidationFresh(auth.validation))
  );

  const enabledNames = workflowAppNames || new Set<string>();

  const apps: ValidatedIngestionApp[] = [];

  for (const { app, bestImage, hasValidAuth } of dedupedApps) {
    const category = getIngestionCategory(app.name, app.categories) || 'other';
    const enabled = enabledNames.has(normalizeAppName(app.name));

    apps.push({
      id: app.id,
      name: app.name,
      image: bestImage || app.large_image,
      validated: hasValidAuth,
      enabled,
      category,
    });
  }

  // Sort: Enabled+Validated > Enabled+Unvalidated > Disabled+Validated > Disabled+Unvalidated, then alphabetically
  apps.sort((a, b) => {
    const aScore = (a.enabled ? 2 : 0) + (a.validated ? 1 : 0);
    const bScore = (b.enabled ? 2 : 0) + (b.validated ? 1 : 0);
    if (aScore !== bScore) return bScore - aScore;
    return a.name.localeCompare(b.name);
  });

  return apps;
}
