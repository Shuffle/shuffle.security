/**
 * Hidden usecase context for the "Ask about <usecase>" assistant on
 * /usecases/:flowId. The usecase detail view registers what it shows here;
 * the agent context registry appends it to the prompt, the same way
 * documentation is injected on /docs/*.
 */

export interface ActiveUsecasePromptContext {
  id: string;
  label: string;
  description?: string;
  agenticDescription?: string;
  source?: string;
  target?: string;
  phase?: string;
  tags?: string[];
  automationLabel?: string;
  automationCategory?: string;
  automationArea?: string;
  manualVerification?: boolean;
  customAction?: { label: string; href?: string; url?: string; description?: string; modal?: string };
  healthStatus?: string;
  enabled?: boolean;
  /** Apps available per category used by this usecase (source/target). */
  categoryApps?: Record<string, string[]>;
  /** Apps with validated authentication per category used by this usecase. */
  connectedApps?: Record<string, string[]>;
  linkedWorkflows?: string[];
}

export interface ActiveUsecasesOverviewContext {
  enabledUsecases?: Array<{ id: string; label: string; phase: string; source: string; target: string; automationLabel?: string }>;
  disabledUsecases?: Array<{ id: string; label: string; phase: string; source: string; target: string; automationLabel?: string }>;
  validatedCategories?: string[];
  validatedApps?: string[];
  activeWorkflows?: string[];
  activeFilters?: { phase?: string; category?: string; area?: string; tag?: string; search?: string };
}

const GLOBAL_KEY = '__shuffleActiveUsecaseContext';
const GLOBAL_OVERVIEW_KEY = '__shuffleActiveUsecasesOverviewContext';
export const USECASE_CONTEXT_EVENT = 'shuffle-usecase-context-changed';

const scope = (): any => (typeof globalThis !== 'undefined' ? globalThis : null);

/** Sets (or clears) the context. Returns the stored object so an owner can
 *  later clear only its own entry via clearActiveUsecasePromptContext. */
export const setActiveUsecasePromptContext = (ctx: ActiveUsecasePromptContext | null): ActiveUsecasePromptContext | null => {
  const s = scope();
  if (!s) return null;
  const stored = ctx ? { ...ctx } : null;
  if (stored) s[GLOBAL_KEY] = stored;
  else delete s[GLOBAL_KEY];
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(USECASE_CONTEXT_EVENT));
  } catch { /* ignore */ }
  return stored;
};

/** Clears the context only when it is still the given owner's entry. */
export const clearActiveUsecasePromptContext = (owned: ActiveUsecasePromptContext | null) => {
  if (owned && scope()?.[GLOBAL_KEY] === owned) setActiveUsecasePromptContext(null);
};

export const getActiveUsecasePromptContext = (): ActiveUsecasePromptContext | null => {
  const v = scope()?.[GLOBAL_KEY];
  return v && typeof v === 'object' ? (v as ActiveUsecasePromptContext) : null;
};

export const setActiveUsecasesOverviewContext = (ctx: ActiveUsecasesOverviewContext | null): ActiveUsecasesOverviewContext | null => {
  const s = scope();
  if (!s) return null;
  const stored = ctx ? { ...ctx } : null;
  if (stored) s[GLOBAL_OVERVIEW_KEY] = stored;
  else delete s[GLOBAL_OVERVIEW_KEY];
  return stored;
};

export const clearActiveUsecasesOverviewContext = (owned: ActiveUsecasesOverviewContext | null) => {
  if (owned && scope()?.[GLOBAL_OVERVIEW_KEY] === owned) setActiveUsecasesOverviewContext(null);
};

export const getActiveUsecasesOverviewContext = (): ActiveUsecasesOverviewContext | null => {
  const v = scope()?.[GLOBAL_OVERVIEW_KEY];
  return v && typeof v === 'object' ? (v as ActiveUsecasesOverviewContext) : null;
};

export const humanizeUsecaseId = (id: string): string =>
  id.replace(/_\d+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** Display name for the usecase at the given flow id. */
export const getUsecaseDisplayName = (flowId?: string): string => {
  const ctx = getActiveUsecasePromptContext();
  // The URL slug (e.g. siem_alerts) can differ from the flow id, and the
  // context is cleared when the detail view unmounts, so trust it as-is.
  if (ctx?.label) return ctx.label;
  return flowId ? humanizeUsecaseId(flowId) : 'Usecases';
};

export const USECASE_PROMPT_START = '=== USECASE CONTEXT ===';
export const USECASE_PROMPT_END = '=== END USECASE CONTEXT ===';

/**
 * Check if a prompt string contains injected usecase context.
 */
export const isUsecaseInjectedPrompt = (prompt?: string | null): boolean => {
  if (!prompt || typeof prompt !== 'string') return false;
  return prompt.includes(USECASE_PROMPT_START);
};

/**
 * Strip the hidden `=== USECASE CONTEXT === ... === END USECASE CONTEXT ===`
 * block from a prompt so it never leaks into user-visible chat bubbles, titles,
 * or run cards.
 */
export const extractCleanUsecasePrompt = (prompt?: string | null): string => {
  if (!prompt || typeof prompt !== 'string') return '';
  if (!isUsecaseInjectedPrompt(prompt)) return prompt;
  return prompt
    .replace(/\n*=== USECASE CONTEXT ===[\s\S]*?(?:=== END USECASE CONTEXT ===|$)/g, '')
    .trim();
};

/** Shuffle API endpoints the usecase flow relies on. */
export const USECASE_REQUIRED_APIS = [
  'GET /api/v1/workflows/usecases (list all usecase definitions, steps, source/target categories, and workflow templates)',
  'POST /api/v2/workflows/generate (enable a workflow-based usecase: generates or updates the workflow with { label, category, area, source, destination })',
  'POST /api/v2/datastore/automate (enable/configure datastore-triggered automations for shuffle-security_incidents, shuffle-security_vulnerabilities, or shuffle-security_assets)',
  'GET /api/v1/workflows (inspect linked workflows, active triggers, and execution state)',
  'GET /api/v1/apps/authentication (check connected tools, credentials, and authentication validation state)',
  'GET /api/v1/apps (list available apps and actions per category)',
  'POST /api/v1/hooks/webhook_<id> (Ingestion Webhook endpoint for pushing alerts, logs, or events into Shuffle Security)',
];

export interface UsecaseCatalogEntry {
  id: string;
  slug: string;
  label: string;
  phase: string;
  source: string;
  target: string;
  automationLabel: string;
  automationCategory?: string;
  automationArea?: string;
  customRoute?: string;
  summary: string;
}

/**
 * Built-in catalog of all 25 Shuffle Security automation usecases across all three
 * operational phases, used both on the Usecases overview page and as a fallback
 * lookup when a specific usecase is referenced by ID or slug.
 */
export const DEFAULT_USECASE_CATALOG: UsecaseCatalogEntry[] = [
  // Step 1: Ingest & Tool Setup
  {
    id: 'email_1',
    slug: 'email_reports',
    label: 'Email reports',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'email',
    target: 'case_management',
    automationLabel: 'Email monitoring',
    automationCategory: 'email',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Monitors phishing/abuse mailboxes (e.g., O365, Gmail, IMAP), extracts headers, URLs, and attachments, and creates normalized incidents in Shuffle Security or your case management tool.',
  },
  {
    id: 'siem_1',
    slug: 'siem_alerts',
    label: 'SIEM alerts',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'siem',
    target: 'case_management',
    automationLabel: 'Case management Alerts',
    automationCategory: 'siem',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Polls or receives webhook alerts from SIEM platforms (Splunk, Elastic, Sentinel, QRadar, Chronicle), deduplicates events, and normalizes them into Shuffle Security incidents.',
  },
  {
    id: 'edr_1',
    slug: 'edr_alerts',
    label: 'EDR alerts',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'edr',
    target: 'case_management',
    automationLabel: 'EDR Alerts',
    automationCategory: 'edr',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Ingests endpoint detections from EDR/XDR tools (CrowdStrike Falcon, SentinelOne, Microsoft Defender for Endpoint, Wazuh) and maps host, process, and hash observables into incidents.',
  },
  {
    id: 'intel_1',
    slug: 'ioc_feeds',
    label: 'IOC feeds',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'threat_intel',
    target: 'siem',
    automationLabel: 'Realtime IOC extraction',
    automationCategory: 'intel',
    automationArea: 'Threat Intelligence (TIP)',
    customRoute: '/threat-intel/feeds',
    summary: 'Pulls indicators of compromise (IPs, domains, hashes) from Threat Intel feeds (MISP, OpenCTI, VirusTotal, AbuseIPDB) and syncs them into SIEM watchlists and Shuffle datastore (`shuffle-security_threat_intel`).',
  },
  {
    id: 'edr_to_siem_1',
    slug: 'add_host_monitors',
    label: 'Add Host-Monitors',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'edr',
    target: 'siem',
    automationLabel: 'EDR to SIEM',
    automationCategory: 'edr',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    customRoute: '/monitors?add_host=true',
    summary: 'Deploys and connects Shuffle Host-Monitors / endpoint sensors to stream live host telemetry, fleet health, and remote response capabilities into Shuffle Security.',
  },
  {
    id: 'vuln_ingest_1',
    slug: 'vulnerability_ingestion',
    label: 'Vulnerability Ingestion',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'asset_management',
    target: 'case_management',
    automationLabel: 'Vulnerability Ingestion',
    automationCategory: 'asset_management',
    automationArea: 'Vulnerability Management',
    customRoute: '/vulnerabilities',
    summary: 'Imports CVE findings and scan results from vulnerability scanners (Tenable, Qualys, Rapid7, Trivy, Nuclei) into the shuffle-security_vulnerabilities datastore for prioritization.',
  },
  {
    id: 'net_to_siem_1',
    slug: 'network_logs',
    label: 'Network logs',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'network',
    target: 'siem',
    automationLabel: 'Network to SIEM',
    automationCategory: 'network',
    automationArea: 'Network Security (NDR)',
    summary: 'Streams firewall, NDR, IDS/IPS, and proxy telemetry (Palo Alto, Fortinet, Suricata, Zeek, Cloudflare) into your SIEM for centralized detection.',
  },
  {
    id: 'cloud_to_siem_1',
    slug: 'cloud_audit_logs',
    label: 'Cloud audit logs',
    phase: 'Step 1: Ingest & Tool Setup',
    source: 'cloud',
    target: 'siem',
    automationLabel: 'Cloud to SIEM',
    automationCategory: 'cloud',
    automationArea: 'Cloud Security (CSPM)',
    summary: 'Ingests AWS CloudTrail/GuardDuty, Azure Activity Logs, and GCP Audit Logs into your SIEM for cloud posture and runtime detection.',
  },
  // Step 2: Context & Correlation
  {
    id: 'incident_routing_1',
    slug: 'incident_routing_rules',
    label: 'Incident Routing Rules',
    phase: 'Step 2: Context & Correlation',
    source: 'case_management',
    target: 'case_management',
    automationLabel: 'Incident Routing Rules',
    automationCategory: 'cases',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    customRoute: '/incidents?settings=routing_rules',
    summary: 'Evaluates incoming incidents against ordered routing rules (field conditions including nested JSON and base64-encoded payloads) to auto-assign severity, change status, suppress noise, trigger workflows, or move incidents across tenants/regions.',
  },
  {
    id: 'enrichment_1',
    slug: 'enrichment',
    label: 'Enrichment',
    phase: 'Step 2: Context & Correlation',
    source: 'case_management',
    target: 'threat_intel',
    automationLabel: 'Enrichment',
    automationCategory: 'other',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    customRoute: '/threat-intel',
    summary: 'Automatically extracts observables (IPs, domains, URLs, file hashes) from new incidents, queries connected Threat Intelligence apps and local IOC datastore, and attaches reputation verdicts back to the incident.',
  },
  {
    id: 'asset_context_1',
    slug: 'asset_context',
    label: 'Asset context',
    phase: 'Step 2: Context & Correlation',
    source: 'case_management',
    target: 'asset_management',
    automationLabel: 'Asset context',
    automationCategory: 'asset_management',
    automationArea: 'Identity and Access Management (IAM)',
    customRoute: '/assets',
    summary: 'Correlates hostnames, IPs, and user identities in incidents against asset inventory and IAM directories (Active Directory, Okta, Entra ID, CMDB) to attach asset criticality and owner context.',
  },
  {
    id: 'vuln_correlation_1',
    slug: 'vulnerability_correlation',
    label: 'Vulnerability Correlation',
    phase: 'Step 2: Context & Correlation',
    source: 'case_management',
    target: 'asset_management',
    automationLabel: 'Vulnerability Correlation',
    automationCategory: 'asset_management',
    automationArea: 'Vulnerability Management',
    customRoute: '/vulnerabilities',
    summary: 'Cross-references discovered vulnerabilities with affected assets, active exploit intelligence (KEV/EPSS), and active incidents on the same host to escalate exploitable risks.',
  },
  {
    id: 'edr_enrich_1',
    slug: 'edr_telemetry',
    label: 'EDR telemetry',
    phase: 'Step 2: Context & Correlation',
    source: 'case_management',
    target: 'edr',
    automationLabel: 'EDR telemetry',
    automationCategory: 'edr',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Queries connected EDR platforms during incident investigation to retrieve process trees, active network connections, logged-in users, and recent file modifications for affected hosts.',
  },
  {
    id: 'iam_logs_1',
    slug: 'auth_logs',
    label: 'Auth logs',
    phase: 'Step 2: Context & Correlation',
    source: 'iam',
    target: 'siem',
    automationLabel: 'IAM Auth logs',
    automationCategory: 'iam',
    automationArea: 'Identity and Access Management (IAM)',
    summary: 'Forwards SSO, MFA, login anomaly, and privilege escalation events from IAM providers (Okta, Entra ID, Google Workspace, Duo) into your SIEM and correlates user identity risk.',
  },
  {
    id: 'email_to_intel_1',
    slug: 'phishing_iocs',
    label: 'Phishing IOCs',
    phase: 'Step 2: Context & Correlation',
    source: 'email',
    target: 'threat_intel',
    automationLabel: 'Phishing IOCs',
    automationCategory: 'email',
    automationArea: 'Threat Intelligence (TIP)',
    summary: 'Extracts sender domains, URLs, and attachment hashes from reported phishing emails and checks/registers them in Threat Intelligence platforms.',
  },
  {
    id: 'cloud_to_iam_1',
    slug: 'cloud_identity_events',
    label: 'Cloud identity events',
    phase: 'Step 2: Context & Correlation',
    source: 'cloud',
    target: 'iam',
    automationLabel: 'Cloud identity events',
    automationCategory: 'cloud',
    automationArea: 'Cloud Security (CSPM)',
    summary: 'Correlates cloud IAM role assumptions, access key usage, and anomalous API calls across AWS/Azure/GCP with corporate identity directories.',
  },
  {
    id: 'cloud_to_assets_1',
    slug: 'resource_inventory',
    label: 'Resource inventory',
    phase: 'Step 2: Context & Correlation',
    source: 'cloud',
    target: 'asset_management',
    automationLabel: 'Cloud Resource Inventory',
    automationCategory: 'cloud',
    automationArea: 'Cloud Security (CSPM)',
    summary: 'Continuously discovers cloud compute instances, storage buckets, Kubernetes workloads, and public IPs and syncs them into the Shuffle asset inventory (`shuffle-security_assets`).',
  },
  // Step 3: Agents & Response Actions
  {
    id: 'ai_triage_1',
    slug: 'ai_incident_handling',
    label: 'AI Incident Handling',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'siem',
    automationLabel: 'Run AI Agent',
    automationCategory: 'shuffle-security_incidents',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    customRoute: '/incidents?modal=ai_agent_prompts',
    summary: 'Runs an autonomous Shuffle AI Agent on new or escalated incidents (`shuffle-security_incidents` category automation) to investigate logs, correlate related alerts, summarize root cause, and recommend or execute remediation steps.',
  },
  {
    id: 'notify_workflow_1',
    slug: 'notifications',
    label: 'Notifications',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'communication',
    automationLabel: 'Notification workflow',
    automationCategory: 'communication',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    customRoute: '/admin?tab=org_config',
    summary: 'Sends structured incident alerts and interactive approval prompts to Slack, Microsoft Teams, Email, PagerDuty, or Discord when new or high/critical incidents occur (configured via Organization Notification Workflow).',
  },
  {
    id: 'notify_schedule_1',
    slug: 'schedules_phone_notifications',
    label: 'Schedules & Phone Notifications',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'communication',
    automationLabel: 'Schedules & Phone Notifications',
    automationCategory: 'communication',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    customRoute: '/Detection?tab=schedules',
    summary: 'Manages on-call rotation schedules and escalates unacknowledged critical incidents via phone call, SMS, or push notifications through the Shuffle Mobile App.',
  },
  {
    id: 'ticket_forward_1',
    slug: 'forward_tickets',
    label: 'Forward Tickets',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'case_management',
    automationLabel: 'Forward Tickets',
    automationCategory: 'cases',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Bi-directionally synchronizes or forwards incidents, comments, statuses, and severities between Shuffle Security and external ticketing systems (Jira, ServiceNow, TheHive, Linear, PagerDuty).',
  },
  {
    id: 'edr_eradic_1',
    slug: 'containment',
    label: 'Containment',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'edr',
    automationLabel: 'EDR Containment',
    automationCategory: 'edr',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Executes rapid endpoint containment actions (host network isolation, process termination, hash blocking, quarantine) across EDR tools when confirmed threats are detected.',
  },
  {
    id: 'iam_contain_1',
    slug: 'disable_accounts',
    label: 'Disable accounts',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'iam',
    automationLabel: 'IAM Containment',
    automationCategory: 'iam',
    automationArea: 'Identity and Access Management (IAM)',
    summary: 'Revokes active user sessions, resets credentials, enforces MFA challenges, or suspends compromised accounts in Okta, Entra ID, Active Directory, or Google Workspace.',
  },
  {
    id: 'net_contain_1',
    slug: 'block_rules',
    label: 'Block rules',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'network',
    automationLabel: 'Network Containment',
    automationCategory: 'network',
    automationArea: 'Network Security (NDR)',
    summary: 'Pushes malicious IPs, domains, and URLs to firewall dynamic block lists, WAF rules, and DNS sinkholes (Palo Alto, Fortinet, Cloudflare, Cisco, Zscaler).',
  },
  {
    id: 'email_contain_1',
    slug: 'quarantine',
    label: 'Quarantine',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'email',
    automationLabel: 'Email Quarantine',
    automationCategory: 'email',
    automationArea: 'Soc Automation (SIEM, Ticketing, SOAR)',
    summary: 'Searches across all tenant mailboxes to soft/hard delete malicious phishing emails, block sender domains, and quarantine similar messages.',
  },
  {
    id: 'cloud_contain_1',
    slug: 'cloud_response',
    label: 'Cloud response',
    phase: 'Step 3: Agents & Response Actions',
    source: 'case_management',
    target: 'cloud',
    automationLabel: 'Cloud Containment',
    automationCategory: 'cloud',
    automationArea: 'Cloud Security (CSPM)',
    summary: 'Isolates compromised cloud instances via security groups, revokes exposed IAM access keys, snapshots disks for forensics, and remediates public bucket exposures.',
  },
  {
    id: 'intel_to_net_1',
    slug: 'block_iocs',
    label: 'Block IOCs',
    phase: 'Step 3: Agents & Response Actions',
    source: 'threat_intel',
    target: 'network',
    automationLabel: 'Block Threat Intel IOCs',
    automationCategory: 'intel',
    automationArea: 'Threat Intelligence (TIP)',
    summary: 'Automatically feeds high-confidence Threat Intelligence indicators directly into network firewalls and perimeter blocklists.',
  },
  {
    id: 'intel_to_edr_1',
    slug: 'push_detections',
    label: 'Push detections',
    phase: 'Step 3: Agents & Response Actions',
    source: 'threat_intel',
    target: 'edr',
    automationLabel: 'Push Threat Intel to EDR',
    automationCategory: 'intel',
    automationArea: 'Threat Intelligence (TIP)',
    summary: 'Pushes file hashes and C2 indicators from Threat Intelligence feeds into EDR custom IOC prevention and hunting lists.',
  },
];

export const USECASE_TOOL_CATEGORIES = [
  'case_management (Cases / SOAR): Shuffle Security Incidents, TheHive, Jira, ServiceNow, PagerDuty, Linear',
  'siem (SIEM & Log Analytics): Wazuh, Splunk, Elastic Security, Microsoft Sentinel, QRadar, Google Chronicle, Graylog',
  'edr (EDR / Endpoint): CrowdStrike Falcon, SentinelOne, Microsoft Defender for Endpoint, Wazuh, Carbon Black, Velociraptor, Shuffle Host-Monitors',
  'email (Email Security): Microsoft Office 365, Google Workspace / Gmail, IMAP/SMTP, Proofpoint, Mimecast',
  'threat_intel (Threat Intelligence): MISP, OpenCTI, VirusTotal, AbuseIPDB, Shodan, GreyNoise, AlienVault OTX, URLhaus',
  'asset_management (Assets & Vulnerabilities): Shuffle Assets & Vulnerabilities, Tenable, Qualys, Rapid7, NetBox, Snipe-IT, ServiceNow CMDB',
  'iam (Identity & Access Management): Okta, Microsoft Entra ID (Azure AD), Active Directory LDAP, Google Workspace Admin, Duo, Keycloak',
  'network (Network & Firewalls): Palo Alto PAN-OS, Fortinet FortiGate, Cloudflare, Suricata, Zeek, Zscaler, Cisco Meraki/ASA',
  'cloud (Cloud Security): AWS (GuardDuty, CloudTrail, EC2, IAM), Azure Security Center, Google Cloud SCC, Wiz, Prisma Cloud',
  'communication (Notifications & On-Call): Slack, Microsoft Teams, Email, PagerDuty, Opsgenie, Discord, Shuffle Mobile App',
];

export const USECASE_ARCHITECTURE_OVERVIEW = [
  'How Usecases Work in Shuffle Security:',
  '  1. Three-Phase Operational Pipeline:',
  '     - Step 1: Ingest & Tool Setup (`ingest`) — Connect external security sources (SIEM, EDR, Email, Threat Intel, Vulnerability Scanners, Host-Monitors, Network, Cloud) or the built-in Ingestion Webhook to normalize alerts and findings into Shuffle Security datastores (`shuffle-security_incidents`, `shuffle-security_vulnerabilities`, `shuffle-security_assets`, `shuffle-security_threat_intel`).',
  '     - Step 2: Context & Correlation (`correlation`) — Automatically evaluate Incident Routing Rules, enrich IOCs against Threat Intel, attach Asset/IAM context, and correlate Vulnerabilities with active incidents when records enter the datastore.',
  '     - Step 3: Agents & Response Actions (`response`) — Trigger autonomous AI Incident Handling agents (`Run AI Agent`), execute host/network/IAM/email/cloud containment, synchronize external tickets (`Forward Tickets`), send Slack/Teams/Email notifications, and escalate to on-call schedules (`Schedules & Phone Notifications`).',
  '  2. Enabling & Configuring a Usecase:',
  '     - Standard workflow usecases are generated/enabled via `POST /api/v2/workflows/generate` with `{ label, category, app_name }` after the user authenticates their chosen source/target apps (`GET /api/v1/apps/authentication`).',
  '     - Datastore-driven usecases (Incident Routing Rules, Enrichment, Asset context, Vulnerability Correlation, AI Incident Handling) bind to datastore categories (`shuffle-security_incidents`, `shuffle-security_vulnerabilities`, `shuffle-security_assets`, `shuffle-security_threat_intel`) via `POST /api/v2/datastore/automate` and run automatically whenever matching records are created or updated.',
  '     - Special built-in usecases also have dedicated management views: Incident Routing Rules (`/incidents?settings=routing_rules`), AI Incident Handling (`/incidents?modal=ai_agent_prompts`), Host-Monitors (`/monitors?add_host=true`), Threat Intel Feeds (`/threat-intel/feeds`), Schedules & Phone Notifications (`/Detection?tab=schedules`), and Vulnerability Management (`/vulnerabilities`).',
  '     - Any external source can push JSON events directly into Shuffle Security via the tenant Ingestion Webhook (`POST /api/v1/hooks/webhook_<id>`).',
  '  3. How You (the Agent) Should Help the User:',
  '     - Recommend which usecases to enable next based on the tenant\'s currently enabled usecases and connected/authenticated tools.',
  '     - Explain step-by-step how to configure or troubleshoot any usecase, including required app credentials, webhook setup, or datastore triggers.',
  '     - Inspect or generate workflows, check authentication status, and verify datastore automations using the Shuffle APIs below when requested.',
].join('\n');

const list = (rec?: Record<string, string[]>) =>
  Object.entries(rec || {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => `  - ${k}: ${v.slice(0, 25).join(', ')}${v.length > 25 ? ` (+${v.length - 25} more)` : ''}`)
    .join('\n');

const findCatalogUsecase = (flowId?: string): UsecaseCatalogEntry | undefined => {
  if (!flowId) return undefined;
  const norm = flowId.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return DEFAULT_USECASE_CATALOG.find(
    (u) =>
      u.id.toLowerCase() === norm ||
      u.slug.toLowerCase() === norm ||
      u.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === norm,
  );
};

export const composeUsecasePromptInput = (rawInput: string, flowId?: string): string => {
  const trimmed = (rawInput || '').trim();
  if (!trimmed || trimmed.includes(USECASE_PROMPT_START)) return trimmed;
  const ctx = getActiveUsecasePromptContext();
  const overviewCtx = getActiveUsecasesOverviewContext();
  const catalogMatch = findCatalogUsecase(ctx?.id || flowId);
  const lines: string[] = [USECASE_PROMPT_START];

  if (ctx) {
    lines.push(`Active View: Specific Usecase Drawer (/usecases/${flowId || ctx.id})`);
    lines.push(`Usecase: ${ctx.label} (id: ${ctx.id})`);
    if (ctx.source || ctx.target || catalogMatch) {
      lines.push(`Data flow: ${ctx.source || catalogMatch?.source || 'unknown'} -> ${ctx.target || catalogMatch?.target || 'unknown'}`);
    }
    if (ctx.phase || catalogMatch?.phase) lines.push(`Phase: ${ctx.phase || catalogMatch?.phase}`);
    if (ctx.automationArea || catalogMatch?.automationArea) {
      lines.push(`Automation area: ${ctx.automationArea || catalogMatch?.automationArea}`);
    }
    if (ctx.tags?.length) lines.push(`Tags: ${ctx.tags.join(', ')}`);
    if (typeof ctx.enabled === 'boolean') lines.push(`Status for this tenant: ${ctx.enabled ? 'Enabled' : 'Disabled'}`);
    if (ctx.healthStatus) lines.push(`Health / diagnostics: ${ctx.healthStatus}`);
    if (typeof ctx.manualVerification === 'boolean') {
      lines.push(`Verification mode: ${ctx.manualVerification ? 'Manual / UI-configured flow' : 'Automated workflow generation via POST /api/v2/workflows/generate'}`);
    }
    if (ctx.customAction || catalogMatch?.customRoute) {
      const route = ctx.customAction?.href || ctx.customAction?.url || catalogMatch?.customRoute;
      const actionLabel = ctx.customAction?.label || 'Open configuration view';
      lines.push(`Dedicated UI action: ${actionLabel}${route ? ` (${route})` : ''}${ctx.customAction?.description ? ` — ${ctx.customAction.description}` : ''}`);
    }
    if (ctx.automationLabel || catalogMatch?.automationLabel) {
      const autoCat = ctx.automationCategory || catalogMatch?.automationCategory;
      lines.push(`Automation label: ${ctx.automationLabel || catalogMatch?.automationLabel}${autoCat ? ` (category: ${autoCat})` : ''}`);
    }
    if (ctx.description || catalogMatch?.summary) {
      lines.push(`Description: ${ctx.description || catalogMatch?.summary}`);
    }
    if (ctx.agenticDescription) lines.push(`Agentic behavior: ${ctx.agenticDescription}`);
    const connected = list(ctx.connectedApps);
    if (connected) {
      lines.push(`Connected tools with validated authentication:\n${connected}`);
    } else {
      lines.push('Connected tools with validated authentication: None detected yet for this usecase category.');
    }
    const apps = list(ctx.categoryApps);
    if (apps) lines.push(`Supported apps per category:\n${apps}`);
    if (ctx.linkedWorkflows?.length) {
      lines.push(`Linked workflows: ${ctx.linkedWorkflows.join(', ')}`);
    } else {
      lines.push('Linked workflows: None linked yet.');
    }
    lines.push('');
    lines.push(USECASE_ARCHITECTURE_OVERVIEW);
  } else if (flowId) {
    lines.push(`Active View: Specific Usecase (/usecases/${flowId})`);
    if (catalogMatch) {
      lines.push(`Usecase: ${catalogMatch.label} (id: ${catalogMatch.id}, slug: ${catalogMatch.slug})`);
      lines.push(`Phase: ${catalogMatch.phase}`);
      lines.push(`Data flow: ${catalogMatch.source} -> ${catalogMatch.target}`);
      if (catalogMatch.automationArea) lines.push(`Automation area: ${catalogMatch.automationArea}`);
      if (catalogMatch.customRoute) lines.push(`Dedicated configuration route: ${catalogMatch.customRoute}`);
      lines.push(`Automation label: ${catalogMatch.automationLabel}${catalogMatch.automationCategory ? ` (category: ${catalogMatch.automationCategory})` : ''}`);
      lines.push(`Description: ${catalogMatch.summary}`);
    } else {
      lines.push(`Usecase id/slug: ${flowId} (${humanizeUsecaseId(flowId)})`);
    }
    lines.push('');
    lines.push(USECASE_ARCHITECTURE_OVERVIEW);
  } else {
    lines.push('Page: Usecases overview (/usecases — interactive 3-phase pipeline of all security automation usecases in Shuffle Security).');
    if (overviewCtx) {
      lines.push('');
      lines.push('Current Tenant Live State on /usecases:');
      if (overviewCtx.enabledUsecases?.length) {
        lines.push(`  - Enabled usecases (${overviewCtx.enabledUsecases.length}): ${overviewCtx.enabledUsecases.map((u) => `${u.label} (${u.id}: ${u.source} -> ${u.target})`).join(', ')}`);
      } else {
        lines.push('  - Enabled usecases: None enabled yet.');
      }
      if (overviewCtx.disabledUsecases?.length) {
        lines.push(`  - Disabled / available usecases (${overviewCtx.disabledUsecases.length}): ${overviewCtx.disabledUsecases.map((u) => `${u.label} (${u.id})`).join(', ')}`);
      }
      if (overviewCtx.validatedApps?.length) {
        lines.push(`  - Connected & authenticated apps: ${overviewCtx.validatedApps.slice(0, 30).join(', ')}`);
      } else {
        lines.push('  - Connected & authenticated apps: None authenticated yet.');
      }
      if (overviewCtx.validatedCategories?.length) {
        lines.push(`  - Authenticated tool categories: ${overviewCtx.validatedCategories.join(', ')}`);
      }
      if (overviewCtx.activeWorkflows?.length) {
        lines.push(`  - Active tenant workflows (${overviewCtx.activeWorkflows.length}): ${overviewCtx.activeWorkflows.slice(0, 20).join(', ')}${overviewCtx.activeWorkflows.length > 20 ? ` (+${overviewCtx.activeWorkflows.length - 20} more)` : ''}`);
      }
      if (overviewCtx.activeFilters) {
        const f = overviewCtx.activeFilters;
        const activeFilterParts = [
          f.phase && f.phase !== 'all' ? `phase=${f.phase}` : '',
          f.category && f.category !== 'all' ? `category=${f.category}` : '',
          f.area && f.area !== 'all' ? `area=${f.area}` : '',
          f.tag && f.tag !== 'all' ? `tag=${f.tag}` : '',
          f.search ? `search="${f.search}"` : '',
        ].filter(Boolean);
        if (activeFilterParts.length > 0) {
          lines.push(`  - User's active UI filters: ${activeFilterParts.join(', ')}`);
        }
      }
    }
    lines.push('');
    lines.push(USECASE_ARCHITECTURE_OVERVIEW);
    lines.push('');
    lines.push(`Supported Tool Categories:\n${USECASE_TOOL_CATEGORIES.map((c) => `  - ${c}`).join('\n')}`);
    lines.push('');
    lines.push('Complete Shuffle Security Usecases Catalog (All 3 Phases):');
    for (const item of DEFAULT_USECASE_CATALOG) {
      lines.push(
        `  - [${item.phase}] ${item.label} (id: ${item.id}, slug: /usecases/${item.slug}, flow: ${item.source} -> ${item.target}, automation: ${item.automationLabel}${item.automationCategory ? `, category: ${item.automationCategory}` : ''}${item.customRoute ? `, route: ${item.customRoute}` : ''}): ${item.summary}`,
      );
    }
  }

  lines.push('');
  lines.push(`Required Shuffle APIs:\n${USECASE_REQUIRED_APIS.map((a) => `  - ${a}`).join('\n')}`);
  lines.push(USECASE_PROMPT_END);
  return `${trimmed}\n\n${lines.join('\n')}`;
};
