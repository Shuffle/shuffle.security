/**
 * Unified Usecase Registry
 *
 * Single source of truth for security tool categories, data-flow usecases,
 * and their mapping to automation workflow labels & API identifiers.
 *
 * Consumed by:
 *  - InfrastructurePage (edge rendering, drawer details, phase filtering)
 *  - AutomationConfig   (automation toggles, workflow generation)
 *  - useUsecases hook   (API merge + accessor helpers)
 */

import React from 'react';
import {
  LayoutGrid,
  Server,
  Network,
  Shield,
  MessageSquare,
  Mail,
  Crosshair,
  HardDrive,
  KeyRound,
  Cloud,
} from 'lucide-react';

// ── Flow phases ────────────────────────────────────────────────────────────────

export type FlowPhase = 'ingest' | 'correlation' | 'response';

export const FLOW_PHASES: {
  id: FlowPhase;
  label: string;
  subtitle: string;
  step: number;
  color: string;
}[] = [
  {
    id: 'ingest',
    step: 1,
    label: 'Ingest & Tool Setup',
    subtitle: 'Connect your tools and get data flowing in. Start here.',
    color: '--infra-siem',
  },
  {
    id: 'correlation',
    step: 2,
    label: 'Context & Correlation',
    subtitle: 'Enrich alerts with intelligence, assets, and identity data.',
    color: '--infra-threat-intel',
  },
  {
    id: 'response',
    step: 3,
    label: 'Agents & Response Actions',
    subtitle: 'Automate containment, notifications, and remediation.',
    color: '--infra-edr',
  },
];

// ── Tool category definitions ──────────────────────────────────────────────────

export interface ToolCategory {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string; // HSL CSS var name
  examples: string[];
  subcategories: { label: string; description: string }[];
  dataIn: string[];
  dataOut: string[];
  useCases: string[];
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'case_management',
    label: 'Cases',
    description: 'Central hub for incident tracking, task assignment, and case lifecycle management.',
    icon: React.createElement(LayoutGrid, { size: 22 }),
    color: '--infra-case-mgmt',
    examples: ['Shuffle Cases', 'TheHive', 'ServiceNow', 'Jira', 'PagerDuty', 'Cortex XSOAR'],
    subcategories: [
      { label: 'Incident Management', description: 'Tracking, triage, and lifecycle of security incidents' },
      { label: 'Task Orchestration', description: 'Automated task assignment and SLA tracking' },
      { label: 'Playbook Execution', description: 'Standardized response workflows and runbooks' },
    ],
    dataIn: ['Alerts from SIEM', 'Enrichment from Threat Intel', 'User context from IAM'],
    dataOut: ['Tasks to Communication', 'Status to SIEM', 'Metrics to reporting'],
    useCases: [
      'Auto-create cases from SIEM alerts above threshold',
      'Assign cases to analysts based on schedule',
      'Track SLA compliance and escalation',
      'Aggregate related alerts into single incident',
    ],
  },
  {
    id: 'siem',
    label: 'SIEM',
    description: 'Security Information & Event Management — log aggregation, correlation, and alert generation.',
    icon: React.createElement(Server, { size: 22 }),
    color: '--infra-siem',
    examples: ['Splunk', 'Microsoft Sentinel', 'Elastic SIEM', 'QRadar', 'Wazuh', 'Chronicle'],
    subcategories: [
      { label: 'Log Management', description: 'Centralized log collection, parsing, and retention' },
      { label: 'Correlation Engine', description: 'Cross-source event correlation and alert generation' },
      { label: 'UEBA', description: 'User & Entity Behavior Analytics for anomaly detection' },
    ],
    dataIn: ['Logs from Network', 'Events from EDR', 'Auth logs from IAM'],
    dataOut: ['Alerts to Case Management', 'Logs to Threat Intel', 'Events to AI/LLM'],
    useCases: [
      'Correlate events across sources to detect multi-stage attacks',
      'Generate alerts based on Sigma/YARA detection rules',
      'Forward normalized logs for AI-based anomaly detection',
      'Provide search context for incident investigation',
    ],
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Network monitoring, traffic analysis, and firewall management.',
    icon: React.createElement(Network, { size: 22 }),
    color: '--infra-network',
    examples: ['Palo Alto', 'Fortinet', 'Suricata', 'Zeek', 'Cisco ASA', 'pfSense'],
    subcategories: [
      { label: 'Firewall', description: 'Perimeter and internal traffic filtering and policy enforcement' },
      { label: 'IDS/IPS', description: 'Intrusion detection and prevention systems' },
      { label: 'NDR', description: 'Network Detection & Response for traffic analysis' },
      { label: 'WAF', description: 'Web Application Firewall for application-layer protection' },
    ],
    dataIn: ['IOC watchlists from Threat Intel', 'Block rules from Case Management'],
    dataOut: ['Flow logs to SIEM', 'Alerts to Case Management', 'Packet data to EDR'],
    useCases: [
      'Auto-block malicious IPs from threat intel feeds',
      'Stream NetFlow data to SIEM for correlation',
      'Isolate network segments during active incident',
      'Detect lateral movement via traffic anomalies',
    ],
  },
  {
    id: 'edr',
    label: 'EDR',
    description: 'Endpoint Detection & Response — real-time endpoint monitoring and automated containment.',
    icon: React.createElement(Shield, { size: 22 }),
    color: '--infra-edr',
    examples: ['CrowdStrike', 'SentinelOne', 'Microsoft Defender', 'Carbon Black', 'Cortex XDR', 'Trellix'],
    subcategories: [
      { label: 'Antivirus / EPP', description: 'Endpoint protection platforms and malware prevention' },
      { label: 'XDR', description: 'Extended Detection & Response across endpoints, cloud, and network' },
      { label: 'MDM', description: 'Mobile Device Management for endpoint compliance' },
    ],
    dataIn: ['IOC hashes from Threat Intel', 'Containment orders from Case Management'],
    dataOut: ['Endpoint telemetry to SIEM', 'Alerts to Case Management', 'Process trees to AI/LLM'],
    useCases: [
      'Isolate compromised endpoints automatically',
      'Scan endpoints for known IOC file hashes',
      'Collect forensic artifacts during investigation',
      'Push detection rules from Sigma to endpoint agents',
      'Forward high-confidence EDR alerts directly to Case Management, skipping SIEM for faster response',
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    description: 'Team messaging and notification channels for real-time incident coordination.',
    icon: React.createElement(MessageSquare, { size: 22 }),
    color: '--infra-communication',
    examples: ['Slack', 'Microsoft Teams', 'PagerDuty', 'Opsgenie', 'Discord', 'Webex'],
    subcategories: [
      { label: 'ChatOps', description: 'Incident coordination via team messaging platforms' },
      { label: 'On-Call / Paging', description: 'Escalation and on-call rotation management' },
      { label: 'Notifications', description: 'Multi-channel alerting (SMS, email, push)' },
    ],
    dataIn: ['Alerts from Case Management', 'Status updates from SIEM'],
    dataOut: ['Acknowledgements to Case Management', 'Escalations to IAM'],
    useCases: [
      'Send real-time alerts to SOC channel on critical incidents',
      'Page on-call analyst via PagerDuty integration',
      'Create war-room channel for major incidents',
      'Post daily summary of open cases',
    ],
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Email security, phishing analysis, and automated mailbox triage.',
    icon: React.createElement(Mail, { size: 22 }),
    color: '--infra-email',
    examples: ['Microsoft 365', 'Google Workspace', 'Sublime Security', 'Abnormal Security', 'Proofpoint', 'Mimecast'],
    subcategories: [
      { label: 'Email Gateway', description: 'Inbound/outbound filtering, spam, and malware blocking' },
      { label: 'Phishing Protection', description: 'AI-driven phishing detection and user reporting' },
      { label: 'DLP', description: 'Data Loss Prevention for email-borne sensitive data' },
    ],
    dataIn: ['Threat signatures from Threat Intel', 'User reports from Communication'],
    dataOut: ['Phishing IOCs to Threat Intel', 'Suspicious emails to Case Management', 'Headers to AI/LLM'],
    useCases: [
      'Auto-analyze reported phishing emails',
      'Extract and enrich URLs/attachments from suspicious mail',
      'Quarantine emails matching known IOC patterns',
      'Send disposition feedback to reporters',
    ],
  },
  {
    id: 'threat_intel',
    label: 'Threat Intel',
    description: 'Threat intelligence platforms for IOC enrichment, feed management, and adversary tracking.',
    icon: React.createElement(Crosshair, { size: 22 }),
    color: '--infra-threat-intel',
    examples: ['MISP', 'VirusTotal', 'AlienVault OTX', 'Recorded Future', 'Mandiant', 'AbuseIPDB'],
    subcategories: [
      { label: 'IOC Enrichment', description: 'Automated lookups for IPs, domains, hashes, and URLs' },
      { label: 'Feed Management', description: 'Curation and distribution of threat intelligence feeds' },
      { label: 'Adversary Tracking', description: 'Campaign and threat actor attribution (MITRE ATT&CK)' },
    ],
    dataIn: ['IOCs from Email', 'Observables from Case Management', 'Hashes from EDR'],
    dataOut: ['Enrichment to Case Management', 'IOC feeds to Network/EDR', 'Context to AI/LLM'],
    useCases: [
      'Auto-enrich IPs, domains, and hashes in cases',
      'Maintain and distribute curated IOC watchlists',
      'Score threat severity using multiple intel sources',
      'Map indicators to MITRE ATT&CK techniques',
    ],
  },
  {
    id: 'asset_management',
    label: 'Assets',
    description: 'Endpoints, cloud resources, and CMDB inventory with vulnerability and configuration context for incident response.',
    icon: React.createElement(HardDrive, { size: 22 }),
    color: '--infra-asset-mgmt',
    examples: ['ServiceNow CMDB', 'Qualys', 'Tenable', 'Snipe-IT', 'Rapid7', 'Lansweeper'],
    subcategories: [
      { label: 'CMDB', description: 'Configuration Management Database for asset inventory' },
      { label: 'Vulnerability Management', description: 'Scanning, prioritization, and remediation tracking' },
      { label: 'Software Inventory', description: 'Tracking installed software and license compliance' },
    ],
    dataIn: ['Scan results from EDR', 'Vulnerability feeds from Threat Intel'],
    dataOut: ['Asset context to Case Management', 'Owner info to IAM', 'Risk scores to SIEM'],
    useCases: [
      'Auto-lookup asset owner and criticality during triage',
      'Correlate vulnerabilities with active threats',
      'Prioritize patching based on exploit availability',
      'Provide asset inventory for compliance reporting',
    ],
  },
  {
    id: 'iam',
    label: 'IAM',
    description: 'Identity & Access Management — user lifecycle, authentication, and privilege control.',
    icon: React.createElement(KeyRound, { size: 22 }),
    color: '--infra-iam',
    examples: ['Okta', 'Azure AD', 'CyberArk', 'JumpCloud', 'Duo', 'OneLogin'],
    subcategories: [
      { label: 'SSO / Federation', description: 'Single Sign-On and identity federation across services' },
      { label: 'PAM', description: 'Privileged Access Management for elevated credentials and sessions' },
      { label: 'MFA', description: 'Multi-Factor Authentication enforcement and management' },
      { label: 'GRC', description: 'Governance, Risk & Compliance — policy and audit management' },
    ],
    dataIn: ['Disable requests from Case Management', 'Risk signals from SIEM'],
    dataOut: ['Auth logs to SIEM', 'User context to Case Management', 'Session data to AI/LLM'],
    useCases: [
      'Auto-disable compromised user accounts',
      'Force MFA re-enrollment after credential breach',
      'Revoke sessions for users flagged by AI anomaly detection',
      'Provide identity context for incident triage',
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud',
    description: 'Cloud providers with bundled security services — logging, IAM, networking, and compute.',
    icon: React.createElement(Cloud, { size: 22 }),
    color: '--infra-cloud',
    examples: ['AWS', 'Microsoft Azure', 'Google Cloud', 'Oracle Cloud', 'DigitalOcean', 'Linode'],
    subcategories: [
      { label: 'CSPM', description: 'Cloud Security Posture Management — misconfig detection' },
      { label: 'CWPP', description: 'Cloud Workload Protection for containers and serverless' },
      { label: 'Cloud IAM', description: 'Cloud-native identity, roles, and permission policies' },
      { label: 'DevSecOps', description: 'CI/CD security scanning, IaC checks, and code analysis' },
    ],
    dataIn: ['Detection rules from SIEM', 'IOC feeds from Threat Intel', 'Policy updates from IAM'],
    dataOut: ['CloudTrail/audit logs to SIEM', 'Resource inventory to Assets', 'Identity events to IAM'],
    useCases: [
      'Stream cloud audit logs to SIEM for correlation',
      'Auto-remediate misconfigured resources (e.g. open S3 buckets)',
      'Sync cloud IAM roles and policies with central identity provider',
      'Inventory cloud assets for vulnerability management',
    ],
  },
];

// ── Usecase (data-flow edge) definition ────────────────────────────────────────

export interface Usecase {
  id: string;
  source: string;
  target: string;
  label: string;
  description: string;
  agenticDescription: string;
  phase: FlowPhase;
  tags: string[];
  animated?: boolean;
  /** When true, this usecase is only visible to support users */
  supportOnly?: boolean;
  /** Label sent to POST /api/v2/workflows/generate */
  automationLabel?: string;
  /** Category sent with the generate call */
  automationCategory?: string;
  /** Onboarding area this usecase belongs to */
  automationArea?: 'automatic_ingestion' | 'forward_updates' | 'threat_intel' | 'notifications' | 'response' | 'correlation' | 'assign_escalate' | 'schedules_notifications';
  /** Runtime status (filled by API / hook) */
  status?: 'enabled' | 'disabled' | 'misconfigured';
  /** True if this flow requires manual verification (e.g. log forwarding can't be auto-detected) */
  manualVerification?: boolean;
  /** Importance ranking 0–100; 100 = highest priority (most-used). */
  priority?: number;
  /** Optional video URL (YouTube, Vimeo, mp4) showcasing the usecase. */
  video?: string;
  /** Optional blogpost / article URL with deeper context. */
  blogpost?: string;
  /** Optional reference image URL (architecture diagram, screenshot). */
  referenceImage?: string;
  /** Optional custom action — a one-click CTA that overrides the default "create workflow" flow.
   *  Use for usecases best fulfilled by an in-app navigation (e.g. opening /monitors?add_host=true)
   *  rather than generating a Shuffle workflow. */
  customAction?: {
    /** Button label shown on the usecase detail page (e.g. "Add Monitor"). */
    label: string;
    /** In-app route. Use this OR `url`. Internal routes use react-router navigation. */
    href?: string;
    /** External URL. Opens in a new tab. */
    url?: string;
    /** Optional helper text rendered next to the CTA. */
    description?: string;
    /**
     * Optional modal key. When set, the host renders an inline dialog via
     * the `renderUsecaseActionModal` slot on `<Usecases />` instead of
     * navigating. Used by "Add Host-Monitors" to embed the Add Host dialog.
     */
    modal?: string;
  };
}

// ── API usecase types (from /api/v1/workflows/usecases) ────────────────────────

export interface ApiUsecaseItem {
  name: string;
  items?: Record<string, any>;
}

export interface ApiUsecase {
  name: string;
  priority?: number;
  type: string;       // source category label/id (e.g. "SIEM", "siem")
  last?: string;      // legacy target category (e.g. "cases")
  destination?: string; // exported JSON target label (e.g. "Case Management")
  source_id?: string;
  target_id?: string;
  disabled?: boolean;
  support_only?: boolean;
  tags?: string[];
  agentic_description?: string;
  automation_label?: string;
  automation_category?: string;
  automation_area?: string;
  manual_verification?: boolean;
  custom_action?: {
    label: string;
    href?: string;
    url?: string;
    description?: string;
  };
  description?: string;
  video?: string;
  blogpost?: string;
  reference_image?: string;
  items?: ApiUsecaseItem;
}

export interface ApiUsecaseCategory {
  name: string;       // e.g. "1. Collect", "2. Enrich"
  color?: string;
  phase?: FlowPhase;
  step?: number;
  list: ApiUsecase[];
}

/**
 * Map API category names to our FlowPhase.
 * The API uses numbered prefixes like "1. Collect".
 */
export function apiCategoryToPhase(categoryName: string): FlowPhase {
  const lower = categoryName.toLowerCase();
  if (lower.includes('collect') || lower.includes('ingest') || lower.includes('1.')) return 'ingest';
  if (lower.includes('correlat') || lower.includes('enrich') || lower.includes('context') || lower.includes('2.')) return 'correlation';
  if (lower.includes('respond') || lower.includes('response') || lower.includes('action') || lower.includes('3.')) return 'response';
  // Default: correlation/enrich
  return 'correlation';
}

/**
 * Normalize API type/last fields to our category IDs.
 * The API may use "cases" while we use "case_management", etc.
 */
export function normalizeCategory(apiCategory: string): string {
  if (!apiCategory) return '';
  const map: Record<string, string> = {
    cases: 'case_management',
    case: 'case_management',
    'case management': 'case_management',
    case_management: 'case_management',
    communication: 'communication',
    chat: 'communication',
    siem: 'siem',
    edr: 'edr',
    endpoint: 'edr',
    email: 'email',
    network: 'network',
    firewall: 'network',
    threat_intel: 'threat_intel',
    'threat intel': 'threat_intel',
    intel: 'threat_intel',
    iam: 'iam',
    identity: 'iam',
    cloud: 'cloud',
    asset_management: 'asset_management',
    'asset management': 'asset_management',
    assets: 'asset_management',
    cmdb: 'asset_management',
  };
  return map[apiCategory.toLowerCase()] || apiCategory.toLowerCase();
}

// ── Default usecases (migrated from InfrastructurePage DATA_FLOWS) ─────────────

export const DEFAULT_USECASES: Usecase[] = [
  {
    id: 'siem_case_management_1', phase: 'ingest', source: 'siem', target: 'case_management',
    label: 'SIEM alerts', animated: true,
    tags: ['Alert', 'Detection', 'Logs'],
    description: 'SIEM-generated alerts are the primary trigger for new cases. Automating this flow ensures no critical detection goes uninvestigated and reduces mean time to respond (MTTR).',
    agenticDescription: 'An agent triages incoming alerts, deduplicates them against open cases, scores severity using threat intel context, and auto-assigns to the right analyst based on type and on-call schedule.',
    automationLabel: 'Ingest Tickets',
    automationCategory: 'cases',
    automationArea: 'automatic_ingestion',
  },
  {
    id: 'edr_case_management_1', phase: 'ingest', source: 'edr', target: 'case_management',
    label: 'EDR alerts', animated: true,
    tags: ['Alert', 'Detection'],
    description: 'EDR-generated alerts (malware detections, suspicious process executions, ransomware behavior) are forwarded directly to Case Management to open or update incidents, bypassing the SIEM for faster response on high-confidence endpoint detections.',
    agenticDescription: 'An agent evaluates EDR alert confidence, correlates with related endpoint events, determines if it belongs to an existing case, and either updates the case or creates a new one with a pre-filled investigation timeline.',
    automationLabel: 'Ingest Tickets',
    automationCategory: 'cases',
    automationArea: 'automatic_ingestion',
  },
  {
    id: 'email_case_management_1', phase: 'ingest', source: 'email', target: 'case_management',
    label: 'Email reports', animated: true,
    tags: ['Alert', 'Logs'],
    description: 'User-reported phishing emails create cases for triage. Automating intake with deduplication and auto-enrichment drastically cuts analyst workload.',
    agenticDescription: 'An agent parses reported emails, extracts and enriches all IOCs, determines phishing verdict using threat intel, and auto-closes low-risk reports while escalating confirmed campaigns.',
    automationLabel: 'Ingest Tickets',
    automationCategory: 'cases',
    automationArea: 'automatic_ingestion',
  },
  {
    id: 'threat_intel_ingest_1', phase: 'ingest', source: 'threat_intel', target: 'case_management',
    label: 'IOC feeds', animated: true,
    tags: ['Ingest', 'Threat Intel', 'Feeds', 'IOCs'],
    description: 'Ingest indicator of compromise (IOC) feeds from open-source intelligence (OSINT), commercial threat feeds, and ISACs into Shuffle to detect malicious IPs, domains, hashes, and URLs.',
    agenticDescription: 'An agent continuously ingests and deduplicates threat feeds, normalizes indicators, tracks source confidence, and stages them for real-time incident matching.',
    automationLabel: 'Enable Threat feeds',
    automationCategory: 'cases',
    automationArea: 'threat_intel',
    customAction: {
      label: 'Threat Feeds',
      href: '/incidents/threat-feeds',
      description: 'IOC feeds and Threat feeds refer to the same thing — manage your configured threat feeds and IOC sources.',
    },
  },
  {
    id: 'network_siem_1', phase: 'ingest', source: 'network', target: 'siem',
    label: 'Flow logs',
    tags: ['Logs', 'Detection'],
    manualVerification: true,
    description: 'Network flow logs (NetFlow, DNS, proxy) give the SIEM east-west and north-south visibility. Without them, lateral movement and C2 traffic go undetected.',
    agenticDescription: 'An agent monitors ingested flow logs for anomalous patterns (beaconing, port scans, unusual data volumes), generates hypotheses, and creates enriched SIEM alerts with analyst-ready summaries.',
    automationArea: 'automatic_ingestion',
  },
  {
    id: 'edr_siem_1', phase: 'correlation', source: 'edr', target: 'siem',
    label: 'Telemetry',
    tags: ['Logs', 'Detection', 'Correlation'],
    manualVerification: true,
    description: 'Endpoint telemetry (process trees, file hashes, registry changes) enriches SIEM detections with host-level context, enabling accurate correlation rules.',
    agenticDescription: 'An agent cross-references endpoint telemetry with known attack patterns, surfaces hidden process chains, and annotates SIEM events with host risk scores before they reach an analyst.',
    automationArea: 'correlation',
  },
  {
    id: 'iam_siem_1', phase: 'correlation', source: 'iam', target: 'siem',
    label: 'Auth logs',
    tags: ['Logs', 'Detection', 'Correlation'],
    manualVerification: true,
    description: 'Authentication and authorization logs reveal credential abuse, impossible travel, privilege escalation, and brute-force attempts across the identity layer.',
    agenticDescription: 'An agent detects impossible travel, credential stuffing patterns, and privilege escalation attempts in auth logs, then creates SIEM alerts with user risk context and recommended actions.',
    automationArea: 'correlation',
  },
  {
    id: 'threat_intel_case_management_1', phase: 'correlation', source: 'threat_intel', target: 'case_management',
    label: 'Enrichment', animated: true,
    tags: ['Intel', 'Correlation', 'Context'],
    description: 'Threat intelligence enriches cases with reputation scores, malware families, threat actor attribution, and related IOCs — giving analysts immediate context.',
    agenticDescription: 'An agent autonomously enriches all observables in a case, maps findings to MITRE ATT&CK, identifies related campaigns, and updates case severity and recommended playbook based on findings.',
    automationLabel: 'Enable Threat feeds_webhook',
    automationCategory: 'cases',
    automationArea: 'threat_intel',
  },
  {
    id: 'threat_intel_network_1', phase: 'response', source: 'threat_intel', target: 'network',
    label: 'IOC feeds',
    tags: ['Intel', 'Response', 'Prevention'],
    description: 'Threat intel feeds pushed to network devices include IPs, domains, URLs, and ASNs for perimeter blocking, as well as MITRE ATT&CK techniques used to inform detection rule tuning on IDS/IPS and NDR sensors. Network controls act at layer 3–7, so indicator types must be network-observable.',
    agenticDescription: 'An agent curates and validates IOC feeds before pushing, deduplicates against existing block rules, removes expired indicators, and maps active techniques to IDS/IPS signatures — ensuring network policy stays accurate without manual review.',
    automationLabel: 'Enable Threat feeds',
    automationCategory: 'cases',
    automationArea: 'threat_intel',
  },
  {
    id: 'threat_intel_edr_1', phase: 'response', source: 'threat_intel', target: 'edr',
    label: 'IOC feeds',
    tags: ['Intel', 'Response', 'Prevention', 'Detection'],
    description: 'Endpoint-targeted IOC feeds include file hashes (MD5/SHA256), process names, registry keys, certificate thumbprints, and parent-child process trees for behavioral blocking. MITRE ATT&CK technique mappings inform custom detection rules. Unlike network devices, EDR can act on host-observable artifacts invisible to the perimeter.',
    agenticDescription: 'An agent validates hash and behavioral indicator accuracy against multiple intel sources, maps techniques to EDR rule coverage gaps, prioritizes by threat severity, and generates a blocking report with rollback instructions.',
    automationLabel: 'Enable Threat feeds',
    automationCategory: 'cases',
    automationArea: 'threat_intel',
  },
  {
    id: 'case_management_communication_1', phase: 'response', source: 'case_management', target: 'communication',
    label: 'Notifications', animated: true,
    tags: ['Response', 'Alert'],
    description: 'Automated notifications keep stakeholders informed of incident status, escalations, and required actions — critical for SLA compliance and coordination.',
    agenticDescription: 'An agent drafts context-aware incident summaries, determines the right audience and channel for each update, and adapts tone (technical vs. executive) based on the recipient.',
    automationLabel: 'Notifications',
    automationCategory: 'cases',
    automationArea: 'notifications',
  },
  {
    id: 'case_management_agent_response_1', phase: 'response', source: 'case_management', target: 'case_management',
    label: 'Agent Response',
    tags: ['Response', 'AI'],
    description: 'The AI agent triages incoming incidents, gathers context, and executes the next-best response action — assigning, enriching, escalating, or running tools automatically.',
    agenticDescription: 'An agent picks up every new incident, reasons over its observables and merge candidates, and either resolves it autonomously or hands it off with a fully prepared brief.',
    automationArea: 'response',
    customAction: {
      label: 'Configure AI Agent',
      href: '/incidents',
      description: 'Open Incidents to manage the Run AI Agent automation on the incidents category.',
    },
  },
  {
    id: 'case_management_iam_1', phase: 'response', source: 'case_management', target: 'iam',
    label: 'Disable accounts',
    tags: ['Response', 'Containment'],
    description: 'When a compromised account is identified, automated disablement through IAM stops the attacker from maintaining access while the investigation continues.',
    agenticDescription: 'An agent validates the compromise signal, checks the user\'s business criticality, executes targeted disablement or session revocation, and documents the action with rollback steps in the case.',
    automationArea: 'response',
  },
  {
    id: 'case_management_edr_1', phase: 'response', source: 'case_management', target: 'edr',
    label: 'Containment',
    tags: ['Response', 'Containment'],
    description: 'Network isolation or process killing on compromised endpoints contains the threat, preventing lateral movement while preserving forensic evidence.',
    agenticDescription: 'An agent determines the right containment scope (process, network, host), triggers isolation, collects forensic artifacts autonomously, and creates a detailed timeline for the investigation.',
    automationArea: 'response',
  },
  {
    id: 'asset_management_case_management_1', phase: 'correlation', source: 'asset_management', target: 'case_management',
    label: 'Asset context',
    tags: ['Context', 'Correlation'],
    description: 'Asset context (owner, criticality, business unit, OS) helps analysts prioritize cases and understand blast radius during an incident.',
    agenticDescription: 'An agent automatically fetches asset owner, business criticality, and known vulnerabilities for every observable in a case, recalculates impact score, and suggests prioritization.',
    automationArea: 'correlation',
    automationLabel: 'Asset context',
    automationCategory: 'cases',
  },
  {
    id: 'case_management_incident_routing_1', phase: 'correlation', source: 'case_management', target: 'case_management',
    label: 'Incident Routing Rules', animated: true,
    tags: ['Context', 'Correlation', 'Routing'],
    description: 'Route incoming incidents to the right sub-tenant based on tenant, source, severity, observables, or any field in the incident payload. Keeps multi-tenant environments tidy and ensures the right team owns each incident from the start.',
    agenticDescription: 'An agent evaluates each new incident against your rules, decides which sub-tenant should own it, and either suggests or executes the move with full audit trail.',
    automationArea: 'correlation',
    automationLabel: 'Incident Routing Rules',
    automationCategory: 'cases',
  },
  {
    id: 'asset_management_case_management_vuln_1', phase: 'correlation', source: 'asset_management', target: 'case_management',
    label: 'Vulnerability Correlation',
    tags: ['Context', 'Correlation', 'Vulnerability'],
    description: 'Correlate known vulnerabilities (CVEs, misconfigurations, missing patches) on affected assets with active incidents — surfacing exploitable weaknesses that elevate risk and guide containment priorities.',
    agenticDescription: 'An agent matches observables and affected hosts in a case against the vulnerability inventory, identifies exploitable CVEs aligned with the attack technique, recalculates incident severity, and recommends remediation or compensating controls.',
    automationArea: 'correlation',
    automationLabel: 'Vulnerability Correlation',
    automationCategory: 'cases',
  },
  {
    id: 'vulnerability_ingestion_1', phase: 'ingest', source: 'asset_management', target: 'case_management',
    label: 'Vulnerability Ingestion', animated: true,
    tags: ['Ingest', 'Vulnerability', 'Logs'],
    description: 'Ingest vulnerability findings (CVEs, misconfigurations, missing patches) from your scanners into a unified inventory so they can be correlated with assets and incidents.',
    agenticDescription: 'An agent normalizes scanner output across vendors, deduplicates findings per asset, enriches each CVE with exploitability and threat intel, and keeps the vulnerability inventory continuously up to date.',
    automationArea: 'automatic_ingestion',
    automationLabel: 'Ingest Vulnerabilities',
    automationCategory: 'vulnerabilities',
    customAction: {
      label: 'Configure Vulnerabilities',
      href: '/vulnerabilities',
      description: 'Open the vulnerability inventory to ingest CVEs from your scanners.',
    },
  },
  {
    id: 'asset_management_case_management_vuln_response_1', phase: 'response', source: 'asset_management', target: 'case_management',
    label: 'Vulnerability Response', animated: false, supportOnly: true,
    tags: ['Response', 'Vulnerability', 'Remediation'],
    description: 'Automatically open remediation tasks, patch tickets, or compensating-control workflows for vulnerabilities discovered during incident investigation — closing the loop between detection and fix.',
    agenticDescription: 'An agent triages each confirmed exploitable CVE on an affected host, opens a remediation ticket with owner and SLA, applies a compensating control where possible, and tracks the fix back to the originating incident.',
    automationArea: 'response',
    customAction: {
      label: 'Configure Vulnerabilities',
      href: '/vulnerabilities',
      description: 'Open the vulnerability inventory to wire up remediation workflows.',
    },
  },
  {
    id: 'email_threat_intel_1', phase: 'correlation', source: 'email', target: 'threat_intel',
    label: 'Phishing IOCs',
    tags: ['Intel', 'Correlation', 'Logs'],
    description: 'Extracting IOCs from phishing emails (sender domains, URLs, attachments) and feeding them into threat intel platforms helps detect broader campaigns.',
    agenticDescription: 'An agent detonates suspicious attachments and URLs in a sandbox, extracts all IOCs, correlates with known campaigns, and auto-publishes confirmed indicators to the threat intel platform.',
    automationArea: 'threat_intel',
  },
  {
    id: 'cloud_siem_1', phase: 'ingest', source: 'cloud', target: 'siem',
    label: 'Audit logs',
    tags: ['Logs', 'Detection'],
    manualVerification: true,
    description: 'Cloud audit logs (CloudTrail, Activity Log, Audit Logs) provide visibility into API calls, configuration changes, and access patterns across cloud environments.',
    agenticDescription: 'An agent detects anomalous API call patterns, privilege escalation, and misconfiguration events in cloud audit logs, then generates prioritized SIEM alerts with remediation context.',
    automationArea: 'automatic_ingestion',
  },
  {
    id: 'cloud_iam_1', phase: 'correlation', source: 'cloud', target: 'iam',
    label: 'Identity events',
    tags: ['Logs', 'Correlation', 'Detection'],
    manualVerification: true,
    description: 'Cloud identity events (role changes, permission grants, federation configs) feed IAM monitoring to detect privilege escalation in cloud environments.',
    agenticDescription: 'An agent tracks excessive permission grants, detects role assumption chains indicating privilege escalation, and triggers automated least-privilege review recommendations in IAM.',
    automationArea: 'correlation',
  },
  {
    id: 'case_management_cloud_1', phase: 'response', source: 'case_management', target: 'cloud',
    label: 'Cloud response',
    tags: ['Response', 'Containment'],
    description: 'Automated response actions in cloud environments — revoking keys, isolating instances, modifying security groups — contain threats before they spread across cloud infrastructure.',
    agenticDescription: 'An agent validates cloud response actions against blast radius, executes targeted remediation (revoke key, modify SG, snapshot + terminate instance), and logs all changes with rollback instructions.',
    automationArea: 'response',
  },
  {
    id: 'case_management_network_1', phase: 'response', source: 'case_management', target: 'network',
    label: 'Block rules',
    tags: ['Response', 'Prevention', 'Containment'],
    description: 'Pushing firewall block rules from cases to network devices enables immediate perimeter-level containment of malicious IPs, domains, and traffic patterns.',
    agenticDescription: 'An agent validates block rule candidates against allowlists and business-critical services, pushes rules to the right network segments, and auto-expires them with case closure.',
    automationArea: 'response',
  },
  {
    id: 'case_management_email_1', phase: 'response', source: 'case_management', target: 'email',
    label: 'Quarantine',
    tags: ['Response', 'Containment'],
    description: 'Quarantining or purging malicious emails from mailboxes during an active investigation prevents additional users from falling victim to the same campaign.',
    agenticDescription: 'An agent searches all mailboxes for campaign variants, bulk-quarantines matching emails, notifies impacted users with safe-messaging guidance, and reports scope to the case.',
    automationArea: 'response',
  },
  {
    id: 'case_management_cases_forward_1', phase: 'response', source: 'case_management', target: 'case_management',
    label: 'Forward Tickets', animated: true,
    tags: ['Response', 'Sync'],
    description: 'Forward incident updates, status changes, and resolution notes to external ticketing systems, keeping all platforms in sync and ensuring stakeholders on other tools stay informed.',
    agenticDescription: 'An agent detects significant case updates (status changes, new findings, escalations) and pushes structured updates to connected ticketing systems, mapping fields and priorities to each platform\'s schema.',
    automationLabel: 'Forward Tickets',
    automationCategory: 'cases',
    automationArea: 'forward_updates',
  },
  {
    id: 'case_management_assign_escalate_1', phase: 'response', source: 'case_management', target: 'case_management',
    label: 'Assign & Escalate', animated: true,
    tags: ['Response', 'Assignment', 'Escalation'],
    description: 'Automatically assign incoming incidents to the right analyst based on on-call schedules, workload, and expertise. Escalate unacknowledged or aging incidents to the next tier to ensure SLA compliance.',
    agenticDescription: 'An agent evaluates incoming incidents against team schedules, analyst skill sets, and current workload, assigns ownership, and monitors for SLA breaches to trigger automatic escalation to the next responder or management.',
    automationLabel: 'Assign & Escalate',
    automationCategory: 'cases',
    automationArea: 'assign_escalate',
  },
  {
    id: 'case_management_schedules_notifications_1', phase: 'response', source: 'case_management', target: 'communication',
    label: 'Schedules & Phone Notifications', animated: true,
    tags: ['Response', 'On-Call', 'Mobile', 'Escalation', 'Paging'],
    description: 'Trigger phone notifications and emergency paging via the Shuffle Mobile App based on on-call team schedules, with automatic escalations across response tiers.',
    agenticDescription: 'An agent monitors incoming critical incidents, determines the active on-call responder for the current shift, dispatches mobile app phone notifications and siren paging, and automatically escalates to higher tiers if unacknowledged.',
    automationLabel: 'Schedules & Phone Notifications',
    automationCategory: 'cases',
    automationArea: 'schedules_notifications',
  },
  {
    id: 'case_management_ai_agents_1', phase: 'response', source: 'case_management', target: 'case_management',
    label: 'AI Agents', animated: true,
    tags: ['Response', 'AI', 'Agent', 'Any Tool'],
    priority: 95,
    description: 'Enable AI Agents to investigate, triage, and act on incidents on your behalf. Unlike a usecase that is tied to a single category (like SIEM or EDR), AI Agents can talk to ANY tool you have connected — SIEM, EDR, IAM, Cloud, Email, Threat Intel, Cases, custom apps — anything reachable through Shuffle. Toggle agents on or off here, decide which tools each agent is allowed to use, and review what they did.',
    agenticDescription: 'An AI Agent reads the incident, decides which connected tools to query (Splunk, CrowdStrike, Okta, VirusTotal, Slack, …), enriches observables, proposes or executes containment actions, and writes its reasoning back to the case. You stay in control via per-tool permissions and an approval queue for high-impact actions.',
    automationArea: 'response',
    customAction: {
      label: 'Configure AI Agents',
      href: '/agents',
      description: 'Open the Agents page to enable, disable, and assign tools to each AI Agent.',
    },
  },
  {
    id: 'case_management_agent_ai_incident_handling_1', phase: 'response', source: 'case_management', target: 'case_management',
    label: 'AI Incident Handling', animated: true,
    tags: ['Response', 'AI', 'Agent', 'Triage'],
    description: 'Hand off new incidents to an AI Agent that triages, enriches, and resolves them end-to-end — assigning owners, gathering observables, executing safe response actions, and escalating only the cases that need a human.',
    agenticDescription: 'An AI Agent picks up every new incident, builds full context from connected tools, decides the next-best action (assign, enrich, contain, close), executes the safe ones automatically, and queues high-impact actions for analyst approval.',
    automationArea: 'response',
    automationLabel: 'AI Incident Handling',
    automationCategory: 'cases',
    customAction: {
      label: 'Configure AI Agents',
      href: '/agents',
      description: 'Open the Agents page to enable AI incident handling and choose which tools the agent may use.',
    },
  },
  {
    id: 'case_management_asset_management_monitors_1', phase: 'response', source: 'case_management', target: 'asset_management',
    label: 'Host Monitoring', animated: true,
    tags: ['Response', 'Monitoring', 'Endpoint'],
    description: 'Deploy host monitors to endpoints for real-time telemetry collection, compliance checks, and on-demand response action execution. Monitors enable direct interaction with hosts during investigations and continuous visibility into endpoint state.',
    agenticDescription: 'An agent identifies hosts missing monitor coverage, generates the appropriate deployment command for each platform, tracks rollout status, and verifies telemetry is flowing back into the platform after install.',
    automationLabel: 'Host Monitoring',
    automationCategory: 'cases',
    automationArea: 'response',
    customAction: {
      label: 'Deploy Host Monitor',
      href: '/monitors?add_host=true',
      modal: 'add-host',
      description: 'Open the monitor deployment dialog to register a new host.',
    },
  },
  {
    id: 'cloud_asset_management_1', phase: 'correlation', source: 'cloud', target: 'asset_management',
    label: 'Resource inventory', animated: true,
    tags: ['Logs', 'Context'],
    manualVerification: true,
    description: 'Auto-syncing cloud resources into the asset inventory ensures the CMDB stays current, preventing blind spots in vulnerability management and incident response.',
    agenticDescription: 'An agent continuously reconciles cloud inventory with the CMDB, flags newly exposed resources, identifies shadow IT, and marks assets with missing security controls for immediate action.',
    automationArea: 'correlation',
  },
  {
    id: 'asset_management_siem_1', phase: 'ingest', source: 'asset_management', target: 'siem',
    label: 'Endpoint logs',
    tags: ['Logs', 'Detection', 'Alert'],
    manualVerification: true,
    description: 'Forwarding endpoint telemetry and asset logs (process events, file changes, network connections, vulnerability scan results) to the SIEM enriches correlation and enables asset-aware detections.',
    agenticDescription: 'An agent normalises endpoint telemetry from diverse agents, tags each event with asset criticality and owner from the CMDB, and forwards structured logs to the SIEM with context that tunes alert priority.',
    automationArea: 'automatic_ingestion',
  },
];

// ── Category-to-app keyword mapping ────────────────────────────────────────────

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  case_management: ['cases', 'case management', 'ticketing', 'itsm', 'service desk', 'thehive', 'servicenow', 'jira'],
  siem: ['siem', 'splunk', 'sentinel', 'elastic', 'qradar', 'log management', 'wazuh', 'chronicle'],
  network: ['network', 'firewall', 'palo alto', 'fortinet', 'suricata', 'zeek', 'ids', 'ips', 'ndr'],
  edr: ['edr', 'endpoint', 'crowdstrike', 'sentinelone', 'defender', 'carbon black', 'xdr'],
  communication: ['communication', 'chat', 'messaging', 'slack', 'teams', 'pagerduty', 'opsgenie', 'notification'],
  email: ['email', 'mail', 'phishing', 'microsoft 365', 'google workspace', 'exchange', 'gmail', 'smtp', 'outlook', 'office365', 'imap', 'proofpoint', 'mimecast', 'microsoft_graph', 'microsoft graph'],
  threat_intel: ['threat intel', 'intelligence', 'misp', 'virustotal', 'otx', 'recorded future', 'ioc', 'abuse'],
  asset_management: ['asset', 'cmdb', 'inventory', 'qualys', 'tenable', 'vulnerability', 'snipe'],
  iam: ['iam', 'identity', 'access', 'okta', 'azure ad', 'cyberark', 'jumpcloud', 'ldap', 'active directory'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'google cloud', 'oracle cloud', 'digitalocean', 'cloud provider'],
};

export function matchAppToCategory(appName: string, appCategories: string[]): string | null {
  const searchText = [appName, ...appCategories].join(' ').toLowerCase();
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => searchText.includes(kw))) return catId;
  }
  return null;
}

// ── Automation-area helpers ────────────────────────────────────────────────────

/**
 * Get all workflow labels for a given automation area.
 * Derived from the usecase registry instead of a separate hardcoded map.
 */
export function getAutomationLabels(area: string, usecases: Usecase[] = DEFAULT_USECASES): string[] {
  const labels = new Set<string>();
  for (const uc of usecases) {
    if (uc.automationArea === area && uc.automationLabel) {
      labels.add(uc.automationLabel);
    }
  }
  // Include webhook variant for ingestion
  if (area === 'automatic_ingestion') {
    for (const l of [...labels]) {
      labels.add(`${l}_webhook`);
    }
  }
  return [...labels];
}

/**
 * Get usecases filtered by automation area.
 */
export function getUsecasesByArea(area: string, usecases: Usecase[] = DEFAULT_USECASES): Usecase[] {
  return usecases.filter(uc => uc.automationArea === area);
}

/**
 * Get usecases filtered by phase.
 */
export function getUsecasesByPhase(phase: FlowPhase, usecases: Usecase[] = DEFAULT_USECASES): Usecase[] {
  return usecases.filter(uc => uc.phase === phase);
}

// ── Usecase ↔ Workflow correlation ─────────────────────────────────────────────

/**
 * Minimal workflow shape needed to correlate a workflow back to a usecase.
 * Matches the `WorkflowSummary` used in UsecasesPage / AutomationConfig.
 */
export interface UsecaseWorkflowCandidate {
  id: string;
  name?: string;
  tags?: string[];
  [key: string]: any;
}

/**
 * Returns all workflow labels (case-sensitive originals) that should be
 * considered "linked" to the given usecase. For ingestion usecases this
 * includes the `_webhook` variant so the Ingestion Webhook workflow is
 * correlated to "EDR alerts" / "SIEM alerts" / "Email reports".
 */
export function getUsecaseWorkflowLabels(usecase: Pick<Usecase, 'automationLabel' | 'automationArea'>): string[] {
  const out: string[] = [];
  if (!usecase.automationLabel) return out;
  out.push(usecase.automationLabel);
  if (usecase.automationArea === 'automatic_ingestion') {
    out.push(`${usecase.automationLabel}_webhook`);
  }
  const lower = usecase.automationLabel.toLowerCase();
  if (lower.includes('incident routing')) {
    out.push('incident routing', 'incident_routing', 'incident_routing_rules');
  }
  if (lower.includes('schedules & phone') || lower.includes('schedules_notifications') || lower.includes('phone notification')) {
    out.push('schedules & phone notifications', 'schedules_&_phone_notifications', 'schedules_notifications', 'phone_notifications', 'assign & escalate', 'assign_&_escalate');
  }
  if (lower.includes('threat feeds') || lower.includes('ioc extraction')) {
    out.push('enable threat feeds', 'enable threat feeds_webhook', 'realtime ioc extraction', 'threat intel');
  }
  if (lower.includes('notification')) {
    out.push('notification workflow', 'notification_workflow', 'notification', 'notifications');
  }
  if (lower.includes('vulnerability correlation') || lower.includes('vulnerability comparison')) {
    out.push('vulnerability comparison', 'vulnerability_comparison', 'vulnerability correlation', 'vulnerability_correlation');
  }
  if (lower.includes('asset context') || lower.includes('ingest assets')) {
    out.push('ingest assets', 'ingest_assets', 'asset context', 'asset_context', 'asset ingestion', 'assets');
  }
  return out;
}

/**
 * Match workflows from `/api/v1/workflows` to a usecase via its
 * `automationLabel`. A workflow matches when its name contains the label
 * (case-insensitive) — same matching rule used by `workflowEnabledLabels` in
 * `UsecasesPage` so the "Linked Workflows" list is consistent with the
 * Enabled / Disabled state shown on the card.
 */
export function findWorkflowsForUsecase(
  usecase: Pick<Usecase, 'automationLabel' | 'automationArea'>,
  workflows: UsecaseWorkflowCandidate[],
): UsecaseWorkflowCandidate[] {
  const labels = getUsecaseWorkflowLabels(usecase).map((l) => l.toLowerCase());
  if (labels.length === 0 || !workflows?.length) return [];
  const matched: UsecaseWorkflowCandidate[] = [];
  const seen = new Set<string>();
  const lower = (usecase.automationLabel || '').toLowerCase();
  const isPhoneNotif = lower.includes('schedules & phone') || lower.includes('schedules_notifications') || lower.includes('phone notification');
  for (const wf of workflows) {
    const name = (wf?.name || '').toLowerCase();
    const tags = Array.isArray(wf?.tags) ? wf.tags.map((t: any) => String(t).toLowerCase()) : [];
    if (
      labels.some((label) => name.includes(label) || tags.some((t: string) => t === label || t.includes(label))) ||
      (isPhoneNotif && (tags.includes('paging') || tags.includes('mobile') || tags.includes('phone') || tags.includes('schedule')))
    ) {
      if (wf.id && seen.has(wf.id)) continue;
      if (wf.id) seen.add(wf.id);
      matched.push(wf);
    }
  }
  return matched;
}

// ── Exportable JSON shape ─────────────────────────────────────────────────────
//
// A flat, portable representation of the usecase registry shaped as:
//   [{ name, description, color, list: [{ name, type, destination, running, disabled, ... }] }]
//
// Used by the "Export JSON" action on the Automations page. The same shape can
// also be used to seed/replace usecases from an external file.

export interface UsecaseJsonEntry {
  /** Display label (e.g. "SIEM alerts") */
  name: string;
  /** Source category label (e.g. "SIEM") */
  type: string;
  /** Target category label (e.g. "Case Management") */
  destination: string;
  /** True when an underlying workflow exists / is enabled */
  running: boolean;
  /** True when the usecase is hidden from regular users (no `animated` flag) */
  disabled: boolean;
  /** Stable ID — needed to round-trip back into the registry */
  id: string;
  /** Source / target raw category IDs (for re-import) */
  source_id: string;
  target_id: string;
  /** Free-form tags (Alert, Detection, Logs, …) */
  tags: string[];
  description: string;
  agentic_description: string;
  /** Workflow label sent to /api/v2/workflows/generate (when toggleable) */
  automation_label?: string;
  automation_category?: string;
  automation_area?: Usecase['automationArea'];
  /** Manual verification required (e.g. log forwarding) */
  manual_verification?: boolean;
  /** Importance ranking 0–100; 100 = highest priority. */
  priority?: number;
  /** Optional video URL. */
  video?: string;
  /** Optional blogpost / article URL. */
  blogpost?: string;
  /** Optional reference image URL. */
  reference_image?: string;
  /** Optional custom CTA — overrides the default workflow-generation flow. */
  custom_action?: {
    label: string;
    href?: string;
    url?: string;
    description?: string;
  };
}

export interface UsecaseCategoryJson {
  /** Phase label (e.g. "Ingest & Tool Setup") */
  name: string;
  description: string;
  /** Resolved CSS color string (HSL var reference, e.g. "hsl(var(--infra-siem))") */
  color: string;
  /** Phase ID — kept for round-trip imports */
  phase: FlowPhase;
  /** Phase order (1, 2, 3) */
  step: number;
  list: UsecaseJsonEntry[];
}

export const categoryLabel = (categoryId: string): string =>
  TOOL_CATEGORIES.find(c => c.id === categoryId)?.label || categoryId;

const labelFor = categoryLabel;

/**
 * Convert the in-memory usecase registry into the portable JSON shape.
 *
 * @param usecases       The current (possibly API-enriched) usecase list.
 * @param enabledLabels  Optional set of `automationLabel`s known to have a
 *                       running workflow — used to populate `running: true`.
 */
/** Hardcoded hex equivalents of the FLOW_PHASES CSS variable colors,
 *  used in the exported JSON so consumers don't need our theme tokens. */
const PHASE_HEX_BY_ID: Record<FlowPhase, string> = {
  ingest: '#E7B008',      // --infra-siem        (45 93% 47%)
  response: '#EF4444',    // --infra-edr         (0 84% 60%)
  correlation: '#1AC4E6', // --infra-threat-intel (190 80% 50%)
};

export function getUsecasesJson(
  usecases: Usecase[] = DEFAULT_USECASES,
  enabledLabels?: Set<string>,
): UsecaseCategoryJson[] {
  return FLOW_PHASES.map(phase => ({
    name: phase.label,
    description: phase.subtitle,
    color: PHASE_HEX_BY_ID[phase.id],
    phase: phase.id,
    step: phase.step,
    list: usecases
      .filter(uc => uc.phase === phase.id)
      .map<UsecaseJsonEntry>(uc => ({
        name: uc.label,
        type: labelFor(uc.source),
        destination: labelFor(uc.target),
        running: !!(uc.automationLabel && enabledLabels?.has(uc.automationLabel)),
        disabled: uc.animated !== true,
        id: uc.id,
        source_id: uc.source,
        target_id: uc.target,
        tags: uc.tags,
        description: uc.description,
        agentic_description: uc.agenticDescription,
        ...(uc.automationLabel ? { automation_label: uc.automationLabel } : {}),
        ...(uc.automationCategory ? { automation_category: uc.automationCategory } : {}),
        ...(uc.automationArea ? { automation_area: uc.automationArea } : {}),
        ...(uc.manualVerification ? { manual_verification: true } : {}),
        ...(typeof uc.priority === 'number' ? { priority: uc.priority } : {}),
        ...(uc.video ? { video: uc.video } : {}),
        ...(uc.blogpost ? { blogpost: uc.blogpost } : {}),
        ...(uc.referenceImage ? { reference_image: uc.referenceImage } : {}),
        ...(uc.customAction ? { custom_action: uc.customAction } : {}),
      })),
  }));
}

// IDs of usecases whose backend automation is fully wired. Anything not in
// this list renders a "Coming soon" affordance instead of a live Enable
// button.
export const ACTIVE_USECASE_IDS: readonly string[] = [
  'siem_case_management_1',
  'edr_case_management_1',
  'email_case_management_1',
  'threat_intel_ingest_1',
  'threat_intel_case_management_1',
  'case_management_cases_forward_1',
  'case_management_communication_1',
  'case_management_asset_management_monitors_1',
  'case_management_assign_escalate_1',
  'asset_management_case_management_vuln_1',
  'vulnerability_ingestion_1',
  'threat_intel_network_1',
  'threat_intel_edr_1',
  'case_management_incident_routing_1',
  'case_management_schedules_notifications_1',
  'case_management_agent_ai_incident_handling_1',
];

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'usecase';
