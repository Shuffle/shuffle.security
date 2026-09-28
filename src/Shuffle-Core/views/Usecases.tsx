/**
 * UsecasesPage — Card grid overview of all data flows grouped by Phase 1/2/3.
 *
 * Self-contained / portable: this file inlines the usecase registry, API helpers,
 * auth/workflow fetching, and page-specific UI logic so it can be moved as one file.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSyncHostBaseUrl } from '../useSyncHostBaseUrl';
import { useNavigate, Link, useSearchParams, useParams, useLocation } from '@/lib/router-compat';

import {
  Box,
  Typography,
  Card,
  CardActionArea,
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  Tooltip,
  Select as MuiSelect,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  Popover,
  useTheme,
} from '@mui/material';
import { Search, ArrowRight, ArrowLeft, Download, Zap, Activity, CheckCircle2, Circle, AlertTriangle, Network, Clock, Power, PowerOff, FileJson, X, ExternalLink, Flame, PlayCircle, BookOpen, LayoutGrid, Server, Shield, MessageSquare, Mail, Crosshair, HardDrive, KeyRound, Cloud, Sparkles, Plus, Workflow, Rows, Webhook, MousePointerClick, GitBranch, MessageCircleQuestion } from 'lucide-react';
import ReactGA from 'react-ga4';
import shuffleSecurityIcon from '../assets/shuffle-icon.png';
import UsecaseAlluvialDiagram, { extractNotificationWorkflowAppNames, matchesCategory } from './UsecaseAlluvialDiagram';
import { findForwardTicketsWorkflow } from '../ingestionDetection';
import { useEntityPreference } from '@/hooks/useEntityLabel';
import {
  AppSearchDrawer,
  useAppDetailOptional,
  extractActionAppNames,
  extractWorkflowAppNames,
  normalizeAppName,
  getIngestionCategory,
  shuffleFetch,
  getApiUrl,
  getDatastoreByCategory,
  DATASTORE_CATEGORIES,
  resolveApp,
} from '@shuffleio/shuffle-mcps';
import AiAgentPromptsEditor from '@/Shuffle-MCPs/components/AiAgentPromptsEditor';
import { getAuthHeader, getShuffleCoreWorkflowUrl } from '../api';
import {
  type IntegrationItem,
  fetchAppsCached,
  fetchWorkflowsCached,
  fetchWorkflowByIdCached,
  fetchOrgCached,
  fetchCategoryAutomationsCached,
  getCachedWorkflows,
  setCachedWorkflows,
  invalidateAppsCache,
  getCachedIntegrations,
  setCachedIntegrations,
  getCachedCatalogIcons,
  updateCachedCatalogIcons,
  getCachedCategoryAppNames,
  setCachedCategoryAppNames,
  getCachedValidatedAppsByCategory,
  setCachedValidatedAppsByCategory,
  getCachedValidatedCategories,
  setCachedValidatedCategories,
  getCachedValidatedAppNames,
  setCachedValidatedAppNames,
  _algoliaIconCache,
} from './appsFetchCache';
export { invalidateAppsCache };
import { useUsecaseOutcomes } from '../hooks/useUsecaseOutcomes';
import { UsecaseOutcomeSection } from '../components/UsecaseOutcome';
import { resolveOutcomeKind } from '../lib/outcomes';
import { useWorkflowExecutionStats } from '../hooks/useWorkflowExecutionStats';
import { useHostMonitorCount } from '@/hooks/useHostMonitorCount';
import { ThreatIntelReadinessBanner } from '@/components/threat-intel/ThreatIntelReadinessBanner';
import { useWorkflowHealth } from '@/hooks/useWorkflowHealth';
import { diagnoseUsecase } from '@/services/workflowHealth';
import { resolveSkillAllowedApps, isBuiltInSkillApp } from '@/lib/agentTools';
import { findRoutingWorkflow, isWorkflowHookedToCategory } from '@/utils/routingWorkflowUtils';
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
     * Optional modal key. When set, the CTA opens an inline dialog provided
     * by the host via the `renderUsecaseActionModal` slot instead of (or in
     * addition to) navigating via `href`/`url`. Used so flows like
     * "Add Host-Monitors" can deploy a monitor without leaving the page.
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

// Flows that accept apps from EITHER Communication OR Cases as a destination.
// The Add Tool drawer is unfiltered for these, the per-app toggle preserves
// apps from both categories, and the workflow generate payload sends the
// union under a single automationLabel.
const MULTI_DEST_FLOW_IDS = new Set<string>([
  'case_management_communication_1', // Notifications
  'case_management_cases_forward_1', // Forward Tickets
]);

const USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT = new Set<string>([
  'siem_case_management_1',
  'edr_case_management_1',
  'email_case_management_1',
]);

// Usecases whose Source apps cannot be wired up yet — clicking the toggle
// on any source app surfaces a "Coming soon" toast instead of mutating the
// workflow. The Enrichment usecase runs entirely off Shuffle's built-in
// "Realtime IOC extraction" workflow and does not (yet) accept external
// threat-intel sources as triggers.
const SOURCE_COMING_SOON_FLOW_IDS = new Set<string>([
  'threat_intel_case_management_1', // Enrichment
]);

// Usecases whose Destination is exclusively Shuffle Security — hide all
// third-party destination apps and the "Add tool" affordance.
const DESTINATION_SHUFFLE_ONLY_FLOW_IDS = new Set<string>([
  'threat_intel_case_management_1', // Enrichment
]);

// ── Per-usecase "I just picked this app" persistence ──────────────────────────
// When the user picks an app from the AppSearchDrawer we both wire it into the
// workflow (best-effort) AND record it in localStorage so the next time they
// open the usecase the app is shown as enabled — even if the backend write was
// still in flight or got dropped.
const INJECTED_APPS_LS_KEY = 'shuffle-security_usecase_injected_apps';
export function readInjectedUsecaseApps(flowId: string): string[] {
  try {
    const raw = localStorage.getItem(INJECTED_APPS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.[flowId]) ? parsed[flowId] : [];
  } catch { return []; }
}
export function pushInjectedUsecaseApp(flowId: string, appName: string) {
  try {
    const raw = localStorage.getItem(INJECTED_APPS_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const list: string[] = Array.isArray(parsed[flowId]) ? parsed[flowId] : [];
    const k = String(appName || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (!list.some((n) => String(n).toLowerCase().replace(/[\s_-]+/g, '') === k)) {
      list.push(appName);
    }
    parsed[flowId] = list;
    localStorage.setItem(INJECTED_APPS_LS_KEY, JSON.stringify(parsed));
  } catch { /* localStorage unavailable */ }
}
export function removeInjectedUsecaseApp(flowId: string, appName: string) {
  try {
    const raw = localStorage.getItem(INJECTED_APPS_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const list: string[] = Array.isArray(parsed[flowId]) ? parsed[flowId] : [];
    const k = String(appName || '').toLowerCase().replace(/[\s_-]+/g, '');
    parsed[flowId] = list.filter((n) => String(n).toLowerCase().replace(/[\s_-]+/g, '') !== k);
    localStorage.setItem(INJECTED_APPS_LS_KEY, JSON.stringify(parsed));
  } catch { /* localStorage unavailable */ }
}
export function clearInjectedUsecaseApps(flowId: string) {
  try {
    const raw = localStorage.getItem(INJECTED_APPS_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!(flowId in parsed)) return;
    delete parsed[flowId];
    localStorage.setItem(INJECTED_APPS_LS_KEY, JSON.stringify(parsed));
  } catch { /* localStorage unavailable */ }
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
    automationLabel: 'Realtime IOC extraction',
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
    description: 'Route incoming incidents to the right sub-organization based on tenant, source, severity, observables, or any field in the incident payload. Keeps multi-tenant environments tidy and ensures the right team owns each incident from the start.',
    agenticDescription: 'An agent evaluates each new incident against your rules, decides which sub-organization should own it, and either suggests or executes the move with full audit trail.',
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
  edr: ['edr', 'xdr', 'endpoint detection', 'endpoint protection', 'crowdstrike', 'sentinelone', 'microsoft defender', 'defender for endpoint', 'carbon black', 'cybereason', 'tanium', 'cylance', 'sophos', 'trellix'],
  communication: ['communication', 'chat', 'messaging', 'slack', 'teams', 'pagerduty', 'opsgenie', 'notification'],
  email: ['email gateway', 'phishing', 'gmail', 'outlook', 'microsoft 365', 'google workspace', 'exchange', 'smtp', 'imap', 'office365', 'microsoft_graph', 'microsoft graph', 'proofpoint', 'mimecast'],
  threat_intel: ['threat intel', 'intelligence', 'misp', 'virustotal', 'otx', 'recorded future', 'ioc', 'abuse'],
  asset_management: ['asset', 'cmdb', 'inventory', 'qualys', 'tenable', 'vulnerability', 'snipe'],
  iam: ['iam', 'identity', 'access', 'okta', 'azure ad', 'cyberark', 'jumpcloud', 'ldap', 'active directory'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'google cloud', 'oracle cloud', 'digitalocean', 'cloud provider'],
};

import {
  matchAppToCategoryList,
  matchAppToCategory,
  findRelatedUsecasesForApp,
  isUsecaseVisible,
  filterVisibleUsecases,
  type UsecaseVisibilityOptions,
} from '../config/usecases';
export {
  matchAppToCategoryList,
  matchAppToCategory,
  findRelatedUsecasesForApp,
  isUsecaseVisible,
  filterVisibleUsecases,
  type UsecaseVisibilityOptions,
};

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

const labelFor = (categoryId: string): string =>
  TOOL_CATEGORIES.find(c => c.id === categoryId)?.label || categoryId;

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

// ============================================================================
// Inlined: API config
// ============================================================================
// Resolve the Shuffle backend base URL.
// Order:
//  1. VITE_SHUFFLE_API_URL env override
//  2. Lovable preview hosts -> tunnel.schemaless.org (dev backend with CORS+cookies)
//  3. window.location.origin (self-hosted: nginx proxies /api/* to the backend)
//  4. https://shuffler.io (SSR / fallback)
//
// NOTE: The host app can override this entirely by passing the `globalUrl`
// prop on <UsecasesPage />. This resolver only kicks in for standalone use.
const DEV_BACKEND = 'https://tunnel.schemaless.org';
const PROD_BACKEND = 'https://uk.shuffle.security';

const resolveApiBaseUrl = () => {
  let envUrl: string | undefined;
  try {
    // Indirect access avoids esbuild's cjs `import.meta` warning while still
    // picking up the env var in esm builds / Vite hosts.
    envUrl = (new Function('try { return import.meta.env?.VITE_SHUFFLE_API_URL } catch { return undefined }')()) as string | undefined;
  } catch { /* no-op */ }
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLovablePreview =
      host.includes('lovableproject.com') ||
      host.includes('lovable.app') ||
      host.includes('id-preview--');
    if (isLovablePreview) return DEV_BACKEND;
    return window.location.origin;
  }
  return PROD_BACKEND;
};

const DEFAULT_API_BASE_URL: string = resolveApiBaseUrl();

const getStoredApiKey = (): string | null => {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem('session_token') : null; }
  catch { return null; }
};

// ============================================================================
// Runtime config context — lets host apps inject `globalUrl` / `userdata` /
// `isLoggedIn` overrides via props on <UsecasesPage />. When no provider is
// present (standalone usage), defaults reproduce the previous behavior:
// API base resolved from env/host, auth via `shuffle_api_key` localStorage,
// and authentication probed via `/api/v1/getinfo`.
// ============================================================================
/**
 * Async-resolved app icon used in the Linked Workflows chips. Falls back to
 * the seeded icon (if any) while the catalog lookup is in flight, then to a
 * single uppercase letter when no image is available.
 */
function WorkflowAppIcon({ name, seededIcon, size = 16 }: { name: string; seededIcon?: string; size?: number }) {
  const [icon, setIcon] = useState<string | undefined>(seededIcon);
  useEffect(() => {
    setIcon(seededIcon);
    if (seededIcon || !name) return;
    let cancelled = false;
    resolveApp(name)
      .then((r) => { if (!cancelled && r?.image) setIcon(r.image); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [name, seededIcon]);
  if (icon) {
    return <Box component="img" src={icon} alt={name} sx={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return (
    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', lineHeight: 1 }}>
      {name.slice(0, 1).toUpperCase()}
    </Typography>
  );
}

/**
 * Raw response body from `GET /api/v1/getinfo`. Host apps typically already
 * have this loaded and pass it down as `userdata`.
 */
export interface UsecasesUserData {
  success?: boolean;
  id?: string;
  username?: string;
  support?: boolean;
  active_org?: { id?: string; name?: string;[key: string]: any };
  orgs?: any[];
  region_url?: string;
  app_execution_limit?: number;
  app_execution_usage?: number;
  /** Optional API key — if present it's used as bearer token for requests. */
  api_key?: string;
  apikey?: string;
  [key: string]: any;
}

interface UsecasesPageConfig {
  baseUrl: string;
  /** Built from external `userdata.api_key` if provided, else from localStorage. */
  authHeader: () => Record<string, string>;
  /** When true, skip the internal getinfo probe and trust `externalUserInfo`. */
  hasExternalAuth: boolean;
  externalUserInfo: UsecasesUserData | null;
  externalIsAuthenticated: boolean;
  /** Mirrors the host app's `isLoaded` flag — currently informational. */
  isLoaded: boolean;
  /** Optional host-provided slot rendered next to the Source/Destination
   *  header inside the detail view. Lets the host inject contextual chips
   *  (e.g. the Webhook ingestion button on SIEM/EDR alert sources) using
   *  the exact same component already mounted elsewhere in the app. */
  renderEndpointSlot?: (params: { flowId: string; flowLabel: string; side: 'source' | 'destination' }) => React.ReactNode;
  /** Optional host slot rendered above the Outcome block in the usecase
   *  detail view. Lets the host inject a full configuration component for
   *  a usecase (e.g. the Incident Routing editor) instead of bundling it
   *  into Shuffle-Core. */
  renderUsecaseDetailSlot?: (params: { flowId: string; flowLabel: string; onOpenModal?: (modal: string) => void }) => React.ReactNode;
  /** Optional host slot that renders an inline modal for a usecase whose
   *  `customAction.modal` key matches. Lets the host embed dialogs (e.g.
   *  "Add Host" for the Add Host-Monitors usecase) directly in the sidebar
   *  without navigating away. The host should return its own Dialog
   *  controlled by `open`/`onClose`. */
  renderUsecaseActionModal?: (params: {
    modal: string;
    flowId: string;
    flowLabel: string;
    open: boolean;
    onClose: () => void;
  }) => React.ReactNode;
  /** Optional callback fired when a usecase automation is enabled or disabled. */
  onToggled?: (label: string, enabled: boolean) => void;
  /** Preloaded workflows to eliminate duplicate /api/v1/workflows fetches */
  preloadedWorkflows?: WorkflowSummary[];
  /** Scope class to apply to portaled MUI surfaces (Drawer paper, etc.) so
   *  the scoped HSL tokens resolve correctly even outside the page wrapper. */
  scopeClassName?: string;
}

const DEFAULT_CONFIG: UsecasesPageConfig = {
  baseUrl: DEFAULT_API_BASE_URL,
  authHeader: (): Record<string, string> => {
    return getAuthHeader();
  },
  hasExternalAuth: false,
  externalUserInfo: null,
  externalIsAuthenticated: false,
  isLoaded: true,
  renderEndpointSlot: undefined,
  renderUsecaseDetailSlot: undefined,
  renderUsecaseActionModal: undefined,
  onToggled: undefined,
  preloadedWorkflows: undefined,
  scopeClassName: 'shuffle-usecases-scope',
};

const UsecasesPageConfigContext = React.createContext<UsecasesPageConfig>(DEFAULT_CONFIG);

const useUsecasesConfig = () => React.useContext(UsecasesPageConfigContext);

// ============================================================================
// Scoped design tokens — injected once into <head> the first time the page
// mounts. Everything inside `.shuffle-usecases-scope` resolves the HSL
// variables this file relies on (background, card, border, primary, infra-*),
// so the page renders identically regardless of the host app's CSS.
// Toggle dark mode by adding `class="dark"` anywhere up the tree.
// ============================================================================
const SCOPE_CLASS = 'shuffle-usecases-scope';
const STYLE_TAG_ID = 'shuffle-usecases-scope-style';

const SCOPED_CSS = `
.${SCOPE_CLASS} {
  --primary: 24 100% 50%;
  --primary-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  --infra-case-mgmt: 24 90% 55%;
  --infra-siem: 45 93% 47%;
  --infra-network: 210 100% 56%;
  --infra-edr: 0 84% 60%;
  --infra-communication: 142 71% 45%;
  --infra-email: 280 70% 60%;
  --infra-threat-intel: 190 80% 50%;
  --infra-asset-mgmt: 25 95% 53%;
  --infra-iam: 330 75% 55%;
  --infra-cloud: 200 75% 50%;

  /* Severity / status tokens (used for enabled/active indicators) */
  --severity-low: 142 71% 45%;
  --severity-medium: 45 93% 47%;
  --severity-high: 12 92% 52%;
  --severity-critical: 0 84% 60%;
  --severity-info: 210 100% 56%;

  /* Radius — used by MUI Card via the design tokens */
  --radius: 8px;

  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: hsl(var(--foreground));
  /* Intentionally no background here so the scope inherits from the host page
   * and blends into whichever app embeds it instead of painting its own surface. */
}

/* MUI Card / Paper border-radius fallback for hosts that don't provide our MUI theme. */
.${SCOPE_CLASS} .MuiCard-root,
.${SCOPE_CLASS} .MuiPaper-rounded {
  border-radius: 8px;
}
.${SCOPE_CLASS} .MuiButtonBase-root.MuiCardActionArea-root {
  border-radius: inherit;
}

/* Light theme rules.
 * Applies when the scope itself has .light, OR when host is not dark and scope is not pinned to .dark. */
:root:not(.dark) .${SCOPE_CLASS}:not(.dark),
html:not(.dark) .${SCOPE_CLASS}:not(.dark),
body:not(.dark) .${SCOPE_CLASS}:not(.dark),
.${SCOPE_CLASS}.light {
  --background: 0 0% 98%;
  --foreground: 0 0% 9%;
  --card: 0 0% 100%;
  --muted-foreground: 0 0% 40%;
  --border: 0 0% 78%;
  --severity-low: 142 72% 31%;
  --severity-medium: 38 92% 33%;
  --severity-high: 12 88% 46%;
  --severity-critical: 0 72% 51%;
  --severity-info: 215 90% 45%;
}

/* Dark theme rules.
 * Applies when the scope itself has .dark (forced via theme=dark), OR when an
 * ancestor has .dark AND the scope was not forced to .light. The :not(.light)
 * guard lets theme=light override an ambient .dark host. */
.dark .${SCOPE_CLASS}:not(.light),
.${SCOPE_CLASS}.dark {
  --background: 0 0% 10%;
  --foreground: 0 0% 100%;
  --card: 0 0% 13%;
  --muted-foreground: 0 0% 50%;
  --border: 0 0% 20%;
}
`;

function useInjectScopedStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_TAG_ID)) return;
    const tag = document.createElement('style');
    tag.id = STYLE_TAG_ID;
    tag.textContent = SCOPED_CSS;
    document.head.appendChild(tag);
    // Intentionally never removed — page may unmount/remount; styles stay cheap.
  }, []);
}


/** Hook returning `apiUrl` and `authHeader` bound to the active config. */
function useApi() {
  const cfg = useUsecasesConfig();
  const baseUrl = cfg.baseUrl;
  const authHeader = cfg.authHeader;
  const apiUrl = React.useCallback((endpoint: string) => `${baseUrl}${endpoint}`, [baseUrl]);
  return React.useMemo(
    () => ({
      apiUrl,
      authHeader,
    }),
    [apiUrl, authHeader],
  );
}

// ============================================================================
// Real sonner toast — visible UI feedback for success/error.
import { toast as sonnerToast } from '../toast';
import { fetchIocEntries, sumIocEntries } from '../utils/iocFeedTotals';
import { usePageMeta } from '../usePageMeta';
import { seedDefaultThreatFeeds } from '../hooks/useThreatFeeds';
import { seedDefaultIOCTypes } from '@/hooks/useIOCTypes';
import { useEnrichmentStatus, enableThreatIntelAutomation, disableThreatIntelAutomation } from '../hooks/useEnrichmentStatus';

// Usecases that enable themselves end-to-end without needing the user to
// connect a source-category app first. Clicking Enable on these runs a
// dedicated, self-contained setup path (seeding defaults, generating
// background workflows, etc.) instead of the generic /workflows/generate
// flow that hard-requires a validated source tool.
const enableThreatIntelFlow = async () => {
  const [a, b, c] = await Promise.all([
    seedDefaultThreatFeeds(),
    seedDefaultIOCTypes(),
    enableThreatIntelAutomation(),
  ]);
  return a && b && c;
};

function getActiveOrgId(): string | null {
  try {
    const info = typeof window !== 'undefined' ? localStorage.getItem('shuffle_user_info') : null;
    return info ? JSON.parse(info)?.active_org?.id || null : null;
  } catch {
    return null;
  }
}

const DEFAULT_INCIDENT_AI_AGENT_PROMPT = `Triage, investigate, and respond holistically to this incident.

OPERATING POSTURE:
- Simple, benign, or routine alerts (false positives, authorized scanners, duplicate noise): Act as an AUTONOMOUS RESOLVER. Verify technical evidence, document findings in activity, set status to "resolved", and close cleanly with zero open tasks.
- Complex alerts and confirmed threats (malware, C2 beaconing, ransomware, lateral movement): Act as an ANALYST COPILOT. Do NOT attempt to close the incident autonomously. Your mission is to prepare the case and accelerate the human analyst by correlating telemetry, generating structured response tasks across categories, recommending containment actions with approval_required: true, and setting status to "in_progress" or "escalated".

RESPONSE PATHWAYS:

1. AUTO-RESOLVE / CLOSE (Benign, False Positive, Duplicate, or Test ONLY):
- ONLY if this alert is definitively verified as a false positive, benign administrative activity, authorized test/scan, routine noise, or a duplicate of an existing incident.
- CRITICAL RULE: NEVER set "status" to "resolved" if there is an active threat, C2 beaconing, malware, or if ANY open tasks remain. Completing initial triage does NOT resolve the incident.
- If resolving: Set "status" to "resolved", add activity entry: {"ai_handled": true, "id": "status-\${timenow-unix}", "type": "status", "user": "@AIAgent", "timestamp": \${timenow-unix}, "content": "Resolved: [Specific evidence and rationale explaining why this is benign/FP/duplicate]"}. Do NOT generate open tasks.

2. ESCALATE: If this is a high/critical severity threat, active compromise, ransomware, credential theft, lateral movement, or high ambiguity requiring human judgment:
- Update "severity" to "high" or "critical".
- Set "status" to "escalated".
- Add an activity entry: {"ai_handled": true, "id": "status-\${timenow-unix}", "type": "status", "user": "@AIAgent", "timestamp": \${timenow-unix}, "content": "Escalated: High-priority threat detected. [Executive threat summary, affected assets/users, and recommended human actions]"}.

3. CONTAINMENT (BLOCK / ISOLATE / REVOKE):
- For compromised endpoints: propose or execute host isolation via available EDR tools.
- For malicious external IPs, domains, or hashes: propose or execute perimeter firewall/DNS blocks.
- For compromised accounts: propose or execute session revocation or account lock.
- For disruptive actions, set approval_required: true and request analyst confirmation.

4. FIX SPAMMY DETECTIONS:
- If this alert is from a noisy or misconfigured detection rule firing repeatedly on benign operations, propose specific rule tuning/exclusions in the activity log or create a task: {"assignee": "", "title": "Tune detection rule: [Rule Name] to exclude [Pattern]", "category": "triage", "action": "tune", "source": "detection_rule", "completed": false, "createdBy": "ai-agent@shuffler.io"}.

5. TOOL REQUESTS:
- Utilize available tools (shuffle-datastore, shuffle_incidents, etc.). If an essential tool (EDR, SIEM, Threat Intel, Firewall) is missing or unauthenticated, explicitly state what tool is required, why, and the specific query/action needed.

6. INVESTIGATION & DOCUMENTATION:
- If ongoing investigation, containment, or remediation is needed, set "status" to "in_progress" (or "escalated"). NEVER set "status" to "resolved" while open tasks exist.
- For triage progress or investigation notes, use type "comment", NOT type "status": {"ai_handled": true, "id": "comment-\${timenow-unix}", "type": "comment", "user": "@AIAgent", "timestamp": \${timenow-unix}, "content": "Triage findings: [Summary of verified facts, indicators, and next steps]"}.
- Generate structured tasks in JSON format: {"tasks": [{"assignee": "", "title": "Title of task", "category": "triage/investigation/containment/recovery/communication/documentation", "action": "isolate/block/revoke/query/tune/document/etc.", "source": "sentinelone/crowdstrike/okta/splunk/virustotal/manual/etc.", "completed": false, "createdBy": "ai-agent@shuffler.io"}]}.
- Document findings, timeline, and MITRE ATT&CK techniques in activity and comments. Leave generated tasks open (completed: false) for the analyst and incident response team to coordinate and track. Do NOT prematurely mark tasks completed or close the incident.

Update the internal shuffle datastore with the same key and category 'shuffle-security_incidents'. CRITICAL: You MUST ONLY send the specific fields that require a change. NEVER send or echo unchanged fields (such as unchanged tasks, activity, severity, or metadata). Do NOT overwrite unrelated fields.`;

export const setAiAgentIncidentAutomation = async (enabled: boolean): Promise<boolean> => {
  const orgId = getActiveOrgId();
  if (!orgId) throw new Error('No active organization found');

  const headers = { ...getAuthHeader(orgId) };
  const listUrl = getApiUrl(`/api/v1/orgs/${orgId}/list_cache?category=shuffle-security_incidents&top=1`);
  const res = await fetch(listUrl, { credentials: 'include', headers });
  if (!res.ok) throw new Error(`Failed to load incident automations (${res.status})`);
  const data = await res.json();
  const existingAutomations: any[] = data?.category_config?.automations || [];

  let nextAutomations: any[];
  if (!enabled) {
    nextAutomations = existingAutomations.filter(
      (a: any) => !(a?.type === 'ai_agent' || a?.name === 'Run AI Agent')
    );
  } else {
    const existingAi = existingAutomations.find(
      (a: any) => a?.type === 'ai_agent' || a?.name === 'Run AI Agent'
    );
    if (existingAi) {
      nextAutomations = existingAutomations.map((a: any) =>
        a === existingAi ? { ...a, enabled: true } : a
      );
    } else {
      nextAutomations = [
        ...existingAutomations,
        {
          name: 'Run AI Agent',
          description: 'Runs an AI Agent to process the updated value. Uses built-in ShuffleAI configs. Learn more: https://shuffler.io/docs/AI',
          type: 'singul',
          enabled: true,
          options: [{ key: 'action', value: DEFAULT_INCIDENT_AI_AGENT_PROMPT, apps: '48793430d21468f9e371ace402efcd8e' }],
        },
      ];
    }
  }

  const payload = {
    category: 'shuffle-security_incidents',
    automations: nextAutomations,
    settings: data?.category_config?.settings || { timeout: 0 },
  };

  const saveRes = await fetch(getApiUrl('/api/v2/datastore/automate'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  if (!saveRes.ok) {
    throw new Error(`Failed to update incident automations (${saveRes.status})`);
  }

  invalidateAppsCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('shuffle-ai-agent-toggled', { detail: { enabled } }));
  }
  return true;
};

const SELF_CONTAINED_ENABLE: Record<
  string,
  { enable: () => Promise<boolean>; disable: () => Promise<boolean> }
> = {
  threat_intel_ingest_1: {
    enable: enableThreatIntelFlow,
    disable: () => disableThreatIntelAutomation(),
  },
  threat_intel_case_management_1: {
    enable: enableThreatIntelFlow,
    disable: () => disableThreatIntelAutomation(),
  },
  threat_intel_network_1: {
    enable: enableThreatIntelFlow,
    disable: () => disableThreatIntelAutomation(),
  },
  threat_intel_edr_1: {
    enable: enableThreatIntelFlow,
    disable: () => disableThreatIntelAutomation(),
  },
  case_management_agent_ai_incident_handling_1: {
    enable: () => setAiAgentIncidentAutomation(true),
    disable: () => setAiAgentIncidentAutomation(false),
  },
};
type ToastOpts = { duration?: number; description?: string; action?: { label: string; onClick: () => void } };
const toast = {
  success: (msg: string, opts?: ToastOpts) => {
    if (typeof window !== 'undefined') console.info('[toast]', msg);
    sonnerToast.success(msg, opts);
  },
  error: (msg: string, opts?: ToastOpts) => {
    if (typeof window !== 'undefined') console.error('[toast]', msg);
    sonnerToast.error(msg, opts);
  },
  warning: (msg: string, opts?: ToastOpts) => {
    if (typeof window !== 'undefined') console.warn('[toast]', msg);
    sonnerToast.warning(msg, opts);
  },
};

// ============================================================================
// Inlined: page title helper
// ============================================================================
function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);
}

// ============================================================================
// Inlined: auth state query
// ============================================================================
interface OrgInterest {
  active?: boolean;
  name?: string;
  type?: string;
  [key: string]: any;
}
interface UserInfoLite {
  id?: string;
  username?: string;
  support?: boolean;
  interests?: OrgInterest[];
}
let pendingAutoEnableFlowId: string | null = null;

export const setPendingAutoEnableFlow = (flowId: string | null) => {
  pendingAutoEnableFlowId = flowId;
  if (typeof window !== 'undefined') {
    if (flowId) {
      try {
        sessionStorage.setItem('shuffle_auto_enable_flow_id', flowId);
      } catch {}
    } else {
      try {
        sessionStorage.removeItem('shuffle_auto_enable_flow_id');
      } catch {}
    }
  }
};

export const getPendingAutoEnableFlow = (): string | null => {
  if (pendingAutoEnableFlowId) return pendingAutoEnableFlowId;
  if (typeof window !== 'undefined') {
    try {
      return sessionStorage.getItem('shuffle_auto_enable_flow_id');
    } catch {}
  }
  return null;
};

function getInitialAuthState(cfg: any): { userInfo: UserInfoLite | null; isAuthenticated: boolean } {
  if (cfg.hasExternalAuth) {
    const ext = cfg.externalUserInfo as (UsecasesUserData & { interests?: OrgInterest[] }) | null;
    return {
      userInfo: ext
        ? {
            id: ext.id,
            username: ext.username,
            support: ext.support === true,
            interests: Array.isArray(ext.interests) ? ext.interests : [],
          }
        : null,
      isAuthenticated: Boolean(cfg.externalIsAuthenticated),
    };
  }
  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('shuffle_user_info');
      const token = localStorage.getItem('shuffle_auth_token');
      if (rawUser && (token || rawUser.includes('"id"'))) {
        const parsed = JSON.parse(rawUser);
        return {
          userInfo: {
            id: parsed.id,
            username: parsed.username,
            support: parsed.support === true,
            interests: Array.isArray(parsed.interests) ? parsed.interests : [],
          },
          isAuthenticated: true,
        };
      }
    } catch {}
  }
  return { userInfo: null, isAuthenticated: false };
}

function useAuthLite() {
  const cfg = useUsecasesConfig();
  const { apiUrl, authHeader } = useApi();
  const [state, setState] = useState<{ userInfo: UserInfoLite | null; isAuthenticated: boolean }>(() =>
    getInitialAuthState(cfg)
  );
  const refetch = React.useCallback(async () => {
    if (cfg.hasExternalAuth) return;
    try {
      const res = await fetch(apiUrl('/api/v1/getinfo'), {
        credentials: 'include',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.success !== true) return;
      setState({
        userInfo: {
          id: body.id,
          username: body.username,
          support: body.support === true,
          interests: Array.isArray(body.interests) ? body.interests : [],
        },
        isAuthenticated: true,
      });
    } catch {
      /* keep current */
    }
  }, [cfg.hasExternalAuth, apiUrl, authHeader]);
  useEffect(() => {
    // External host app provided auth — trust it, skip the getinfo probe.
    if (cfg.hasExternalAuth) {
      const ext = cfg.externalUserInfo as (UsecasesUserData & { interests?: OrgInterest[] }) | null;
      setState({
        userInfo: ext
          ? {
            id: ext.id,
            username: ext.username,
            support: ext.support === true,
            interests: Array.isArray(ext.interests) ? ext.interests : [],
          }
          : null,
        isAuthenticated: cfg.externalIsAuthenticated,
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/v1/getinfo'), {
          credentials: 'include',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (body?.success !== true || cancelled) return;
        setState({
          userInfo: {
            id: body.id,
            username: body.username,
            support: body.support === true,
            interests: Array.isArray(body.interests) ? body.interests : [],
          },
          isAuthenticated: true,
        });
      } catch {
        /* keep defaults */
      }
    })();
    return () => { cancelled = true; };
  }, [cfg.hasExternalAuth, cfg.externalIsAuthenticated, cfg.externalUserInfo, apiUrl, authHeader]);
  return { ...state, refetch };
}

// ============================================================================
// Inlined: workflows query
// ============================================================================
export interface WorkflowSummary {
  id: string;
  name: string;
  tags?: string[];
  [key: string]: any;
}
let workflowsLiteCache: WorkflowSummary[] | null = null;
let workflowsLiteFetchPromise: Promise<WorkflowSummary[]> | null = null;

function useWorkflowsLite(preloadedWorkflows?: WorkflowSummary[]) {
  const { apiUrl, authHeader } = useApi();
  const [data, setData] = useState<WorkflowSummary[]>(() => {
    if (preloadedWorkflows && preloadedWorkflows.length > 0) return preloadedWorkflows;
    return getCachedWorkflows() || workflowsLiteCache || [];
  });

  useEffect(() => {
    if (preloadedWorkflows && preloadedWorkflows.length > 0) {
      setData(preloadedWorkflows);
      workflowsLiteCache = preloadedWorkflows;
      setCachedWorkflows(preloadedWorkflows);
    }
  }, [preloadedWorkflows]);

  const fetchOnce = React.useCallback(async (force = false) => {
    if (!force) {
      if (preloadedWorkflows && preloadedWorkflows.length > 0) {
        setData(preloadedWorkflows);
        return;
      }
      const cached = getCachedWorkflows() || workflowsLiteCache;
      if (cached && cached.length > 0) {
        setData(cached);
        return;
      }
    }
    try {
      const list = await fetchWorkflowsCached(apiUrl('/api/v1/workflows'), {
        credentials: 'include',
        headers: { ...authHeader() },
      }, force);
      workflowsLiteCache = list;
      setData(list);
    } catch {
      setData(workflowsLiteCache || []);
    }
  }, [apiUrl, authHeader, preloadedWorkflows]);

  useEffect(() => {
    if (!preloadedWorkflows?.length && !workflowsLiteCache && !getCachedWorkflows()?.length) {
      fetchOnce();
    }
  }, [fetchOnce, preloadedWorkflows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleWorkflowsUpdated = () => { fetchOnce(true); };
    window.addEventListener('shuffle-workflows-updated', handleWorkflowsUpdated);
    return () => window.removeEventListener('shuffle-workflows-updated', handleWorkflowsUpdated);
  }, [fetchOnce]);
  return { data, refetch: () => fetchOnce(true) };
}

/**
 * Match workflows to a usecase via its `automationLabel`.
 * Same rule as `workflowEnabledLabels` so the linked-workflow list stays
 * consistent with the card's enabled/disabled badge.
 *
 * Mirror of `findWorkflowsForUsecase` in `src/config/usecases.ts`. Kept
 * inline because this page intentionally inlines its registry copy.
 */
function findWorkflowsForUsecase(
  usecase: Pick<Usecase, 'automationLabel' | 'automationArea'>,
  workflows: WorkflowSummary[],
): WorkflowSummary[] {
  if (!usecase.automationLabel || !workflows?.length) return [];
  const labels = [usecase.automationLabel.toLowerCase()];
  if (usecase.automationArea === 'automatic_ingestion') {
    labels.push(`${usecase.automationLabel.toLowerCase()}_webhook`);
  }
  const lower = usecase.automationLabel.toLowerCase();
  if (lower.includes('incident routing')) {
    labels.push('incident routing', 'incident_routing', 'incident_routing_rules');
  }
  const isPhoneNotif =
    lower.includes('schedules & phone') ||
    lower.includes('schedules_notifications') ||
    lower.includes('phone notification');
  if (isPhoneNotif) {
    labels.push(
      'schedules & phone notifications',
      'schedules_&_phone_notifications',
      'schedules_notifications',
      'phone_notifications',
      'phone notification',
      'phone notifications',
      'assign & escalate',
      'assign_&_escalate',
    );
  }
  if (lower.includes('threat feeds') || lower.includes('ioc extraction')) {
    labels.push('enable threat feeds', 'enable threat feeds_webhook', 'realtime ioc extraction', 'threat intel');
  }
  if (lower.includes('notification')) {
    labels.push('notification workflow', 'notification_workflow', 'notification', 'notifications');
  }
  if (lower.includes('vulnerability correlation') || lower.includes('vulnerability comparison')) {
    labels.push('vulnerability comparison', 'vulnerability_comparison', 'vulnerability correlation', 'vulnerability_correlation');
  }
  if (lower.includes('asset context') || lower.includes('ingest assets')) {
    labels.push('ingest assets', 'ingest_assets', 'asset context', 'asset_context', 'asset ingestion', 'assets');
  }
  // The "Ingestion Webhook" workflow is the canonical webhook entrypoint for
  // every automatic_ingestion usecase (SIEM/EDR/Email alerts). It is created
  // by the WebhookIngestionButton / onboarding and is not always tagged with
  // the usecase's automationLabel, so name-match it explicitly here.
  const isIngestion = usecase.automationArea === 'automatic_ingestion';
  const matched: WorkflowSummary[] = [];
  const seen = new Set<string>();
  for (const wf of workflows) {
    const name = (wf?.name || '').toLowerCase();
    const tags = ((wf as any)?.tags || []).map((t: any) => String(t).toLowerCase());
    // Mirror `workflowEnabledLabels`: match on workflow name OR any tag
    // containing the label. This ensures webhook-ingestion workflows (often
    // named e.g. "Ingestion Webhook" but tagged "ingest tickets_webhook")
    // surface in the Linked Workflows list, consistent with how the card's
    // Enabled badge is computed.
    const hits =
      (isIngestion && name === 'ingestion webhook') ||
      (isPhoneNotif && (tags.includes('paging') || tags.includes('mobile') || tags.includes('phone notification') || tags.includes('schedule'))) ||
      labels.some(
        (label) =>
          (name && (name === label || name.includes(label))) ||
          tags.includes(label) ||
          tags.some((t: string) => t === label || t.includes(label)),
      );
    if (!hits) continue;
    if (wf.id && seen.has(wf.id)) continue;
    if (wf.id) seen.add(wf.id);
    matched.push(wf);
  }
  return matched;
}

function getLinkedWorkflowsForUsecase(
  flow: Pick<Usecase, 'id' | 'automationLabel' | 'automationArea'>,
  workflows: WorkflowSummary[],
  notificationWorkflow?: WorkflowSummary | null,
): { workflows: WorkflowSummary[]; usecaseWorkflows: WorkflowSummary[]; forwardTicketsWorkflows: WorkflowSummary[]; notificationWorkflows: WorkflowSummary[] } {
  const linked = findWorkflowsForUsecase(flow, workflows);
  const seen = new Set(linked.map((wf) => wf.id).filter(Boolean));
  const forwardTicketsWorkflows = USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT.has(flow.id)
    ? findWorkflowsForUsecase({ automationLabel: 'Forward Tickets', automationArea: undefined as any }, workflows)
      .filter((wf) => !seen.has(wf.id))
    : [];
  forwardTicketsWorkflows.forEach((wf) => { if (wf.id) seen.add(wf.id); });
  const notificationWorkflows = notificationWorkflow?.id && !seen.has(notificationWorkflow.id)
    ? [notificationWorkflow]
    : [];
  return { workflows: [...linked, ...forwardTicketsWorkflows, ...notificationWorkflows], usecaseWorkflows: linked, forwardTicketsWorkflows, notificationWorkflows };
}

function getWorkflowEnabledAppNames(workflows: WorkflowSummary[]): Set<string> {
  const names = new Set<string>();
  for (const wf of workflows) {
    for (const name of extractWorkflowAppNames(wf)) names.add(name);
  }
  return names;
}

/**
 * Ingestion usecases (Email reports, SIEM alerts, EDR alerts) share the Ingest Tickets
 * workflow, but each usecase must be INDIVIDUALLY active based strictly on whether
 * an app in its specific source category is active (authenticated and wired into the workflow).
 *
 * This matches the Alluvial diagram's enablement logic and ensures:
 * 1. An active webhook does NOT mark Email/SIEM/EDR active.
 * 2. Having incidents in the org does NOT mark Email/SIEM/EDR active.
 * 3. Connecting an Email app (e.g. Gmail) only marks "Email reports" active, not SIEM/EDR.
 */
export function isIngestionUsecaseActive(
  flow: Pick<Usecase, 'automationArea' | 'target' | 'source'>,
  workflows: WorkflowSummary[],
  validatedCategories: Set<string>,
  validatedAppNames?: Set<string>,
): boolean {
  if (flow.automationArea !== 'automatic_ingestion' || flow.target !== 'case_management') {
    return false;
  }
  const sourceToIngest: Record<string, 'email' | 'edr' | 'siem' | 'cases'> = {
    email: 'email', edr: 'edr', siem: 'siem', case_management: 'cases',
  };
  const required = sourceToIngest[flow.source];
  if (!required || required === 'cases') return false;

  // 1. Must have validated authentication for this specific category
  if (!validatedCategories.has(flow.source)) return false;

  // 2. Must find the Ingest Tickets workflow (excluding pure webhook workflows)
  const ingestWf = workflows.find((w: any) => {
    const name = (w?.name || '').toLowerCase().trim();
    if (name.endsWith('_webhook') || name === 'ingestion webhook') return false;
    const tags = ((w as any)?.tags || []).map((t: any) => String(t).toLowerCase());
    return name === 'ingest tickets' || name.includes('ingest tickets') || tags.includes('ingest tickets');
  });

  if (!ingestWf) return false;

  // 3. Workflow schedule must not be stopped / disabled
  if (
    Array.isArray(ingestWf.triggers) &&
    ingestWf.triggers.length > 0 &&
    ingestWf.triggers.every((t: any) => {
      const s = (t?.status || '').toLowerCase();
      return s === 'stopped' || s === 'disabled';
    })
  ) {
    return false;
  }

  // 4. Must have an app matching this specific category wired into the workflow
  const wfApps = extractWorkflowAppNames(ingestWf);
  for (const name of wfApps) {
    const cat = getIngestionCategory(name);
    if (cat === required || matchesCategory(name, required)) {
      if (!validatedAppNames || validatedAppNames.size === 0 || validatedAppNames.has(normalizeAppName(name))) {
        return true;
      }
    }
  }

  return false;
}

export function computeEnabledLabels(
  workflows: WorkflowSummary[],
  usecasesList: Usecase[] = DEFAULT_USECASES
): Set<string> {
  const set = new Set<string>();
  for (const wf of workflows) {
    const name = (wf?.name || '').toLowerCase();
    const tags = ((wf as any)?.tags || []).map((t: any) => String(t).toLowerCase());
    for (const uc of usecasesList) {
      if (!uc.automationLabel) continue;
      const lbl = uc.automationLabel.toLowerCase();
      const aliases = [lbl];
      if (lbl.includes('incident routing')) {
        aliases.push('incident routing', 'incident_routing', 'incident_routing_rules');
      }
      if (lbl.includes('schedules & phone') || lbl.includes('schedules_notifications') || lbl.includes('phone notification')) {
        aliases.push('schedules & phone notifications', 'schedules_&_phone_notifications', 'schedules_notifications', 'phone_notifications', 'assign & escalate', 'assign_&_escalate');
      }
      if (lbl.includes('threat feeds') || lbl.includes('ioc extraction')) {
        aliases.push('enable threat feeds', 'enable threat feeds_webhook', 'realtime ioc extraction', 'threat intel');
      }
      const isMatch = aliases.some(a => {
        const isWebhookWf = name.endsWith('_webhook') || name === 'ingestion webhook' || tags.some((t: string) => t.endsWith('_webhook'));
        if (!a.includes('webhook') && isWebhookWf) return false;
        return name === a || name.includes(a) || tags.includes(a) || tags.some((t: string) => t.includes(a));
      });
      if (isMatch) {
        set.add(uc.automationLabel);
      }
    }
  }
  return set;
}

export function isUsecaseFlowEnabled(
  flow: Usecase,
  workflows: WorkflowSummary[],
  enabledLabels: Set<string>,
  validatedCategories: Set<string>,
  validatedAppNames: Set<string> = new Set()
): boolean {
  if (flow.automationArea === 'automatic_ingestion' && flow.target === 'case_management') {
    return isIngestionUsecaseActive(flow, workflows, validatedCategories, validatedAppNames);
  }
  return !!flow.automationLabel && enabledLabels.has(flow.automationLabel);
}

// ============================================================================
// Inlined: usecases query
// ============================================================================
type DriftType = 'api_only' | 'local_only' | 'phase_mismatch' | 'description_added';
export interface UsecaseDrift {
  usecaseId: string;
  drifts: DriftType[];
  apiUsecase?: ApiUsecase;
  apiCategory?: string;
  localValue?: Usecase;
}

const ROUTE_ALIASES: Record<string, string[]> = {
  communication: ['email'],
  email: ['communication'],
};

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'usecase';

const getApiSource = (u: ApiUsecase) => normalizeCategory(u.source_id || u.type);
const getApiTarget = (u: ApiUsecase) =>
  normalizeCategory(u.target_id || u.last || u.destination || '');

const buildApiOnlyId = (u: ApiUsecase) =>
  `api_${getApiSource(u)}_${getApiTarget(u)}_${slugify(u.name)}`;

const LOCAL_ROUTE_MAP = (() => {
  const map = new Map<string, Usecase[]>();
  for (const uc of DEFAULT_USECASES) {
    const key = `${uc.source}→${uc.target}`;
    const existing = map.get(key) || [];
    existing.push(uc);
    map.set(key, existing);
  }
  return map;
})();

function getMatchingLocal(api: ApiUsecase, matched: Set<string>): Usecase | undefined {
  if ((api as any).id) {
    const byId = DEFAULT_USECASES.find((l) => !matched.has(l.id) && l.id === (api as any).id);
    if (byId) return byId;
  }
  const candidates = [getApiSource(api), ...(ROUTE_ALIASES[getApiSource(api)] || [])];
  const apiNameSlug = slugify(api.name || '');
  // Prefer a label-exact match first so multiple locals sharing the same
  // source→target route (e.g. case_management→case_management has Incident
  // Routing, Forward Tickets, Assign & Escalate, …) don't get assigned to
  // the wrong local just because they share a route.
  if (apiNameSlug) {
    for (const src of candidates) {
      const locals = LOCAL_ROUTE_MAP.get(`${src}→${getApiTarget(api)}`) || [];
      const byLabel = locals.find(
        (l) => !matched.has(l.id) && slugify(l.label) === apiNameSlug
      );
      if (byLabel) return byLabel;
    }
  }
  for (const src of candidates) {
    const locals = LOCAL_ROUTE_MAP.get(`${src}→${getApiTarget(api)}`) || [];
    // Skip locals that have a customAction (configuration-only usecases like
    // Incident Routing) — they should never be claimed by a name-mismatched
    // API entry on the same route, otherwise the wrong card inherits its id
    // and the configuration slot mounts on the wrong usecase.
    const unmatched = locals.find((l) => !matched.has(l.id) && !l.customAction);
    if (unmatched) return unmatched;
  }
  return undefined;
}

function mapApiToFrontend(cat: ApiUsecaseCategory, api: ApiUsecase, local?: Usecase): Usecase {
  const resolvedPhase = (cat.phase && (cat.phase === 'ingest' || cat.phase === 'correlation' || cat.phase === 'response'))
    ? cat.phase
    : apiCategoryToPhase(cat.name);
  return {
    id: local?.id || (api as any).id || buildApiOnlyId(api),
    source: getApiSource(api),
    target: getApiTarget(api),
    label: api.name || local?.label || 'Untitled usecase',
    description: api.description || local?.description || '',
    agenticDescription: local?.agenticDescription || api.agentic_description || api.description || '',
    phase: resolvedPhase,
    tags: api.tags || local?.tags || [],
    animated: typeof api.disabled === 'boolean' ? !api.disabled : (local ? local.animated : true),
    supportOnly: typeof (api as any).support_only === 'boolean' ? (api as any).support_only : local?.supportOnly,
    automationLabel: api.automation_label || local?.automationLabel,
    automationCategory: api.automation_category || local?.automationCategory,
    automationArea: (api.automation_area as Usecase['automationArea'] | undefined) || local?.automationArea,
    status: local?.status,
    manualVerification: typeof api.manual_verification === 'boolean' ? api.manual_verification : local?.manualVerification,
    priority: typeof api.priority === 'number' ? api.priority : local?.priority,
    video: api.video || local?.video,
    blogpost: api.blogpost || local?.blogpost,
    referenceImage: api.reference_image || local?.referenceImage,
    customAction: api.custom_action || local?.customAction,
  };
}

function buildBackendUsecases(cats: ApiUsecaseCategory[]) {
  const matched = new Set<string>();
  const usecases: Usecase[] = [];
  const drifts: UsecaseDrift[] = [];
  for (const cat of cats) {
    for (const api of cat.list || []) {
      if ((api as any).id === 'threat_intel_cloud_1') continue;
      if (api.name === 'IOC feeds' && (getApiTarget(api) === 'cloud' || (cat.phase && cat.phase !== 'ingest') || apiCategoryToPhase(cat.name) !== 'ingest')) continue;
      if (!getApiSource(api) || !getApiTarget(api)) continue;
      const local = getMatchingLocal(api, matched);
      if (local) matched.add(local.id);
      const mapped = mapApiToFrontend(cat, api, local);
      const driftTypes: DriftType[] = [];
      if (!local) driftTypes.push('api_only');
      else {
        if (mapped.phase !== local.phase) driftTypes.push('phase_mismatch');
        if (api.description && !local.description) driftTypes.push('description_added');
      }
      usecases.push(mapped);
      drifts.push({ usecaseId: mapped.id, drifts: driftTypes, apiUsecase: api, apiCategory: cat.name, ...(local ? { localValue: local } : {}) });
    }
  }
  for (const local of DEFAULT_USECASES) {
    if (matched.has(local.id)) continue;
    // Merge local-only usecases into the rendered list. Support users see a
    // "local only" drift badge so we can converge the catalogs over time.
    usecases.push(local);
    if (local.id !== 'threat_intel_ingest_1') {
      drifts.push({ usecaseId: local.id, drifts: ['local_only'], localValue: local });
    }
  }
  return { usecases, drifts };
}

let usecasesLiteCache: {
  usecases: Usecase[];
  apiCategories: ApiUsecaseCategory[];
  drifts: UsecaseDrift[];
} | null = null;
let usecasesLiteFetchPromise: Promise<any> | null = null;

export function useUsecasesLite() {
  const [data, setData] = useState<{
    usecases: Usecase[];
    apiCategories: ApiUsecaseCategory[];
    drifts: UsecaseDrift[];
  }>(usecasesLiteCache || { usecases: DEFAULT_USECASES, apiCategories: [], drifts: [] });

  const { apiUrl, authHeader } = useApi();
  useEffect(() => {
    if (usecasesLiteCache && usecasesLiteCache.apiCategories.length > 0) return;
    let cancelled = false;
    if (usecasesLiteFetchPromise) {
      usecasesLiteFetchPromise.then((built) => {
        if (!cancelled && built) setData(built);
      });
      return;
    }
    usecasesLiteFetchPromise = (async () => {
      try {
        const res = await fetch(apiUrl('/api/v1/workflows/usecases'), {
          credentials: 'include',
          headers: { ...authHeader() },
        });
        if (!res.ok) return null;
        const body = await res.json();
        const cats: ApiUsecaseCategory[] = Array.isArray(body) ? body : [];
        if (cats.length === 0) return null;
        const built = buildBackendUsecases(cats);
        const result = { usecases: built.usecases, apiCategories: cats, drifts: built.drifts };
        usecasesLiteCache = result;
        return result;
      } catch {
        return null;
      } finally {
        usecasesLiteFetchPromise = null;
      }
    })();

    usecasesLiteFetchPromise.then((built) => {
      if (!cancelled && built) setData(built);
    });

    return () => { cancelled = true; };
  }, [apiUrl, authHeader]);

  const driftMap = useMemo(() => {
    const m = new Map<string, UsecaseDrift>();
    for (const d of data.drifts) m.set(d.usecaseId, d);
    return m;
  }, [data.drifts]);

  return {
    usecases: data.usecases,
    apiLoaded: data.apiCategories.length > 0,
    getDrift: (id: string) => driftMap.get(id),
  };
}

// ============================================================================
// Helpers
// ============================================================================
const categoryLabel = (id: any): string => {
  if (!id) return '';
  if (typeof id === 'object') return id.label || id.name || id.id || '';
  return TOOL_CATEGORIES.find((c) => c.id === id)?.label || id;
};

const phaseIcon = (phase: FlowPhase) => {
  if (phase === 'ingest') return <Download size={14} />;
  if (phase === 'response') return <Zap size={14} />;
  return <Activity size={14} />;
};

const getToolCategoryMeta = (categoryId: any): { color: string; icon: React.ReactNode; label: string } | null => {
  const cid = typeof categoryId === 'object' ? categoryId?.id || categoryId?.label : categoryId;
  const cat = TOOL_CATEGORIES.find((c) => c.id === cid);
  if (!cat) return null;
  return { color: cat.color, icon: cat.icon, label: cat.label };
};

const IntegrationStatusLite = React.memo(function IntegrationStatusLite({
  filterApps,
  singleLine = false,
  isResolving = false,
  syntheticApps,
  workflowAppNames,
  onHover,
  onSelect,
  selectedId,
  usecaseEnabledNames,
  onUsecaseAppToggle,
  usecaseLabel,
  onAddApp,
  addAppLabel,
  highlightAddApp = false,
  extraTile,
  workflowsByAppName,


}: {
  filterApps?: string[];
  singleLine?: boolean;
  /** When true, show the loader instead of "all apps" / "no apps" — used while
   * the parent is still resolving which app names belong to this category. */
  isResolving?: boolean;
  /** Virtual entries that should always appear in the visible list when their
   * name is in `filterApps`, even if the API has never seen them as an
   * installed app. Used to surface the Shuffle platform itself under the
   * Cases category. */
  syntheticApps?: IntegrationItem[];
  /** Workflow-derived app names that must appear even without auth/catalog data. */
  workflowAppNames?: string[];
  /** Hover preview callback — called with the item on enter, null on leave. */
  onHover?: (item: IntegrationItem | null) => void;
  /** Click handler — receives the item that was clicked. */
  onSelect?: (item: IntegrationItem) => void;
  /** Item id currently pinned by the parent (renders a stronger outline). */
  selectedId?: string;
  /** Normalized app names currently active in the parent usecase workflow.
   *  When provided, the popover shows Enable/Disable for the current usecase. */
  usecaseEnabledNames?: Set<string>;
  /** Toggle handler invoked when the user enables/disables an app for this usecase. */
  onUsecaseAppToggle?: (appName: string, enabled: boolean) => Promise<void> | void;
  /** Short label for the parent usecase, shown in the popover (e.g. "Email reports"). */
  usecaseLabel?: string;
  /** When provided, renders a trailing "+" tile at the end of the list. */
  onAddApp?: () => void;
  /** Tooltip / aria label for the add button. */
  addAppLabel?: string;
  /** When true, pulse the "+" tile to draw attention (e.g. after user tried
   *  to enable a usecase but no source tool is connected yet). */
  highlightAddApp?: boolean;

  /** Optional trailing node rendered alongside the app tiles. Pass a plain
   *  ReactNode to render under Available, or `{ node, enabled }` to control
   *  whether it appears under Enabled or Available. */
  extraTile?: React.ReactNode | { node: React.ReactNode; enabled?: boolean };
  /** Optional map of normalized app name -> workflow names that reference it.
   *  When provided, the tile tooltip lists the workflow(s) using the app so
   *  users can trace where a weird-looking app came from. */
  workflowsByAppName?: Map<string, string[]>;
}) {
  const { apiUrl, authHeader } = useApi();
  const appDetail = useAppDetailOptional();
  const [integrations, setIntegrations] = useState<IntegrationItem[]>(() => getCachedIntegrations() || []);
  const [catalogIcons, setCatalogIcons] = useState<Record<string, string>>(() => getCachedCatalogIcons());
  const [isLoading, setIsLoading] = useState(() => !getCachedIntegrations());
  const [popoverFor, setPopoverFor] = useState<{ el: HTMLElement; item: IntegrationItem } | null>(null);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [showHiddenEnabled, setShowHiddenEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [authRes, appsRes] = await Promise.all([
          fetchAppsCached(apiUrl('/api/v1/apps/authentication'), {
            credentials: 'include',
            headers: { ...authHeader() },
          }),
          fetchAppsCached(apiUrl('/api/v1/apps'), {
            credentials: 'include',
            headers: { ...authHeader() },
          }).catch(() => null),
        ]);

        // Build a name -> icon lookup from the full apps catalog so we can
        // backfill icons for auth entries (e.g. Gmail) where the auth payload
        // doesn't carry large_image/image.
        const iconByName = new Map<string, string>();
        if (appsRes && appsRes.ok) {
          try {
            const appsData = await appsRes.json();
            const appsList = Array.isArray(appsData) ? appsData : (appsData?.data || []);
            for (const a of Array.isArray(appsList) ? appsList : []) {
              const n = a?.name ? String(a.name).toLowerCase() : '';
              const icon = a?.large_image || a?.image || '';
              if (n && icon && !iconByName.has(n)) iconByName.set(n, icon);
            }
          } catch { /* ignore */ }
        }
        if (!cancelled && iconByName.size) {
          const obj: Record<string, string> = {};
          iconByName.forEach((v, k) => {
            obj[k] = v;
            obj[normalizeAppName(k)] = v;
          });
          updateCachedCatalogIcons(obj);
          setCatalogIcons((prev) => ({ ...prev, ...obj }));
        }

        const items = new Map<string, IntegrationItem>();

        if (authRes.ok) {
          const authData = await authRes.json();
          const authList = Array.isArray(authData) ? authData : (authData?.data || []);
          for (const entry of Array.isArray(authList) ? authList : []) {
            const app = entry?.app;
            if (!app?.name) continue;
            const key = String(app.name).toLowerCase();
            const validated = entry?.validation?.valid === true;
            const active = entry?.active === true;
            const fallbackIcon = iconByName.get(key) || '';
            const existing = items.get(key);
            if (!existing) {
              items.set(key, {
                id: app.id || key,
                name: app.name,
                icon: app.large_image || app.image || fallbackIcon,
                validated,
                active,
              });
            } else {
              existing.validated = existing.validated || validated;
              existing.active = existing.active || active;
              if (!existing.icon) {
                existing.icon = app.large_image || app.image || fallbackIcon;
              }
            }
          }
        }

        const sorted = Array.from(items.values()).sort((a, b) => {
          if (a.validated !== b.validated) return a.validated ? -1 : 1;
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        if (!cancelled) {
          setCachedIntegrations(sorted);
          setIntegrations(sorted);
        }
      } catch {
        /* keep [] */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl, authHeader]);

  const workflowAppNamesKey = useMemo(
    () => (workflowAppNames || []).slice().sort().join(','),
    [workflowAppNames]
  );

  // For workflow-derived app names that the local catalog/auth list doesn't
  // know about (e.g. Wazuh referenced inside a Singul wrapper but not yet
  // activated), look the icon up in the public Algolia catalog so chips and
  // tiles still render a logo instead of a blank placeholder.
  useEffect(() => {
    const needed = (workflowAppNames || []).filter((name) => {
      const key = normalizeAppName(name);
      if (!key) return false;
      if (_algoliaIconCache.has(key)) return false;
      if (catalogIcons[key]) return false;
      if (integrations.some((i) => normalizeAppName(i.name) === key)) return false;
      return true;
    });
    if (!needed.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
        const res: any = await (client as any).search({
          requests: needed.map((name) => ({
            indexName: 'appsearch',
            query: name,
            hitsPerPage: 1,
          })),
        });
        if (cancelled) return;
        const next: Record<string, string> = {};
        (res?.results || []).forEach((r: any, idx: number) => {
          const hit = r?.hits?.[0];
          const icon = hit?.image_url || '';
          if (!icon) return;
          const requested = needed[idx];
          const k1 = normalizeAppName(requested);
          next[k1] = icon;
          _algoliaIconCache.set(k1, icon);
          if (hit?.name) {
            const k2 = normalizeAppName(hit.name);
            next[k2] = icon;
            _algoliaIconCache.set(k2, icon);
          }
        });
        if (Object.keys(next).length) {
          updateCachedCatalogIcons(next);
          setCatalogIcons((prev) => ({ ...prev, ...next }));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workflowAppNamesKey, integrations.length]);

  // Merge synthetic platform entries (e.g. "Shuffle Security") into the
  // installed-app list so they participate in filtering and ordering. Real
  // API data wins on the icon/state if both exist with the same name.
  const merged = useMemo(() => {
    const existing = new Set(integrations.map((i) => normalizeAppName(i.name)));
    const extras = (syntheticApps || []).filter((s) => !existing.has(normalizeAppName(s.name)));
    extras.forEach((s) => existing.add(normalizeAppName(s.name)));
    const workflowExtras = (workflowAppNames || []).reduce<IntegrationItem[]>((acc, name) => {
      const key = normalizeAppName(name);
      if (!key || existing.has(key)) return acc;
      existing.add(key);
      const icon = catalogIcons[key] || catalogIcons[name.toLowerCase()] || '';
      // Wired into a workflow but no authentication entry exists for it —
      // surface as "not configured" rather than faking a validated state.
      // The real validated/active flags come from the /apps/authentication
      // merge above when an auth actually exists for this app.
      acc.push({ id: `workflow-${key}`, name, icon, validated: false, active: false });
      return acc;
    }, []);
    return [...extras, ...workflowExtras, ...integrations];
  }, [integrations, syntheticApps, workflowAppNames, catalogIcons]);

  const visibleUnsorted = filterApps?.length
    ? merged.filter((item) => filterApps.some((name) => normalizeAppName(name) === normalizeAppName(item.name)))
    : merged;
  // Order: Enabled (validated) > Configured (active) > Available (in catalog) > Other (workflow-only/synthetic)
  const visibleRank = (i: IntegrationItem) => {
    if (i.validated) return 0;
    if (i.active) return 1;
    if (typeof i.id === 'string' && (i.id.startsWith('workflow-') || i.id.startsWith('synthetic-'))) return 3;
    return 2;
  };
  const visible = [...visibleUnsorted].sort((a, b) => {
    const r = visibleRank(a) - visibleRank(b);
    if (r !== 0) return r;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Show the loader both while we are fetching the API and while the parent
  // is still figuring out which app names belong to this category — this
  // prevents a flash of "all apps" before the filter narrows the list.
  if (isLoading || isResolving) {
    return <CircularProgress size={20} sx={{ color: 'hsl(var(--muted-foreground))' }} />;
  }

  if (visible.length === 0 && !onAddApp) {
    return (
      <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', px: 1, py: 0.75 }}>
        No apps selected
      </Typography>
    );
  }

  const renderIcon = (integration: IntegrationItem) => {
    // Self-contained styles — explicit hex colors so they render identically
    // in the standalone build (host CSS may not define --severity-* tokens),
    // and explicit borderRadius/objectFit on the image so host CSS resets
    // can't override them.
    // - validated  → green (#22c55e)
    // - active     → amber (#f59e0b)
    // - otherwise  → muted, slightly faded
    const GREEN = 'hsl(var(--severity-low))';
    const AMBER = 'hsl(var(--severity-medium))';
    const isShuffleSecurity = integration.id === 'shuffle-security';
    const effectiveValidated = integration.validated || isShuffleSecurity;
    const dotColor = effectiveValidated ? GREEN : integration.active ? AMBER : null;
    const borderColor = effectiveValidated
      ? 'hsl(var(--severity-low))'
      : integration.active
        ? 'hsl(var(--severity-medium))'
        : 'hsl(var(--border))';
    const bgColor = effectiveValidated
      ? 'hsl(var(--severity-low) / 0.12)'
      : integration.active
        ? 'hsl(var(--severity-medium) / 0.12)'
        : 'hsl(var(--card))';
    const isReady = effectiveValidated || integration.active;

    const cleanIntegrationName = (integration.name || '')
      .replace(/[_\-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

    return (
      <Tooltip
        key={integration.id}
        title={isShuffleSecurity
          ? `${cleanIntegrationName} (always available)`
          : `${cleanIntegrationName}${integration.validated ? ' (validated)' : integration.active ? ' (configured)' : ' (not configured)'}${(() => {
            const wfs = workflowsByAppName?.get(normalizeAppName(integration.name));
            if (!wfs || wfs.length === 0) return '';
            const shown = wfs.slice(0, 3).map(w => w.replace(/[_\-]+/g, ' ')).join(', ');
            const more = wfs.length > 3 ? ` (+${wfs.length - 3} more)` : '';
            return ` — used in: ${shown}${more}`;
          })()}`}
        placement="top"
        arrow
      >
        <Box
          onMouseEnter={() => onHover?.(integration)}
          onMouseLeave={() => onHover?.(null)}
          onClick={(e) => {
            setPopoverFor({ el: e.currentTarget as HTMLElement, item: integration });
            onSelect?.(integration);
          }}
          sx={{
            position: 'relative',
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: '50% !important',
            border: `${selectedId === integration.id || effectiveValidated ? '2px' : '1px'} solid ${selectedId === integration.id ? 'hsl(var(--primary))' : borderColor}`,
            // overflow visible so the status dot can sit outside the circle
            overflow: 'visible',
            bgcolor: bgColor,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isReady ? 1 : 0.45,
            filter: isReady ? 'none' : 'grayscale(1)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, opacity 0.15s ease, filter 0.15s ease',
            '&:hover': {
              transform: 'scale(1.1)',
              opacity: 1,
              filter: 'none',
              zIndex: 2,
            },
          }}
        >
          {/* Image clip layer: fills the circle entirely, host CSS can't override */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50% !important',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
            }}
          >
            {integration.icon ? (
              <Box
                component="img"
                src={integration.icon}
                alt={integration.name}
                loading="lazy"
                sx={{
                  display: 'block',
                  width: '100% !important',
                  height: '100% !important',
                  maxWidth: 'none !important',
                  maxHeight: 'none !important',
                  objectFit: 'cover',
                  borderRadius: '50% !important',
                }}
              />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  bgcolor: 'hsl(var(--muted))',
                }}
              >
                {integration.name.slice(0, 1).toUpperCase()}
              </Box>
            )}
          </Box>
          {/* Status dot — sits OUTSIDE the circle, high z-index so nothing hides it */}
          {dotColor && (
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 10,
                height: 10,
                borderRadius: '50% !important',
                backgroundColor: `${dotColor} !important`,
                boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 4px ${dotColor}66`,
                zIndex: 3,
                pointerEvents: 'none',
              }}
            />
          )}
        </Box>
      </Tooltip>
    );
  };

  const renderPopover = () => {
    const item = popoverFor?.item;
    const itemKey = item ? item.name.toLowerCase().trim().replace(/[\s_\-]+/g, '_') : '';
    const inUsecase = !!item && !!usecaseEnabledNames && usecaseEnabledNames.has(itemKey);
    const showUsecaseToggle = !!item && !!onUsecaseAppToggle;
    const isToggling = !!item && togglingName === item.name;

    const statusLabel = !item
      ? ''
      : showUsecaseToggle
        ? (inUsecase ? 'In use' : 'Not in use')
        : item.validated
          ? 'Validated'
          : item.active
            ? 'Configured'
            : 'Not configured';
    const statusColor = !item
      ? 'hsl(var(--muted-foreground))'
      : showUsecaseToggle
        ? (inUsecase ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))')
        : item.validated
          ? 'hsl(var(--severity-low))'
          : item.active
            ? 'hsl(var(--severity-medium))'
            : 'hsl(var(--muted-foreground))';

    const handleUsecaseToggle = async () => {
      if (!item || !onUsecaseAppToggle) return;
      const willBeEnabled = !inUsecase;
      setTogglingName(item.name);
      try {
        await onUsecaseAppToggle(item.name, willBeEnabled);
        setPopoverFor(null);
      } finally {
        setTogglingName(null);
      }
    };

    return (
      <Popover
        open={Boolean(popoverFor)}
        anchorEl={popoverFor?.el || null}
        onClose={() => setPopoverFor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ zIndex: 10040 }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              p: 1.5,
              minWidth: 220,
            },
          },
        }}
      >
        {item && item.id === 'shuffle-security' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', fontSize: '0.8rem' }}>
                Shuffle Security
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', mb: 1 }}>
              The Shuffle Security platform itself — incidents land here.
            </Typography>
            <Button
              size="small"
              startIcon={<ExternalLink size={14} />}
              onClick={() => {
                setPopoverFor(null);
                if (typeof window !== 'undefined') window.location.href = '/incidents';
              }}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontSize: '0.75rem',
                color: 'hsl(var(--foreground))',
                px: 1,
                py: 0.5,
                borderRadius: 1,
                width: '100%',
                '&:hover': { bgcolor: 'hsl(var(--muted))' },
              }}
            >
              Open Incidents
            </Button>
          </>
        )}
        {item && item.id !== 'shuffle-security' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', textTransform: 'capitalize', fontSize: '0.8rem' }}>
                {item.name.replace(/_/g, ' ')}
              </Typography>
              <Chip
                label={statusLabel}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  bgcolor: 'hsl(var(--muted))',
                  color: statusColor,
                  fontWeight: 500,
                }}
              />
            </Box>
            {showUsecaseToggle && usecaseLabel && (
              <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', mb: 1 }}>
                {inUsecase
                  ? `Active in ${usecaseLabel}`
                  : `Not part of ${usecaseLabel}`}
              </Typography>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
              {showUsecaseToggle && (
                <Button
                  size="small"
                  disabled={isToggling || (!inUsecase && !item.validated && !item.active)}
                  startIcon={
                    isToggling
                      ? <CircularProgress size={12} sx={{ color: 'inherit' }} />
                      : (inUsecase ? <PowerOff size={14} /> : <Power size={14} />)
                  }
                  onClick={handleUsecaseToggle}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    color: inUsecase ? 'hsl(var(--destructive))' : 'hsl(var(--severity-low))',
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: inUsecase ? 'hsla(var(--destructive) / 0.1)' : 'hsla(var(--severity-low) / 0.1)',
                    },
                    '&.Mui-disabled': { color: 'hsl(var(--muted-foreground))', opacity: 0.5 },
                  }}
                >
                  {isToggling
                    ? (inUsecase ? 'Disabling…' : 'Enabling…')
                    : (inUsecase
                      ? `Disable for ${usecaseLabel || 'this usecase'}`
                      : (!item.validated && !item.active
                        ? 'Authenticate first to enable'
                        : `Enable for ${usecaseLabel || 'this usecase'}`))}
                </Button>
              )}
              <Button
                size="small"
                startIcon={<ExternalLink size={14} />}
                onClick={() => {
                  const name = item.name;
                  setPopoverFor(null);
                  if (appDetail && name) appDetail.openApp(name);
                }}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  color: 'hsl(var(--foreground))',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'hsl(var(--muted))' },
                }}
              >
                {showUsecaseToggle
                  ? (item.validated
                    ? 'Open app'
                    : item.active
                      ? 'Validate Auth'
                      : 'Authenticate app')
                  : (item.validated
                    ? 'Manage authentication'
                    : item.active
                      ? 'Validate Auth'
                      : 'Authenticate app')}
              </Button>
            </Box>
          </>
        )}
      </Popover>
    );
  };

  const renderAddTile = () => {
    if (!onAddApp) return null;
    return (
      <Tooltip key="__add" title={addAppLabel || 'Add tool'} placement="top" arrow open={highlightAddApp || undefined}>
        <Box
          onClick={() => onAddApp()}
          role="button"
          aria-label={addAppLabel || 'Add tool'}
          sx={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: '50% !important',
            border: highlightAddApp
              ? '1px dashed hsl(var(--primary))'
              : '1px dashed hsla(var(--muted-foreground) / 0.5)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: highlightAddApp ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            animation: highlightAddApp ? 'shuffle-add-pulse 1.4s ease-out infinite' : 'none',
            '@keyframes shuffle-add-pulse': {
              '0%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.55)' },
              '70%': { boxShadow: '0 0 0 10px hsl(var(--primary) / 0)' },
              '100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0)' },
            },
            '&:hover': {
              borderColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary))',
              bgcolor: 'hsla(var(--primary) / 0.08)',
              transform: 'scale(1.1)',
            },
          }}
        >
          <Plus size={14} />
        </Box>
      </Tooltip>
    );
  };


  // When the parent passes per-usecase context, split into Enabled vs Available
  // so it's obvious which apps are actually wired into the workflow and which
  // are just authenticated and ready to add.
  const useGroups = !!usecaseEnabledNames && !!onUsecaseAppToggle;
  const normalize = (n: string) => n.toLowerCase().trim().replace(/[\s_\-]+/g, '_');
  // Enabled tools the category filter would otherwise hide. The workflow is the
  // truth: if an app is wired into this usecase but lives outside the category
  // filter, surface it via a "show hidden" affordance instead of silently
  // dropping it.
  const hiddenEnabledList = useGroups
    ? merged.filter((i) => {
      const k = normalize(i.name);
      if (!usecaseEnabledNames!.has(k)) return false;
      return !visible.some((v) => normalize(v.name) === k);
    })
    : [];
  const enabledListBase = useGroups
    ? visible.filter((i) => usecaseEnabledNames!.has(normalize(i.name)))
    : [];
  const enabledList = useGroups && showHiddenEnabled
    ? [...enabledListBase, ...hiddenEnabledList]
    : enabledListBase;
  const availableList = useGroups
    ? visible.filter((i) => !usecaseEnabledNames!.has(normalize(i.name)))
    : visible;

  const GroupLabel = ({ children }: { children: React.ReactNode }) => (
    <Typography
      sx={{
        fontSize: '0.6rem',
        fontWeight: 700,
        color: 'hsl(var(--muted-foreground))',
        letterSpacing: '0.06em',
        mb: 0.5,
      }}
    >
      {children}
    </Typography>
  );

  if (singleLine) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: 1,
          px: 0.5,
          // extra vertical padding so the status dot (bottom: -2) isn't clipped
          py: '6px',
          overflowX: 'auto',
          overflowY: 'visible',
          minWidth: 0,
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'hsl(var(--border))',
            borderRadius: 3,
          },
        }}
      >
        {visible.map(renderIcon)}
        {renderAddTile()}
        {renderPopover()}
      </Box>
    );
  }

  // Allow extraTile to be either a raw node (always rendered under Available)
  // or `{ node, enabled }` so it can be placed under Enabled when active.
  const extraTileObj = (extraTile && typeof extraTile === 'object' && 'node' in (extraTile as any))
    ? (extraTile as unknown as { node: React.ReactNode; enabled?: boolean })
    : null;
  const extraNode = extraTileObj ? extraTileObj.node : (extraTile as React.ReactNode);
  const extraEnabled = !!extraTileObj?.enabled;
  const extraInEnabled = extraTileObj && extraEnabled ? extraNode : null;
  const extraInAvailable = extraTileObj ? (extraEnabled ? null : extraNode) : extraNode;
  const extraCount = extraNode ? 1 : 0;

  if (useGroups) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: 0.5, py: 0.5 }}>
        {(enabledList.length > 0 || extraInEnabled || hiddenEnabledList.length > 0) && (
          <Box>
            <GroupLabel>
              Enabled Tools · {enabledList.length + (extraInEnabled ? 1 : 0)}
            </GroupLabel>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {extraInEnabled}
              {enabledList.map(renderIcon)}
              {hiddenEnabledList.length > 0 && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowHiddenEnabled((s) => !s)}
                  sx={{
                    height: 36,
                    minWidth: 0,
                    px: 1.25,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    color: 'hsl(var(--muted-foreground))',
                    border: '1px dashed hsl(var(--border))',
                    borderRadius: 1,
                    '&:hover': { color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--foreground) / 0.4)' },
                  }}
                >
                  {showHiddenEnabled ? 'Hide extras' : `+${hiddenEnabledList.length} more`}
                </Button>
              )}
            </Box>
          </Box>
        )}
        {(availableList.length + (extraInAvailable ? 1 : 0) > 0 || !!onAddApp) && (
          <Box>
            <GroupLabel>
              Available Tools{(availableList.length + (extraInAvailable ? 1 : 0)) > 0 ? ` · ${availableList.length + (extraInAvailable ? 1 : 0)}` : ''}
            </GroupLabel>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {extraInAvailable}
              {availableList.map(renderIcon)}
              {renderAddTile()}
            </Box>
          </Box>
        )}
        {renderPopover()}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 0.5, py: 0.5, alignItems: 'center' }}>
      {visible.map(renderIcon)}
      {renderAddTile()}
      {extraNode}
      {renderPopover()}
    </Box>
  );
});

// IDs of usecases whose backend automation is fully wired. Anything not in
// this list renders a "Coming soon" affordance instead of a live Enable
// button — both in the list cards and inside the detail page, so the two
// stay in sync.
const ACTIVE_USECASE_IDS = [
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

// Small wrapper so UsecaseDetailContent can render an Outcome block without
// threading the outcomes map through every call site.
function FlowOutcomeBlock({ flow, sourceCategoryLabel }: { flow: Usecase; sourceCategoryLabel?: string }) {
  const { getOutcome, isLoading } = useUsecaseOutcomes([flow]);
  return <UsecaseOutcomeSection outcome={getOutcome(flow.id)} sourceCategoryLabel={sourceCategoryLabel} sourceId={flow.source} loading={isLoading} />;
}

// Ingestion Webhook outcome — for SIEM/EDR alert flows we surface the actual
// number of webhook executions (last 30 days) pulled from
// /api/v2/workflows/{id}/executions `timeline`, summed into a single total.
// This is the most honest "what did this automation produce?" number we can
// show today because every alert that arrives through the webhook triggers
// one execution.
// Same as FlowOutcomeBlock, but injects an additional "Webhook" entry into
// the breakdown showing the number of executions (last 30 days) of the
// "Ingestion Webhook" workflow, alongside the per-tool counts (Elasticsearch,
// etc.) that the standard outcome already produces.
function WebhookExecutionsOutcomeBlock({
  flow,
  workflows,
  sourceCategoryLabel,
}: {
  flow: Usecase;
  workflows: WorkflowSummary[];
  sourceCategoryLabel?: string;
}) {
  const { getOutcome, isLoading } = useUsecaseOutcomes([flow]);
  const appDetail = useAppDetailOptional();
  const webhookWorkflow = useMemo(
    () => workflows.find((w) => w?.name === 'Ingestion Webhook'),
    [workflows],
  );
  const { stats, isLoading: webhookLoading } = useWorkflowExecutionStats(
    webhookWorkflow?.id || null,
  );

  const base = getOutcome(flow.id);
  const outcome = useMemo(() => {
    if (!base) return base;
    const enrichedBreakdown = (base.breakdown || []).map((entry) => ({
      ...entry,
      onClick: appDetail ? () => appDetail.openApp(entry.label) : entry.onClick,
    })) as typeof base.breakdown;
    const next = { ...base, breakdown: enrichedBreakdown };
    if (webhookWorkflow && stats.total > 0) {
      next.breakdown = [
        {
          key: 'ingestion_webhook',
          label: 'Webhook',
          value: stats.total,
          iconNode: <Webhook size={14} strokeWidth={2} />,
          href: getShuffleCoreWorkflowUrl(webhookWorkflow.id),
          external: true,
        },
        ...next.breakdown,
      ];
      next.primary = {
        ...next.primary,
        value: (next.primary?.value || 0) + stats.total,
      };
      next.isEmpty = false;
    }
    return next;
  }, [base, webhookWorkflow, stats.total, appDetail]);

  return (
    <UsecaseOutcomeSection
      outcome={outcome}
      sourceCategoryLabel={sourceCategoryLabel}
      sourceId={flow.source}
      loading={isLoading || webhookLoading}
    />
  );
}

// AI Incident Handling block — shows the live "Run AI Agent" prompts
// configured on the shuffle-security_incidents category, using the same
// AiAgentPromptsEditor component as the /incidents Automations dialog so
// both surfaces stay in sync. Read-only here; "Configure" jumps to the
// dialog on /incidents.
function AiIncidentHandlingPromptsBlock() {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [apps, setApps] = useState<string[][]>([]);
  const [appMeta, setAppMeta] = useState<Record<string, { name: string; image: string }>>({});

  const FG = 'hsl(var(--foreground))';
  const MUTED = 'hsl(var(--muted-foreground))';
  const BORDER = 'hsl(var(--border))';
  const CARD = 'hsl(var(--card))';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const info = localStorage.getItem('shuffle_user_info');
        const orgId = info ? JSON.parse(info)?.active_org?.id : null;
        if (!orgId) { if (!cancelled) setLoading(false); return; }
        const data = await fetchCategoryAutomationsCached(
          getApiUrl(`/api/v1/orgs/${orgId}/list_cache?category=shuffle-security_incidents&top=1`),
          { credentials: 'include', headers: { ...getAuthHeader(orgId) } },
        );
        if (!data) { if (!cancelled) setLoading(false); return; }
        const automations: any[] = data?.category_config?.automations || [];
        const ai = automations.find(
          (a) => a?.enabled && (a?.type === 'ai_agent' || a?.name === 'Run AI Agent'),
        );
        if (!ai) {
          if (!cancelled) { setEnabled(false); setLoading(false); }
          return;
        }
        const opts: { key: string; value: string }[] = Array.isArray(ai.options) ? ai.options : [];
        const actionOpts = opts
          .filter((o) => o.key === 'action' || /^action-\d+$/.test(o.key))
          .sort((a, b) => {
            const na = a.key === 'action' ? 1 : parseInt(a.key.replace('action-', ''), 10);
            const nb = b.key === 'action' ? 1 : parseInt(b.key.replace('action-', ''), 10);
            return na - nb;
          });
        const promptList = actionOpts.map((o) => o.value || '');
        const skillApps = resolveSkillAllowedApps('incident-handler');
        const appList = promptList.map((_, i) => {
          const k = i === 0 ? 'apps' : `apps-${i + 1}`;
          const o = opts.find((x) => x.key === k);
          const raw = o?.value ? o.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
          return Array.from(new Set([...skillApps, ...raw]));
        });
        if (cancelled) return;
        setEnabled(true);
        setPrompts(promptList);
        setApps(appList);
      } catch {
        /* keep previous state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve app metadata via Algolia for the IDs referenced by allowed apps.
  useEffect(() => {
    const ids = new Set<string>();
    apps.forEach((arr) => arr.forEach((id) => { if (id && /^[a-f0-9]{16,}$/i.test(id) && !appMeta[id]) ids.add(id); }));
    if (ids.size === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
        const res: any = await (client as any).getObjects({
          requests: [...ids].map((objectID) => ({ indexName: 'appsearch', objectID })),
        });
        if (cancelled) return;
        const next: Record<string, { name: string; image: string }> = {};
        (res?.results || []).forEach((hit: any) => {
          if (hit?.objectID) next[hit.objectID] = { name: hit.name || hit.objectID, image: hit.image_url || '' };
        });
        if (Object.keys(next).length) setAppMeta((prev) => ({ ...prev, ...next }));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [apps]);

  const resolveAppMeta = (key: string) => appMeta[key] || { name: key, image: '' };

  if (loading) {
    return (
      <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${BORDER}`, bgcolor: CARD, mb: 3 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: 0.6, mb: 1 }}>
          AI Agent prompts
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <CircularProgress size={14} thickness={5} sx={{ color: primaryColor }} />
          <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>Loading prompts…</Typography>
        </Box>
      </Box>
    );
  }

  if (!enabled) {
    return (
      <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${BORDER}`, bgcolor: CARD, mb: 3 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: 0.6, mb: 1 }}>
          AI Agent prompts
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: MUTED, mb: 1.5 }}>
          "Run AI Agent" is not enabled on the Incidents category. Enable it from the Automations dialog to hand off new incidents to the agent.
        </Typography>
        <Button
          component={Link}
          to="/incidents"
          size="small"
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          Open Incidents automations
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${BORDER}`, bgcolor: CARD, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: 0.6 }}>
          AI Agent prompts · {prompts.length} active
        </Typography>
        <Button
          component={Link}
          to="/incidents"
          size="small"
          sx={{ textTransform: 'none', fontSize: '0.75rem', color: primaryColor }}
        >
          Configure
        </Button>
      </Box>
      <AiAgentPromptsEditor
        prompts={prompts}
        apps={apps}
        skillLabel="Incident Handler"
        isBuiltInApp={(key: string) => isBuiltInSkillApp('incident-handler', key)}
        readOnly
        resolveAppMeta={resolveAppMeta}
      />
    </Box>
  );
}


// Enrichments usecase — paginates through the incidents datastore via cursor
// and counts incidents whose payload contains an "enrichments" key (top-level
// or nested). The /incidents page uses the same getDatastoreByCategory +
// cursor loop, so the number here matches what the user would see if they
// scrolled the full list themselves.
function EnrichmentsOutcomeBlock({ flow }: { flow: Usecase }) {
  const [loading, setLoading] = useState(true);
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [totalScanned, setTotalScanned] = useState(0);
  const [perTool, setPerTool] = useState<{ key: string; label: string; value: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const hasEnrichmentKey = (value: any): boolean => {
      if (!value || typeof value !== 'object') return false;
      const stack: any[] = [value];
      let depth = 0;
      while (stack.length && depth < 2000) {
        const node = stack.pop();
        depth += 1;
        if (!node || typeof node !== 'object') continue;
        for (const k of Object.keys(node)) {
          if (/enrichment/i.test(k)) {
            const v = (node as any)[k];
            if (Array.isArray(v)) { if (v.length > 0) return true; }
            else if (v && typeof v === 'object') { if (Object.keys(v).length > 0) return true; }
            else if (v != null && v !== '' && v !== false) return true;
          }
          const child = (node as any)[k];
          if (child && typeof child === 'object') stack.push(child);
        }
      }
      return false;
    };
    const extractProduct = (value: any): string | undefined => {
      const p = value?.metadata?.product?.name
        || value?.metadata?.product?.vendor_name
        || value?.finding_info?.product?.name
        || value?.product?.name
        || value?.source
        || value?.src_tool;
      return typeof p === 'string' && p.trim() ? p.trim() : undefined;
    };

    (async () => {
      setLoading(true);
      let cursor: string | undefined;
      let scanned = 0;
      let enriched = 0;
      const counts = new Map<string, number>();
      // Hard cap pages so we never hammer the API; 30 × 50 = 1,500 incidents
      // is plenty for an outcome metric and matches what /incidents pulls.
      for (let page = 0; page < 30; page += 1) {
        const res = await getDatastoreByCategory('shuffle-security_incidents', cursor);
        if (cancelled) return;
        const items = res.data || [];
        for (const item of items) {
          scanned += 1;
          let parsed: any = null;
          try { parsed = typeof item.value === 'string' ? JSON.parse(item.value) : item.value; } catch { parsed = null; }
          if (hasEnrichmentKey(parsed)) {
            enriched += 1;
            const product = extractProduct(parsed) || 'unknown';
            counts.set(product, (counts.get(product) || 0) + 1);
          }
        }
        if (!res.cursor || items.length === 0) break;
        cursor = res.cursor;
      }
      if (cancelled) return;
      const breakdown = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => ({ key: k, label: k, value: v }));
      setEnrichedCount(enriched);
      setTotalScanned(scanned);
      setPerTool(breakdown);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const outcome = {
    kind: 'enrichments_run' as const,
    primary: { value: enrichedCount, label: 'incidents with enrichments' },
    breakdown: perTool,
    extraMetrics: [{ label: `of ${totalScanned} scanned`, value: enrichedCount }],
    windowDays: 30 as const,
    isEmpty: !loading && enrichedCount === 0,
    emptyReason: enrichedCount === 0 ? (totalScanned === 0 ? 'no_data_yet' as const : 'no_data_yet' as const) : undefined,
  };

  return <UsecaseOutcomeSection outcome={outcome} loading={loading} sourceId={flow.source} />;
}

// Notifications usecase — fetches open/read counts from the API and renders
// them as a synthetic outcome inside the standard Outcome block.
function NotificationsOutcomeBlock() {
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [readCount, setReadCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Use shuffleFetch so the request includes the active Org-Id header —
    // otherwise notifications from the user's currently-selected sub-org are
    // not returned and the block shows "No data yet" even when the org has
    // hundreds of notifications.
    const fetchOne = async (status: 'open' | 'read'): Promise<number> => {
      const res = await shuffleFetch(
        getApiUrl(`/api/v1/notifications?status=${status}`),
      );
      if (!res.ok) return 0;
      const data = await res.json();
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      return list.length;
    };
    (async () => {
      setLoading(true);
      try {
        const [o, r] = await Promise.all([fetchOne('open'), fetchOne('read')]);
        if (cancelled) return;
        setOpenCount(o);
        setReadCount(r);
      } catch {
        if (!cancelled) {
          setOpenCount(0);
          setReadCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const total = (openCount ?? 0) + (readCount ?? 0);
  const outcome = {
    kind: 'comms_sent' as const,
    primary: { value: total, label: 'notifications created' },
    breakdown: [],
    extraMetrics: [
      { label: 'open', value: openCount ?? 0 },
      { label: 'read', value: readCount ?? 0 },
    ],
    windowDays: 30 as const,
    isEmpty: !loading && total === 0,
    emptyReason: 'no_data_yet' as const,
  };

  return <UsecaseOutcomeSection outcome={outcome} loading={loading} />;
}


// IOC feeds usecase — discovers `ioc_<name>` datastore categories by
// reading the IOC type config, then renders a total + per-type breakdown
// inside the standard Outcome block.
function IocFeedsOutcomeBlock() {
  const { apiUrl, authHeader } = useApi();
  const [entries, setEntries] = useState<{ name: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Derive baseUrl from apiUrl helper so we share the exact same
        // fetch logic with the dashboard's "IOCs Tracked" KPI tile.
        const baseUrl = apiUrl('');
        const totals = await fetchIocEntries({ baseUrl, authHeader });
        if (!cancelled) {
          setEntries(totals.filter((e) => e.total > 0).sort((a, b) => b.total - a.total));
        }
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl, authHeader]);

  const total = sumIocEntries(entries);
  const outcome = {
    kind: 'iocs_managed' as const,
    primary: { value: total, label: 'indicators tracked' },
    breakdown: entries.slice(0, 8).map((e) => ({
      key: e.name,
      label: e.name.replace(/_/g, ' '),
      value: e.total,
    })),
    windowDays: 30 as const,
    isEmpty: !loading && total === 0,
    emptyReason: 'no_data_yet' as const,
  };

  const iocCategoryByKey = Object.fromEntries(entries.map((e) => [e.name, `ioc_${e.name}`]));
  return (
    <UsecaseOutcomeSection
      outcome={outcome}
      loading={loading}
      iocCategoryByKey={iocCategoryByKey}
      nextActionHref="/incidents/threat-feeds"
      nextActionLabel="Manage Threat Feeds"
    />
  );
}



// Assign & Escalate usecase — graphs executions of the matched workflow over
// the last ~30 days using /api/v2/workflows/{id}/executions `timeline` field.
function AssignEscalateOutcomeBlock({ flow, workflows }: { flow: Usecase; workflows: WorkflowSummary[] }) {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const { apiUrl, authHeader } = useApi();
  const [timeline, setTimeline] = useState<{ key: string; data: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  const matchedWorkflowId = useMemo(() => {
    const matched = findWorkflowsForUsecase(flow, workflows);
    return matched.find((w) => !!w.id)?.id || null;
  }, [flow, workflows]);

  useEffect(() => {
    let cancelled = false;
    if (!matchedWorkflowId) {
      setTimeline([]);
      setLoading(false);
      return () => { cancelled = true; };
    }
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          apiUrl(`/api/v2/workflows/${matchedWorkflowId}/executions`),
          { credentials: 'include', headers: { ...authHeader() } },
        );
        if (!res.ok) { if (!cancelled) setTimeline([]); return; }
        const data = await res.json();
        const tl: any[] = Array.isArray(data?.timeline) ? data.timeline : [];
        if (!cancelled) {
          setTimeline(tl.map((p) => ({
            key: String(p?.key ?? ''),
            data: typeof p?.data === 'number' ? p.data : 0,
          })));
        }
      } catch {
        if (!cancelled) setTimeline([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl, authHeader, matchedWorkflowId]);

  const FG = 'hsl(var(--foreground))';
  const MUTED = 'hsl(var(--muted-foreground))';
  const BORDER = 'hsl(var(--border))';
  const CARD = 'hsl(var(--card))';

  const points = timeline || [];
  const total = points.reduce((s, p) => s + p.data, 0);
  const max = Math.max(1, ...points.map((p) => p.data));
  const windowDays = points.length || 30;

  if (loading) {
    return (
      <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${BORDER}`, bgcolor: CARD, mb: 3 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: 0.6, mb: 1 }}>
          Outcome · last 30 days
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <CircularProgress size={14} thickness={5} sx={{ color: primaryColor }} />
          <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>
            Loading Assign &amp; Escalate workflow executions from the last 30 days…
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!matchedWorkflowId) {
    return (
      <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${BORDER}`, bgcolor: CARD, mb: 3 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: 0.6, mb: 1 }}>
          Outcome · last 30 days
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>
          No data yet — automation not enabled
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${BORDER}`, bgcolor: CARD, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: 0.6 }}>
          Outcome · last {windowDays} days
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: primaryColor, lineHeight: 1 }}>
          {total.toLocaleString()}
        </Typography>
        <Typography sx={{ fontSize: '0.9rem', color: FG }}>
          workflow executions
        </Typography>
      </Box>
      {points.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 80 }}>
            {points.map((p, i) => {
              const h = p.data > 0 ? Math.max(2, (p.data / max) * 100) : 2;
              return (
                <Tooltip key={`${p.key}-${i}`} title={`${p.key}: ${p.data}`} placement="top" arrow>
                  <Box
                    sx={{
                      flex: 1,
                      height: `${h}%`,
                      minWidth: 4,
                      borderRadius: '2px 2px 0 0',
                      bgcolor: p.data > 0 ? primaryColor : BORDER,
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: p.data > 0 ? primaryColor : MUTED },
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
            <Typography sx={{ fontSize: '0.68rem', color: MUTED }}>{points[0]?.key}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: MUTED }}>{points[points.length - 1]?.key}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}




function UsecaseDetailContent({
  flowId,
  hideBackNav = false,
  hidePrevNext = false,
  showConnectionPath = false,
  useAlluvialDiagram = false,
  onNavigateUsecase,
  usecases,
  isEnabled = false,
  canToggle = false,
  isAuthenticated = true,
  hasValidatedSource = true,
  onToggled,
  workflows = [],
  autoEnable = false,
  onAutoEnableConsumed,
  showImage = false,
}: {
  flowId: string | undefined;
  hideBackNav?: boolean;
  hidePrevNext?: boolean;
  showConnectionPath?: boolean;
  useAlluvialDiagram?: boolean;
  onNavigateUsecase?: (flowId: string) => void;
  usecases: Usecase[];
  /** Whether this automation currently has a running workflow */
  isEnabled?: boolean;
  /** Whether the Enable/Disable button should be shown (auth + automationLabel) */
  canToggle?: boolean;
  /** Whether the viewer is logged in — drives the guest CTA banner */
  isAuthenticated?: boolean;
  /** Whether the user has at least one validated source-tool feeding this flow's source category */
  hasValidatedSource?: boolean;
  /** Called after successful generation so the parent can trust the requested workflow state */
  onToggled?: (label: string, enabled: boolean) => void;
  /** Org workflows from /api/v1/workflows — used to render the "Linked Workflows" section */
  workflows?: WorkflowSummary[];
  /** When true and this flow is not yet enabled, automatically trigger Enable
   *  on mount. Used by the list view so clicking Enable on a card opens the
   *  detail drawer AND fires the enable action, letting the user watch the
   *  workflow appear in realtime. */
  autoEnable?: boolean;
  /** Called once after autoEnable has been honored so the parent can clear its flag. */
  onAutoEnableConsumed?: () => void;
  /** Support-only: render the usecase's reference image at the top of the detail view. */
  showImage?: boolean;
}) {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const navigate = useNavigate();
  const { apiUrl, authHeader } = useApi();
  const { renderEndpointSlot, renderUsecaseDetailSlot, renderUsecaseActionModal } = useUsecasesConfig();
  // Tracks whether a `customAction.modal` dialog is open for this flow.
  const [actionModalOpen, setActionModalOpen] = useState(false);
  // Same handle used by the default Source/Destination tile popover so the
  // alluvial bubble-click reuses the AppDetailDrawer instead of its own
  // mini Visit/Enable Sync popover.
  const appDetail = useAppDetailOptional();
  const flow = usecases.find((item) => item.id === flowId);
  const [categoryAppNames, setCategoryAppNames] = useState<Record<string, string[]>>(() => getCachedCategoryAppNames() || {});
  // Apps with a *validated* authentication, grouped by category. Powers the
  // "In this usecase" row inside the Add-Tool drawer so users immediately see
  // what they have already connected (e.g. Wazuh under SIEM).
  const [validatedAppsByCategory, setValidatedAppsByCategory] = useState<Record<string, Array<{ name: string; icon: string }>>>(() => getCachedValidatedAppsByCategory() || {});
  // Tracks whether the apps→category resolution has completed at least once.
  // While false, the popup's per-endpoint tools section shows a loader so the
  // user does not see a flash of "all apps" or "No apps selected" before the
  // filtered list narrows down.
  const [categoryAppsResolved, setCategoryAppsResolved] = useState(() => !!getCachedCategoryAppNames());
  const [toggling, setToggling] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  // Only surface the "what to fix" inline hint AFTER the user has actually
  // tried to enable this usecase — never as a default banner.
  const [enableAttempted, setEnableAttempted] = useState(false);

  const { plural: entityPlural } = useEntityPreference();
  const dynamicForwardTicketsLabel = useMemo(() => `Forward ${entityPlural || 'Tickets'}`, [entityPlural]);
  const flowDisplayLabel = flow?.id === 'case_management_cases_forward_1' ? dynamicForwardTicketsLabel : (flow?.label || '');
  const isShuffleSourcedFlow = flow?.id === 'case_management_cases_forward_1'
    || flow?.id === 'case_management_communication_1'
    || flow?.id === 'case_management_incident_routing_1'
    || flow?.id === 'case_management_schedules_notifications_1'
    || flow?.id === 'asset_management_case_management_vuln_1'
    || flow?.id === 'vulnerability_ingestion_1'
    || flow?.id === 'threat_intel_ingest_1'
    || flow?.id === 'threat_intel_case_management_1'
    || flow?.source === 'threat_intel';

  const ALLUVIAL_ELIGIBLE_FLOW_IDS = useMemo(() => new Set([
    'siem_case_management_1',
    'edr_case_management_1',
    'email_case_management_1',
    'vulnerability_ingestion_1',
    'asset_management_case_management_vuln_1',
    'case_management_communication_1',
    'case_management_cases_forward_1',
  ]), []);

  // Connection-path view mode: 'source_destination' (alluvial) or 'line' (tools strip).
  // Persisted per-flow so choices survive reloads.
  // Defaults to 'source_destination' for alluvial-eligible flows (ingest, vuln, notifications)
  // until the user swaps it themselves with the button.
  const [connectionViewMode, setConnectionViewModeState] = useState<'source_destination' | 'line'>('source_destination');

  useEffect(() => {
    if (!flow?.id || typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(`shuffle-usecase-connection-view-${flow.id}`);
      if (stored === 'line') {
        setConnectionViewModeState('line');
      } else if (stored === 'source_destination') {
        setConnectionViewModeState('source_destination');
      } else {
        setConnectionViewModeState(ALLUVIAL_ELIGIBLE_FLOW_IDS.has(flow.id) ? 'source_destination' : 'line');
      }
    } catch {
      setConnectionViewModeState(ALLUVIAL_ELIGIBLE_FLOW_IDS.has(flow.id) ? 'source_destination' : 'line');
    }
  }, [flow?.id, ALLUVIAL_ELIGIBLE_FLOW_IDS]);

  const setConnectionViewMode = (mode: 'source_destination' | 'line') => {
    setConnectionViewModeState(mode);
    if (flow?.id && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`shuffle-usecase-connection-view-${flow.id}`, mode);
      } catch { }
    }
  };

  const effectiveEnabled = optimisticEnabled !== null ? optimisticEnabled : isEnabled;
  const { environments } = useWorkflowHealth();
  const linkedWfs = useMemo(() => (flow ? findWorkflowsForUsecase(flow, workflows) : []), [flow, workflows]);
  const detailHealth = useMemo(() => diagnoseUsecase(linkedWfs, environments), [linkedWfs, environments]);
  const detailIsBlocked = effectiveEnabled && detailHealth.hasProblem;
  // App-search drawer state — mirrors the alluvial diagram's "+" buttons so
  // users can force-add a Source or Destination tool from this view too.
  const [addToolFor, setAddToolFor] = useState<null | { side: 'source' | 'destination'; categoryId: string; multiDest?: boolean }>(null);
  const [integrationsRefreshKey, setIntegrationsRefreshKey] = useState(0);
  // Per-side tool detail state: `hoveredTool` is the transient preview shown
  // while the cursor is over an icon; `pinnedTool` is the sticky selection
  // after a click (clicking the same icon again clears it).
  type ToolSideState = { source: IntegrationItem | null; destination: IntegrationItem | null };
  const [hoveredTool, setHoveredTool] = useState<ToolSideState>({ source: null, destination: null });
  const [pinnedTool, setPinnedTool] = useState<ToolSideState>({ source: null, destination: null });
  // Mirror the card's "Coming soon" gate so the detail page does not show a
  // live "Enable" button for usecases that are not yet wired up server-side.
  const isComingSoon = !!flow && !ACTIVE_USECASE_IDS.includes(flow.id);

  // Clear the optimistic flag only once the server-side `isEnabled` actually
  // reflects the new value. Without this, a fast refetch that lands before the
  // backend has finished deleting the workflow would briefly flip the button
  // back to its prior state (e.g. Disable -> Enable -> Disable).
  useEffect(() => {
    if (optimisticEnabled !== null && optimisticEnabled === isEnabled) {
      setOptimisticEnabled(null);
    }
  }, [isEnabled, optimisticEnabled]);

  // Capture the latest server-side enablement in a ref so the optimistic
  // 8-second safety net can verify whether the backend actually reflected the
  // change, and surface a clear warning toast if it didn't.
  const isEnabledRef = React.useRef(isEnabled);
  useEffect(() => { isEnabledRef.current = isEnabled; }, [isEnabled]);
  const scheduleEnableVerification = (willBeEnabled: boolean) => {
    setTimeout(() => {
      setOptimisticEnabled(null);
      if (willBeEnabled && !isEnabledRef.current && flow) {
        toast.warning(`${flow.label} did not confirm`, {
          description: 'The backend accepted the request but the change has not been reflected after 8 seconds. Open Workflows to check whether the workflow was generated, or try again.',
          duration: 10000,
        });
      }
    }, 8000);
  };

  // For the Notifications usecase, the linked workflow is referenced by the
  // org's `defaults.notification_workflow` UUID rather than by tag/name, so
  // findWorkflowsForUsecase() never picks it up. Fetch it explicitly so we
  // can surface it in the Linked Workflows list below.
  const [notificationWorkflow, setNotificationWorkflow] = useState<WorkflowSummary | null>(null);
  const [orgDefaults, setOrgDefaults] = useState<Record<string, any>>({});
  const [savingNotificationWf, setSavingNotificationWf] = useState(false);
  useEffect(() => {
    if (flow?.id !== 'case_management_communication_1') {
      setNotificationWorkflow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const info = localStorage.getItem('shuffle_user_info');
        const orgId = info ? JSON.parse(info)?.active_org?.id : null;
        const orgData = await fetchOrgCached(apiUrl(`/api/v1/orgs/${orgId}`), {
          credentials: 'include', headers: { ...authHeader() },
        });
        if (!cancelled && orgData?.defaults) setOrgDefaults(orgData.defaults);
        const wfId = orgData?.defaults?.notification_workflow;
        if (!wfId || typeof wfId !== 'string') {
          if (!cancelled) setNotificationWorkflow(null);
          return;
        }
        const existing = workflows.find((w) => w.id === wfId);
        if (existing) { if (!cancelled) setNotificationWorkflow(existing); return; }
        const wf = await fetchWorkflowByIdCached(apiUrl(`/api/v1/workflows/${wfId}`), wfId, {
          credentials: 'include', headers: { ...authHeader() },
        });
        if (!cancelled && wf?.id) setNotificationWorkflow(wf as WorkflowSummary);
      } catch { /* keep previous */ }
    })();
    return () => { cancelled = true; };
  }, [flow?.id, apiUrl, authHeader, workflows]);

  const handleSelectNotificationWorkflow = async (workflowIdValue: string) => {
    try {
      const info = localStorage.getItem('shuffle_user_info');
      const orgId = info ? JSON.parse(info)?.active_org?.id : null;
      if (!orgId) return;
      setSavingNotificationWf(true);
      const resp = await fetch(apiUrl(`/api/v1/orgs/${orgId}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          org_id: orgId,
          defaults: { ...orgDefaults, notification_workflow: workflowIdValue },
        }),
      });
      if (!resp.ok) throw new Error(`Save failed (${resp.status})`);
      setOrgDefaults((prev: any) => ({ ...prev, notification_workflow: workflowIdValue }));
      const selectedWf = workflows.find((w) => w.id === workflowIdValue) || null;
      setNotificationWorkflow(selectedWf);
      toast.success(workflowIdValue ? 'Notification workflow updated' : 'Notification workflow removed');
    } catch {
      toast.error('Failed to update notification workflow');
    } finally {
      setSavingNotificationWf(false);
    }
  };


  const handleToggle = async () => {
    if (!flow?.automationLabel || toggling) return;
    const willBeEnabled = !effectiveEnabled;
    if (willBeEnabled) setEnableAttempted(true);
    const sourceName = flow.source ? categoryLabel(flow.source) : 'source';


    // Self-contained usecases (e.g. IOC / threat feeds) do not need a
    // validated source-category tool — they seed their own defaults and
    // generate background workflows directly. Run that path instead of the
    // generic /workflows/generate flow below.
    const selfContained = flow ? SELF_CONTAINED_ENABLE[flow.id] : undefined;
    if (selfContained) {
      setToggling(true);
      setOptimisticEnabled(willBeEnabled);
      try {
        const ok = willBeEnabled ? await selfContained.enable() : await selfContained.disable();
        if (!ok) throw new Error('Backend rejected the request');
        const desc = flow.id === 'case_management_agent_ai_incident_handling_1'
          ? (willBeEnabled ? 'AI Agent is now active on incoming incidents.' : 'Removed AI Agent from Incident Automation.')
          : (willBeEnabled ? 'Seeded default threat feeds and started background ingestion.' : undefined);
        toast.success(willBeEnabled ? `${flow.label} enabled` : `${flow.label} disabled`, {
          description: desc,
          duration: 6000,
        });
        onToggled?.(flow.automationLabel, willBeEnabled);
        scheduleEnableVerification(willBeEnabled);
      } catch (err: any) {
        setOptimisticEnabled(null);
        toast.error(`Failed to ${willBeEnabled ? 'enable' : 'disable'} ${flow.label}`, {
          description: err?.message || 'The backend rejected the request.',
          duration: 8000,
        });
      } finally {
        setToggling(false);
      }
      return;
    }

    // Host Monitoring is presence-driven: "activating" means deploying a host monitor
    if (flow.id === 'case_management_asset_management_monitors_1') {
      if (willBeEnabled) {
        setActionModalOpen(true);
      } else {
        toast.warning('Host Monitoring is active on your endpoints', {
          description: 'To unregister monitors or adjust monitoring groups, manage them in the Monitors view.',
          action: {
            label: 'Open Monitors',
            onClick: () => navigate('/monitors'),
          },
        });
      }
      return;
    }

    // Forward Tickets, Notifications, and Vulnerability Correlation are Cases/Shuffle/internal-sourced —
    // Shuffle itself IS the source, so there is no third-party source auth to
    // validate. Skip the hard-block for these flows.
    if (willBeEnabled && !hasValidatedSource && !isShuffleSourcedFlow) {
      // Hard-block the enable. The /workflows/generate endpoint may return
      // success: true and then quietly skip creating the workflow when no
      // source tool is authenticated, which makes the UI look like it worked
      // until the next /workflows refresh reveals the truth. Refuse up front
      // and point the user at the fix instead.
      toast.error(`Authenticate a ${sourceName} tool first`, {
        description: `${flowDisplayLabel} needs a validated ${sourceName} integration as input. Without one, the workflow has nothing to react to and will not be created.`,
        duration: 10000,
        action: flow.source
          ? {
            label: `Connect ${sourceName}`,
            onClick: () => setAddToolFor({ side: 'source', categoryId: flow.source! }),
          }
          : undefined,
      });
      return;
    }

    if (willBeEnabled && flow.id === 'case_management_cases_forward_1') {
      const forwardWf = findForwardTicketsWorkflow(workflows);
      const appNames = forwardWf ? extractWorkflowAppNames(forwardWf) : [];
      const count = (appNames as any)?.size ?? (appNames as any)?.length ?? 0;
      if (count === 0) {
        toast.warning(`Choose a destination tool to forward ${entityPlural.toLowerCase()} to`);
        setAddToolFor({ side: 'destination', categoryId: flow.target || 'case_management', multiDest: true });
        return;
      }
    }

    if (willBeEnabled && flow.id === 'case_management_communication_1') {
      const notifWf = notificationWorkflow || workflows.find(w => w.id === orgDefaults?.notification_workflow);
      const appNames = notifWf ? extractNotificationWorkflowAppNames(notifWf) : new Set<string>();
      if (appNames.size === 0) {
        toast.warning('Choose a notification tool first');
        setAddToolFor({ side: 'destination', categoryId: flow.target || 'communication', multiDest: true });
        return;
      }
    }

    setToggling(true);
    setOptimisticEnabled(willBeEnabled);

    const sourceToIngest: Record<string, string> = {
      email: 'email', edr: 'edr', siem: 'siem', case_management: 'cases',
    };
    const requiredCat = sourceToIngest[flow.source];

    try {
      const requestBody: Record<string, string> = {
        label: flow.automationLabel,
      };
      if (flow.automationCategory) requestBody.category = flow.automationCategory;

      let validatedSourceAppNames: string[] = [];

      if (willBeEnabled) {
        if (flow.id === 'case_management_cases_forward_1') {
          const forwardWf = findForwardTicketsWorkflow(workflows);
          const appNames = forwardWf ? extractWorkflowAppNames(forwardWf) : [];
          if (((appNames as any)?.size || (appNames as any)?.length || 0) > 0) {
            requestBody.app_name = Array.from(appNames as any).join(',');
          }
        }
        // Step 1+2: re-check live which source tools are VALIDATED right now,
        // and forward them explicitly to /workflows/generate. Without this
        // the backend may generate a shell workflow with no source app wired
        // in, which the UI then correctly flips back to "Disabled".
        try {
          const authRes = await fetchAppsCached(apiUrl('/api/v1/apps/authentication'), {
            credentials: 'include',
            headers: { ...authHeader() },
          });
          if (authRes.ok) {
            const authData = await authRes.json();
            const authList = Array.isArray(authData) ? authData : (authData?.data || []);
            const seen = new Set<string>();
            for (const entry of Array.isArray(authList) ? authList : []) {
              if (entry?.validation?.valid !== true) continue;
              const app = entry?.app;
              if (!app?.name) continue;
              const cats = matchAppToCategoryList(app.name, app.categories || []);
              if (!cats.includes(flow.source)) continue;
              const k = normalizeAppName(app.name);
              if (seen.has(k)) continue;
              seen.add(k);
              validatedSourceAppNames.push(app.name);
            }
          }
        } catch { /* fall through — handled below */ }

        if (validatedSourceAppNames.length === 0 && !isShuffleSourcedFlow) {
          setOptimisticEnabled(null);
          setToggling(false);
          toast.error(`No validated ${sourceName} tool found`, {
            description: `${flow.label} needs at least one ${sourceName} integration with a validated authentication. Connect one and try again.`,
            duration: 10000,
            action: flow.source
              ? {
                label: `Connect ${sourceName}`,
                onClick: () => setAddToolFor({ side: 'source', categoryId: flow.source! }),
              }
              : undefined,
          });
          return;
        }
        if (validatedSourceAppNames.length > 0) {
          requestBody.app_name = validatedSourceAppNames.join(',');
        }
      } else {
        if (isShuffleSourcedFlow) {
          requestBody.action_name = 'remove';
        } else {
          // When disabling, the same workflow (e.g. "Ingest Tickets") may also be
          // powering sibling usecases that share a category (SIEM / EDR / Email
          // all generate the same ingestion workflow). A blind action_name=remove
          // would nuke the workflow for those siblings too. Instead, strip only
          // the apps belonging to THIS usecase's source category and re-post the
          // remaining list. If nothing is left, fall back to remove.
          const thisCat = sourceToIngest[flow.source];
          const linkedForApps = findWorkflowsForUsecase(flow, workflows);
          const currentNames: string[] = [];
          const seenAll = new Set<string>();
          for (const wf of linkedForApps) {
            for (const action of (wf.actions || [])) {
              for (const n of extractActionAppNames(action)) {
                const k = normalizeAppName(n);
                if (!seenAll.has(k)) { currentNames.push(n); seenAll.add(k); }
              }
            }
          }
          const remainingNames = currentNames.filter((n) => {
            const cat = getIngestionCategory(n);
            if (!cat || cat === 'other' || cat === 'cases') return false;
            return cat !== thisCat;
          });
          if (remainingNames.length > 0) {
            requestBody.app_name = remainingNames.join(',');
          } else {
            requestBody.action_name = 'remove';
          }
        }
      }

      const res = await fetch(apiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      let body: any = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const reason = typeof body?.reason === 'string' ? body.reason : '';
      const ok = res.ok && body?.success !== false;
      if (!ok) throw new Error(reason || `Request failed (${res.status})`);

      // Step 3: verify by refetching workflows and confirming a source app of
      // the required category is now wired into the generated workflow. The
      // backend sometimes returns success: true even when nothing was wired
      // (missing translation, unsupported app, etc.), so trust but verify.
      if (willBeEnabled && requiredCat && requiredCat !== 'cases') {
        let wiredApps: string[] = [];
        try {
          const wfRes = await fetch(apiUrl('/api/v1/workflows'), {
            credentials: 'include',
            headers: { ...authHeader() },
          });
          if (wfRes.ok) {
            const wfList = await wfRes.json();
            const linked = findWorkflowsForUsecase(flow, Array.isArray(wfList) ? wfList : []);
            const wiredSet = new Set<string>();
            for (const wf of linked) {
              for (const n of extractWorkflowAppNames(wf)) {
                if (getIngestionCategory(n) === requiredCat) wiredSet.add(n);
              }
            }
            wiredApps = Array.from(wiredSet);
          }
        } catch { /* fall through to warning */ }

        if (wiredApps.length === 0) {
          // Step 4: VERY clear failure path. The workflow exists but no
          // source-category app made it in, so the usecase will not run.
          setOptimisticEnabled(null);
          toast.error(`${flowDisplayLabel} could not be enabled`, {
            description: `The workflow was created but no ${sourceName} app was wired in. Tried: ${validatedSourceAppNames.join(', ') || 'none'}. Try connecting a different ${sourceName} tool or contact support.`,
            duration: 12000,
          });
          onToggled?.(flow.automationLabel, false);
          return;
        }

        toast.success(`${flowDisplayLabel} enabled`, {
          description: `Wired in ${wiredApps.length === 1 ? wiredApps[0] : `${wiredApps.length} ${sourceName} tools: ${wiredApps.join(', ')}`}.`,
          duration: 6000,
        });
      } else {
        toast.success(willBeEnabled ? `${flowDisplayLabel} enabled` : `${flowDisplayLabel} disabled`);
      }

      onToggled?.(flow.automationLabel, willBeEnabled);
      // Hard safety net in case the server never reflects the change.
      scheduleEnableVerification(willBeEnabled);
    } catch (err: any) {
      setOptimisticEnabled(null);
      const raw = err?.message || '';
      const isNetwork = /failed to fetch|networkerror|load failed/i.test(raw);
      const description = isNetwork
        ? 'Could not reach the Shuffle API. Check your connection or backend status and try again.'
        : (raw || 'The backend rejected the request.');
      toast.error(`Failed to ${willBeEnabled ? 'enable' : 'disable'} ${flowDisplayLabel}`, {
        description,
        duration: 8000,
      });
    } finally {
      setToggling(false);
    }
  };


  // Auto-enable bridge: when the list view opens the detail drawer with the
  // `autoEnable` flag set, fire Enable exactly once as soon as we have a
  // toggleable flow that is not already on. This is what lets a user click
  // Enable on a card and immediately watch the workflow materialize inside the
  // detail view (linked workflow appearing, Enabled chip, etc.).
  const [detailSearchParams, setDetailSearchParams] = useSearchParams();
  const hasAutoEnableIntent =
    autoEnable ||
    (Boolean(flow?.id) && getPendingAutoEnableFlow() === flow?.id) ||
    detailSearchParams.get('action') === 'activate';

  const autoEnableFiredForFlowRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!hasAutoEnableIntent) {
      return;
    }
    if (!flow?.id) return;
    if (autoEnableFiredForFlowRef.current === flow.id) return;
    if (toggling) return;

    if (!isAuthenticated) {
      // Don't swallow auto-enable while waiting for auth to hydrate!
      return;
    }

    if (!canToggle) {
      // Don't silently swallow the click. Tell the user exactly why nothing
      // happened so they can fix it (sign in, or pick a flow that is wired
      // up for automation server-side).
      autoEnableFiredForFlowRef.current = flow.id;
      setPendingAutoEnableFlow(null);
      onAutoEnableConsumed?.();
      if (!flow.automationLabel) {
        toast.warning(`${flow.label} cannot be enabled yet`, {
          description: 'This usecase does not have an automation label wired up server-side. Pick another usecase or contact support.',
          duration: 8000,
        });
      }
      return;
    }
    if (effectiveEnabled) {
      // Already on — nothing to do; just consume the flag.
      autoEnableFiredForFlowRef.current = flow.id;
      setPendingAutoEnableFlow(null);
      onAutoEnableConsumed?.();
      return;
    }
    autoEnableFiredForFlowRef.current = flow.id;
    setPendingAutoEnableFlow(null);
    onAutoEnableConsumed?.();
    if (detailSearchParams.get('action') === 'activate') {
      const nextParams = new URLSearchParams(detailSearchParams);
      nextParams.delete('action');
      setDetailSearchParams(nextParams, { replace: true });
    }
    handleToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoEnableIntent, flow?.id, canToggle, effectiveEnabled, toggling, isAuthenticated]);




  useEffect(() => {
    let cancelled = false;

    const fetchApps = async () => {
      // Re-use cached category apps unless an app activation has explicitly updated (integrationsRefreshKey > 0)
      const memCats = getCachedCategoryAppNames();
      const memVal = getCachedValidatedAppsByCategory();
      if (memCats && Object.keys(memCats).length > 0 && integrationsRefreshKey === 0) {
        setCategoryAppNames(memCats);
        if (memVal) setValidatedAppsByCategory(memVal);
        setCategoryAppsResolved(true);
        return;
      }

      try {
        const [authRes, appsRes] = await Promise.all([
          fetchAppsCached(apiUrl('/api/v1/apps/authentication'), { credentials: 'include', headers: { ...authHeader() } }),
          fetchAppsCached(apiUrl('/api/v1/apps'), { credentials: 'include', headers: { ...authHeader() } }),
        ]);

        const mapped: Record<string, Set<string>> = {};
        const validated: Record<string, Map<string, string>> = {};
        const addApp = (name: string, categories: string[]) => {
          const cats = matchAppToCategoryList(name, categories);
          for (const categoryId of cats) {
            if (!mapped[categoryId]) mapped[categoryId] = new Set();
            mapped[categoryId].add(name);
          }
        };
        const addValidated = (name: string, icon: string, categories: string[]) => {
          const cats = matchAppToCategoryList(name, categories);
          const key = normalizeAppName(name);
          for (const categoryId of cats) {
            if (!validated[categoryId]) validated[categoryId] = new Map();
            if (!validated[categoryId].has(key)) validated[categoryId].set(key, icon);
          }
        };

        if (authRes.ok) {
          const authData = await authRes.json();
          const authList = Array.isArray(authData) ? authData : (authData?.data || []);
          for (const entry of Array.isArray(authList) ? authList : []) {
            const app = entry?.app;
            if (app?.name) {
              addApp(app.name, app.categories || []);
              if (entry?.validation?.valid === true) {
                addValidated(app.name, app?.large_image || app?.image || '', app.categories || []);
              }
            }
          }
        }

        if (appsRes.ok) {
          const appsData = await appsRes.json();
          for (const app of Array.isArray(appsData) ? appsData : []) {
            if (app?.activated && app?.name) addApp(app.name, app.categories || []);
          }
        }

        if (!cancelled) {
          const nextCategoryApps = Object.fromEntries(
            Object.entries(mapped).map(([key, value]) => [key, Array.from(value).sort()])
          );
          const nextValidatedApps = Object.fromEntries(
            Object.entries(validated).map(([key, m]) => [
              key,
              Array.from(m.entries()).map(([name, icon]) => ({ name, icon })),
            ])
          );
          setCachedCategoryAppNames(nextCategoryApps);
          setCachedValidatedAppsByCategory(nextValidatedApps);
          setCategoryAppNames(nextCategoryApps);
          setValidatedAppsByCategory(nextValidatedApps);
        }
      } catch {
        if (!cancelled) setCategoryAppNames({});
      } finally {
        if (!cancelled) setCategoryAppsResolved(true);
      }
    };

    fetchApps();
    return () => { cancelled = true; };
    // Refetch when integrationsRefreshKey bumps so a newly authenticated app
    // (e.g. one the user just added from "Add Email tool") shows up in the
    // Source/Destination strip without needing a full page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationsRefreshKey]);


  if (!flow) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '1.1rem', color: 'hsl(var(--muted-foreground))', mb: 2 }}>
          Automation not found
        </Typography>
        <Button onClick={() => (onNavigateUsecase ? onNavigateUsecase('') : navigate('/usecases'))} sx={{ textTransform: 'none', color: 'hsl(var(--primary))' }}>
          ← Back to automations
        </Button>
      </Box>
    );
  }

  const sourceCat = getToolCategoryMeta(flow.source);
  const targetCat = getToolCategoryMeta(flow.target);
  const sourceCatLabel = sourceCat?.label || categoryLabel(flow.source) || 'source';
  const targetCatLabel = targetCat?.label || categoryLabel(flow.target) || 'destination';
  const phaseInfo = FLOW_PHASES.find((phase) => phase.id === flow.phase) || FLOW_PHASES[0];
  const sourceDetails = TOOL_CATEGORIES.find((item) => item.id === flow.source);
  const targetDetails = TOOL_CATEGORIES.find((item) => item.id === flow.target);
  const currentIndex = usecases.findIndex((item) => item.id === flow.id);
  const prevFlow = currentIndex > 0 ? usecases[currentIndex - 1] : null;
  const nextFlow = currentIndex < usecases.length - 1 ? usecases[currentIndex + 1] : null;
  const goToUsecase = (id: string) => {
    if (onNavigateUsecase) onNavigateUsecase(id);
    else {
      const target = usecases.find((u) => u.id === id);
      const seg = target?.label || id;
      navigate(`/usecases/${slugify(seg)}`);
    }
  };

  // Self-contained color tokens with fallbacks so the standalone build
  // (where host CSS may not define --card/--border/etc.) still renders
  // proper surfaces and accent colors instead of going transparent/flat.
  const CARD_BG = 'hsl(var(--card, 0 0% 13%))';
  const CARD_BORDER = '1px solid hsl(var(--border, 0 0% 20%))';
  const FG = 'hsl(var(--foreground, 0 0% 100%))';
  const MUTED = 'hsl(var(--muted-foreground, 0 0% 60%))';
  // Resolve a category color token (e.g. "--infra-siem") to an actual hsl()
  // string with a sensible fallback using the theme's primary color.
  const accent = (token?: string) => token ? `hsl(var(${token}, 24 100% 50%))` : primaryColor;
  const accentBg = (token: string | undefined, alpha: number) => {
    if (token) return `hsla(var(${token}, 24 100% 50%) / ${alpha})`;
    // Convert hex to rgba for alpha transparency
    const hex = primaryColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <Box sx={{ maxWidth: 860, width: '100%', mx: 'auto', pb: 4, color: FG }}>
      {!hideBackNav && (
        <Button onClick={() => navigate('/usecases')} startIcon={<ArrowLeft size={14} />} sx={{ mb: 2, textTransform: 'none', color: MUTED }}>
          Automations
        </Button>
      )}

      {showImage && flow.referenceImage && (
        <Box
          component="img"
          src={flow.referenceImage}
          alt={`${flow.label} reference`}
          loading="lazy"
          sx={{
            display: 'block',
            width: '100%',
            maxHeight: 280,
            objectFit: 'cover',
            borderRadius: 2,
            border: CARD_BORDER,
            mb: 3,
          }}
        />
      )}

      {!isAuthenticated && (
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 2,
            border: `1px solid ${primaryColor}66`,
            background: `linear-gradient(135deg, ${primaryColor}2E 0%, ${primaryColor}0F 60%, ${primaryColor}05 100%)`,
            p: { xs: 2, md: 2.5 },
            mb: 3,
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 2,
            flexDirection: { xs: 'column', sm: 'row' },
          }}
        >
          <Box
            sx={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${primaryColor}2E`,
              color: primaryColor,
            }}
          >
            <Sparkles size={22} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: FG, mb: 0.25 }}>
              Try “{flow.label}” in your own environment
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: MUTED, lineHeight: 1.5 }}>
              Create a free account to enable this automation in one click — no credit card, setup in under 2 minutes.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}>
            <Button
              component={Link}
              to={`/register?view=${encodeURIComponent(`/usecases/${slugify(flow.label)}`)}`}
              variant="contained"
              disableElevation
              endIcon={<ArrowRight size={16} />}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                px: 2,
                py: 1,
                bgcolor: primaryColor,
                color: 'hsl(var(--primary-foreground, 0 0% 100%))',
                '&:hover': { opacity: 0.9 },
                whiteSpace: 'nowrap',
              }}
            >
              Get started free
            </Button>
            <Button
              component={Link}
              to={`/login?view=${encodeURIComponent(`/usecases/${slugify(flow.label)}`)}`}
              variant="text"
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: MUTED,
                '&:hover': { color: FG, bgcolor: 'transparent' },
              }}
            >
              Sign in
            </Button>
          </Box>
        </Box>
      )}

      <Box sx={{
        p: 3,
        borderRadius: 2,
        border: detailIsBlocked
          ? '1px solid hsl(var(--destructive) / 0.5)'
          : effectiveEnabled
            ? '1px solid hsl(var(--severity-low))'
            : CARD_BORDER,
        bgcolor: detailIsBlocked
          ? 'hsl(var(--destructive) / 0.04)'
          : effectiveEnabled
            ? 'hsl(var(--severity-low) / 0.04)'
            : CARD_BG,
        boxShadow: detailIsBlocked
          ? '0 2px 8px hsl(var(--destructive) / 0.08)'
          : effectiveEnabled
            ? '0 2px 8px hsl(var(--severity-low) / 0.08)'
            : 'none',
        mb: 3,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
              <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: FG, lineHeight: 1.2, flex: 1, minWidth: 0 }}>
                {flowDisplayLabel}
              </Typography>
              {isComingSoon ? (
                <Box
                  sx={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    textTransform: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    py: 0.6,
                    px: 1.25,
                    borderRadius: 1,
                    bgcolor: 'hsl(var(--severity-medium) / 0.08)',
                    color: 'hsl(var(--severity-medium))',
                    border: '1px solid hsl(var(--severity-medium) / 0.4)',
                  }}
                >
                  <Clock size={14} />
                  Coming soon
                </Box>
              ) : flow.id === 'case_management_asset_management_monitors_1' && effectiveEnabled ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.6,
                      px: 1.2,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: 'hsl(var(--severity-low) / 0.12)',
                      border: '1px solid hsl(var(--severity-low) / 0.4)',
                      color: 'hsl(var(--severity-low))',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    <Power size={13} style={{ color: 'inherit' }} />
                    Active
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate('/monitors')}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      py: 0.4,
                      px: 1.2,
                      borderRadius: 1,
                    }}
                  >
                    Manage Monitors
                  </Button>
                </Box>
              ) : canToggle && flow.automationLabel ? (
                <Tooltip
                  title={
                    detailIsBlocked
                      ? `${detailHealth.primaryProblem?.title || 'Execution blocked'}: ${detailHealth.primaryProblem?.description || 'Runtime location is offline.'} Click to disable.`
                      : !effectiveEnabled && !hasValidatedSource && !isShuffleSourcedFlow
                        ? `No active ${sourceCatLabel} integration is connected. Activating will not do anything until a ${sourceCatLabel} tool is authenticated — the workflow will be disabled again automatically.`
                        : !effectiveEnabled && (flow.id === 'case_management_cases_forward_1' || flow.id === 'case_management_communication_1')
                          ? 'Click to activate (choose a destination tool)'
                          : effectiveEnabled
                            ? 'Click to disable'
                            : 'Click to activate'
                  }
                  placement="bottom"
                  arrow
                >
                  <span>
                    <Button
                      size="small"
                      disableElevation
                      onClick={handleToggle}
                      disabled={toggling}
                      startIcon={
                        toggling ? (
                          <CircularProgress size={12} sx={{ color: 'inherit' }} />
                        ) : (
                          <Power
                            size={13}
                            style={{
                              color: detailIsBlocked
                                ? 'hsl(var(--destructive))'
                                : effectiveEnabled
                                  ? 'hsl(var(--severity-low))'
                                  : 'hsl(var(--destructive))',
                            }}
                          />
                        )
                      }
                      sx={{
                        flexShrink: 0,
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        minHeight: 0,
                        py: 0.5,
                        px: 1.2,
                        borderRadius: 1,
                        bgcolor: detailIsBlocked
                          ? 'hsl(var(--destructive) / 0.12)'
                          : effectiveEnabled
                            ? 'hsl(var(--severity-low) / 0.12)'
                            : 'hsl(var(--destructive) / 0.12)',
                        color: detailIsBlocked
                          ? 'hsl(var(--destructive))'
                          : effectiveEnabled
                            ? 'hsl(var(--severity-low))'
                            : 'hsl(var(--destructive))',
                        border: detailIsBlocked
                          ? '1px solid hsl(var(--destructive) / 0.45)'
                          : effectiveEnabled
                            ? '1px solid hsl(var(--severity-low) / 0.4)'
                            : '1px solid hsl(var(--destructive) / 0.4)',
                        letterSpacing: 0.2,
                        boxShadow: 'none',
                        '&:hover': {
                          bgcolor: detailIsBlocked
                            ? 'hsl(var(--destructive) / 0.22)'
                            : effectiveEnabled
                              ? 'hsl(var(--severity-low) / 0.22)'
                              : 'hsl(var(--destructive) / 0.22)',
                          borderColor: detailIsBlocked
                            ? 'hsl(var(--destructive) / 0.7)'
                            : effectiveEnabled
                              ? 'hsl(var(--severity-low) / 0.7)'
                              : 'hsl(var(--destructive) / 0.7)',
                          boxShadow: 'none',
                        },
                      }}
                    >
                      {detailIsBlocked ? 'Active · Blocked' : effectiveEnabled ? 'Active' : 'Activate'}
                    </Button>
                  </span>
                </Tooltip>
              ) : !isAuthenticated && flow.automationLabel ? (
                <Button
                  component={Link}
                  to={`/register?view=${encodeURIComponent(`/usecases/${slugify(flow.label)}`)}`}
                  size="small"
                  disableElevation
                  startIcon={<Power size={13} style={{ color: 'hsl(var(--destructive))' }} />}
                  sx={{
                    flexShrink: 0,
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    minHeight: 0,
                    py: 0.5,
                    px: 1.2,
                    borderRadius: 1,
                    bgcolor: 'hsl(var(--destructive) / 0.12)',
                    color: 'hsl(var(--destructive))',
                    border: '1px solid hsl(var(--destructive) / 0.4)',
                    letterSpacing: 0.2,
                    boxShadow: 'none',
                    '&:hover': {
                      bgcolor: 'hsl(var(--destructive) / 0.22)',
                      borderColor: 'hsl(var(--destructive) / 0.7)',
                      boxShadow: 'none',
                    },
                  }}
                >
                  Activate
                </Button>
              ) : null}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.25 }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, px: 1, py: 0.35, borderRadius: 1, bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))' }}>
                Step {phaseInfo.step}: {phaseInfo.label}
              </Typography>
              {flow.manualVerification && (
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, px: 1, py: 0.35, borderRadius: 1, bgcolor: 'hsl(var(--severity-medium) / 0.1)', color: 'hsl(var(--severity-medium))', border: '1px solid hsl(var(--severity-medium) / 0.35)' }}>
                  Manual Verification
                </Typography>
              )}
              {typeof flow.priority === 'number' && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.68rem', fontWeight: 700, px: 1, py: 0.35, borderRadius: 1, bgcolor: `${primaryColor}1A`, color: primaryColor, border: `1px solid ${primaryColor}40` }}>
                  <Flame size={11} />
                  Priority {flow.priority}
                </Box>
              )}
            </Box>
            <Typography sx={{ fontSize: '0.88rem', color: MUTED, lineHeight: 1.7 }}>
              {flow.description || 'No description available.'}
            </Typography>
            {detailIsBlocked && (
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'hsl(var(--destructive) / 0.08)',
                  border: '1px solid hsl(var(--destructive) / 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'hsl(var(--destructive))', flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--destructive))' }}>
                      {detailHealth.primaryProblem?.title || 'Execution Blocked'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      {detailHealth.primaryProblem?.description || 'The runtime location used by this workflow is offline.'}
                    </Typography>
                  </Box>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigate(detailHealth.primaryProblem?.actionUrl || '/admin/runtime-locations')}
                  sx={{
                    fontSize: '0.75rem',
                    borderColor: 'hsl(var(--destructive))',
                    color: 'hsl(var(--destructive))',
                    textTransform: 'none',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    '&:hover': {
                      borderColor: 'hsl(var(--destructive))',
                      bgcolor: 'hsl(var(--destructive) / 0.1)',
                    },
                  }}
                >
                  Fix Runtime Location &rarr;
                </Button>
              </Box>
            )}
            {(flow.id === 'threat_intel_ingest_1' || flow.label === 'IOC feeds') && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  mt: 1.25,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: 'hsl(var(--muted) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                  fontSize: '0.8rem',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                <span>IOC feeds and Threat feeds are the same thing.</span>
                <Box
                  component={Link}
                  to="/incidents/threat-feeds"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.35,
                    color: primaryColor,
                    fontWeight: 600,
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  <span>Threat Feeds</span>
                  <ArrowRight size={12} />
                </Box>
              </Box>
            )}
            {flow.tags.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                {flow.tags.map((tag) => (
                  <Typography key={tag} sx={{ fontSize: '0.7rem', px: 0.9, py: 0.35, borderRadius: 1, bgcolor: 'hsla(0, 0%, 60%, 0.08)', color: MUTED, border: '1px solid hsla(0, 0%, 60%, 0.18)', fontWeight: 600 }}>
                    {tag}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Simple one-line hint: tell the user what clicking Enable will do
          (or what is missing). No panel, no checklist — just the answer. */}
      {/* Inline blocker hint — only shown AFTER the user has clicked Enable
          and something is actually preventing the workflow from being
          generated. Never shown by default. */}
      {!isComingSoon && flow.automationLabel && !effectiveEnabled && enableAttempted && (() => {
        const selfContained = !!SELF_CONTAINED_ENABLE[flow.id];
        // Forward Tickets and Notifications are Shuffle-sourced: Shuffle
        // itself IS the source, so the user never needs to add a Source-side
        // tool. What they DO need is at least one external destination tool
        // to push to. Point the hint at the Destination side.
        const isShuffleSourcedFlow = flow.id === 'case_management_cases_forward_1'
          || flow.id === 'case_management_communication_1'
          || flow.id === 'case_management_incident_routing_1'
          || flow.id === 'case_management_schedules_notifications_1'
          || flow.id === 'asset_management_case_management_vuln_1'
          || flow.id === 'vulnerability_ingestion_1';
        const needsSource = !!flow.source && !selfContained && !isShuffleSourcedFlow;
        const sourceLabel = flow.source ? categoryLabel(flow.source) : 'source';
        // Detect if a source-side app is ALREADY wired into the usecase's
        // workflow(s). If so, the user does not need to add another tool —
        // they need to validate the one they already have. Focus the hint
        // on that instead of pushing them to add yet another app.
        let existingSourceAppName: string | null = null;
        if (needsSource && !hasValidatedSource) {
          try {
            const linked = getLinkedWorkflowsForUsecase(flow, workflows, notificationWorkflow);
            const sourceNames = Array.from(getWorkflowEnabledAppNames(linked.usecaseWorkflows));
            const sourceCatalogKeys = new Set((categoryAppNames[flow.source] || []).map((n) => normalizeAppName(n)));
            const match = sourceNames.find((n) => sourceCatalogKeys.has(normalizeAppName(n)));
            if (match) existingSourceAppName = match;
            else if (sourceNames.length > 0) existingSourceAppName = sourceNames[0];
          } catch { /* fall through to generic copy */ }
        }
        let message: string | null = null;
        if (!isAuthenticated) {
          message = 'Sign in to enable this usecase.';
        } else if (flow.id === 'case_management_incident_routing_1') {
          message = `Configure at least one routing rule below to enable ${flow.label}.`;
        } else if (flow.id === 'case_management_schedules_notifications_1') {
          message = `Click Enable to generate the Schedules & Phone Notifications workflow.`;
        } else if (isShuffleSourcedFlow) {
          message = `Add a destination tool with a validated (green) authentication to enable ${flow.label}.`;
        } else if (needsSource && !hasValidatedSource && existingSourceAppName) {
          const displayName = existingSourceAppName.replace(/_/g, ' ');
          message = `Validate ${displayName} on the Source side (its indicator must turn green) to enable ${flow.label}.`;
        } else if (needsSource && !hasValidatedSource) {
          message = `Add a ${sourceLabel} tool with a validated (green) authentication on the Source side to enable ${flow.label}.`;
        }
        if (!message) return null;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, p: 1.25, borderRadius: 1.5, border: '1px solid hsl(45 93% 47% / 0.35)', bgcolor: 'hsl(45 93% 47% / 0.08)' }}>
            <Typography sx={{ fontSize: '0.8rem', color: FG, lineHeight: 1.5, flex: 1 }}>
              {message}
            </Typography>
          </Box>
        );
      })()}




      {flow.id === 'case_management_agent_ai_incident_handling_1' && (
        <AiIncidentHandlingPromptsBlock />
      )}

      {/* Inline custom-action CTA (e.g. "Add Monitor" → opens Add Host
          dialog directly in the sidebar). Falls back to a navigation
          button when no modal slot is configured for this customAction. */}
      {flow.customAction && (flow.customAction.modal || flow.customAction.href || flow.customAction.url) && (() => {
        const hasModal = !!flow.customAction.modal;
        const modalNode = hasModal && renderUsecaseActionModal
          ? renderUsecaseActionModal({
              modal: flow.customAction.modal!,
              flowId: flow.id,
              flowLabel: flow.label,
              open: actionModalOpen,
              onClose: () => setActionModalOpen(false),
            })
          : null;
        const navProps = flow.customAction.url
          ? { component: 'a' as const, href: flow.customAction.url, target: '_blank', rel: 'noopener noreferrer' }
          : flow.customAction.href
            ? { component: Link, to: flow.customAction.href }
            : null;
        return (
          <Box sx={{ p: 2.5, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                {flow.customAction.label}
              </Typography>
              {flow.customAction.description && (
                <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
                  {flow.customAction.description}
                </Typography>
              )}
            </Box>
            {hasModal && modalNode ? (
              <>
                <Button
                  onClick={() => setActionModalOpen(true)}
                  variant="contained"
                  disableElevation
                  startIcon={<ArrowRight size={14} />}
                  sx={{ textTransform: 'none', fontWeight: 600, bgcolor: primaryColor, color: '#FFFFFF', height: 36, '&:hover': { bgcolor: primaryColor } }}
                >
                  {flow.customAction.label}
                </Button>
                {modalNode}
              </>
            ) : navProps ? (
              <Button
                {...(navProps as any)}
                variant="contained"
                disableElevation
                startIcon={<ArrowRight size={14} />}
                sx={{ textTransform: 'none', fontWeight: 600, bgcolor: primaryColor, color: '#FFFFFF', height: 36, '&:hover': { bgcolor: primaryColor } }}
              >
                {flow.customAction.label}
              </Button>
            ) : null}
          </Box>
        );
      })()}

      {(() => {
        const slot = renderUsecaseDetailSlot
          ? renderUsecaseDetailSlot({
              flowId: flow.id,
              flowLabel: flow.label,
              onOpenModal: () => setActionModalOpen(true),
            })
          : null;
        return slot ? (
          <Box sx={{ p: 2.5, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3 }}>
            {slot}
          </Box>
        ) : null;
      })()}

      {/* Outcome block moved below Source → Destination (see after the
          connection-path block). */}




      {showConnectionPath && flow.id !== 'case_management_incident_routing_1' && flow.id !== 'case_management_schedules_notifications_1' && flow.id !== 'case_management_asset_management_monitors_1' && (() => {
        const alluvialEligible = useAlluvialDiagram && ALLUVIAL_ELIGIBLE_FLOW_IDS.has(flow.id);
        const showAlluvial = alluvialEligible && connectionViewMode === 'source_destination';
        return (
      <Box sx={{ p: 3, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3, position: 'relative' }}>
        {alluvialEligible && (() => {
          const nextMode = connectionViewMode === 'source_destination' ? 'line' : 'source_destination';
          const tooltip = nextMode === 'line' ? 'Switch to Line view' : 'Switch to Source / Destination view';
          const Icon = connectionViewMode === 'source_destination' ? Rows : Workflow;
          return (
            <Tooltip title={tooltip} placement="left" arrow>
              <Box
                component="button"
                onClick={() => setConnectionViewMode(nextMode)}
                aria-label={tooltip}
                sx={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  zIndex: 2,
                  width: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: 1,
                  bgcolor: 'transparent',
                  color: 'hsl(var(--muted-foreground) / 0.6)',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease, background-color 0.15s ease',
                  '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted) / 0.5)' },
                }}
              >
                <Icon size={14} />
              </Box>
            </Tooltip>
          );
        })()}
        {showAlluvial ? (
          <UsecaseAlluvialDiagram
            flowId={flow.id}
            sourceCategory={flow.source}
            targetCategory={flow.target}
            highlightCategory={['case_management_communication_1', 'case_management_cases_forward_1', 'vulnerability_ingestion_1', 'asset_management_case_management_vuln_1'].includes(flow.id) ? undefined : flow.source}
            lockSource={flow.id === 'case_management_cases_forward_1'}
            omitSource={flow.id === 'case_management_communication_1'}
            notificationWorkflow={notificationWorkflow}
            isFlowEnabled={effectiveEnabled}
            usecaseLabel={flowDisplayLabel}
            isLoggedIn={isAuthenticated}
            workflows={workflows}
            // Keep the AppBubble's built-in mini popover (Visit / Enable Sync
            // / Remove). Only the "+" Add buttons delegate to the host below.
            // Reuse the same AppSearchDrawer wiring (setAddToolFor) the
            // default Source/Destination "+" tile uses, so adding a tool
            // from the alluvial goes through the same workflows/generate
            // pipeline with toast + cache invalidation.
            onAddTool={(side) => {
              const isLeft = side === 'left';
              setAddToolFor({
                side: isLeft ? 'source' : 'destination',
                categoryId: isLeft ? flow.source! : flow.target!,
                multiDest: !isLeft && (MULTI_DEST_FLOW_IDS.has(flow.id) || USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT.has(flow.id)),
              });
              return true;
            }}
          />
        ) : (
        (() => {
          // Per-usecase per-app enable/disable: read which apps the linked
          // workflow currently uses, and provide a toggle that re-posts the
          // full app_name list to /workflows/generate (same contract as the
          // /incidents Ingest popover so the two stay in sync).
          const {
            workflows: allLinkedForApps,
            usecaseWorkflows: usecaseLinkedForApps,
            forwardTicketsWorkflows: forwardTicketsLinkedForApps,
          } = getLinkedWorkflowsForUsecase(flow, workflows, notificationWorkflow);
          const sourceEnabledNamesSet = getWorkflowEnabledAppNames(usecaseLinkedForApps);
          const destinationEnabledNamesSet = USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT.has(flow.id)
            ? getWorkflowEnabledAppNames(forwardTicketsLinkedForApps)
            : getWorkflowEnabledAppNames(allLinkedForApps);
          const enabledNamesSet = new Set([...sourceEnabledNamesSet, ...destinationEnabledNamesSet]);
          // Merge in any apps the user has chosen from the AppSearchDrawer in
          // a previous session — keeps the picked tool visible even if the
          // backend wiring is still in flight on the next reload.
          // BUT: if no workflow exists for this usecase at all (deleted, never
          // created), the injected snapshot is stale by definition — drop it
          // so we don't show "enabled" tools that have nothing backing them.
          if (allLinkedForApps.length === 0) {
            clearInjectedUsecaseApps(flow.id);
          } else {
            const sourceCatalogKeys = new Set((categoryAppNames[flow.source] || []).map((n) => normalizeAppName(n)));
            const destinationCatalogKeys = new Set(
              ((MULTI_DEST_FLOW_IDS.has(flow.id) || USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT.has(flow.id))
                ? [...(categoryAppNames['communication'] || []), ...(categoryAppNames['case_management'] || [])]
                : (categoryAppNames[flow.target] || [])
              ).map((n) => normalizeAppName(n))
            );
            for (const n of readInjectedUsecaseApps(flow.id)) {
              const key = normalizeAppName(n);
              enabledNamesSet.add(key);
              if (sourceCatalogKeys.has(key) && !destinationCatalogKeys.has(key)) {
                sourceEnabledNamesSet.add(key);
              } else {
                destinationEnabledNamesSet.add(key);
              }
            }
          }
          const handleUsecaseAppToggle = async (
            appName: string,
            enabled: boolean,
            context?: {
              automationLabel?: string;
              automationCategory?: string;
              workflows: WorkflowSummary[];
              enabledNamesSet: Set<string>;
              toastLabel?: string;
            },
          ) => {
            const automationLabel = context?.automationLabel || flow.automationLabel;
            if (!automationLabel) {
              toast.error('This usecase is not toggleable yet');
              return;
            }
            const activeSet = context?.enabledNamesSet || enabledNamesSet;
            const workflowScope = context?.workflows || allLinkedForApps;
            const toastLabel = context?.toastLabel || flow.label;
            const next = new Set(Array.from(activeSet));
            const key = normalizeAppName(appName);
            if (enabled) next.add(key); else next.delete(key);
            // Keep the localStorage "injected apps" snapshot in sync with the
            // toggle, otherwise readInjectedUsecaseApps() will keep showing
            // a disabled app as still-enabled in the Source/Destination strip.
            if (enabled) pushInjectedUsecaseApp(flow.id, appName);
            else removeInjectedUsecaseApp(flow.id, appName);
            // Optimistically refresh the tool strip so the user sees the
            // change immediately, before the backend write completes.
            invalidateAppsCache(); setIntegrationsRefreshKey((k2) => k2 + 1);
            // Source of truth = the actual apps inside the linked workflow(s).
            // Anything currently wired into the workflow stays wired unless it
            // IS the app the user just toggled off. This prevents accidentally
            // dropping apps that aren't in the per-category catalog (e.g. a
            // Singul-wrapped Wazuh node, or a tool outside flow.source/target)
            // and falling back to action_name=remove when there are clearly
            // other apps still in the workflow.
            const activeNames: string[] = [];
            const seen = new Set<string>();
            for (const wf of workflowScope) {
              for (const action of (wf.actions || [])) {
                for (const n of extractActionAppNames(action)) {
                  const k = normalizeAppName(n);
                  if (!k || seen.has(k)) continue;
                  if (!enabled && k === key) continue; // drop the one being disabled
                  seen.add(k);
                  activeNames.push(n);
                }
              }
            }
            // Make sure the just-enabled app is in the list even if it isn't
            // already wired into the workflow (the user explicitly clicked it).
            if (enabled && !seen.has(key)) { activeNames.push(appName); seen.add(key); }

                  try {
                    const body: Record<string, string> = { label: automationLabel };
                    const automationCategory = context?.automationCategory ?? flow.automationCategory;
                    if (automationCategory) body.category = automationCategory;
                    if (activeNames.length > 0) body.app_name = activeNames.join(',');
                    else body.action_name = 'remove';
                    const res = await fetch(apiUrl('/api/v2/workflows/generate'), {
                      method: 'POST',
                      credentials: 'include',
                      headers: { ...authHeader(), 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    });
                    let parsed: any = null;
                    try { parsed = await res.json(); } catch { /* ignore */ }
                    const ok = res.ok && parsed?.success !== false;
                    if (!ok) throw new Error(parsed?.reason || `Request failed (${res.status})`);
                    toast.success(enabled
                      ? `${appName} enabled for ${toastLabel}`
                      : `${appName} disabled for ${toastLabel}`);
                    invalidateAppsCache(); setIntegrationsRefreshKey((k2) => k2 + 1);
                    onToggled?.(automationLabel, activeNames.length > 0);
                  } catch (err: any) {
                    // Roll back the optimistic localStorage update on failure.
                    if (enabled) removeInjectedUsecaseApp(flow.id, appName);
                    else pushInjectedUsecaseApp(flow.id, appName);
                    invalidateAppsCache(); setIntegrationsRefreshKey((k2) => k2 + 1);
                    toast.error(`Failed to ${enabled ? 'enable' : 'disable'} ${appName}`, {
                      description: err?.message || 'The backend rejected the request.',
                    });
                  }
                };
                return (
                  <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                    {(() => {
                      const isMultiDest = MULTI_DEST_FLOW_IDS.has(flow.id);
                      // Ingest-to-cases usecases (SIEM/EDR/Email alerts) use the Forward
                      // Tickets workflow as the Destination truth source. Do not mix the
                      // ingest workflow's SIEM/EDR/Email apps into the destination tools.
                      const inheritsForwardTickets = USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT.has(flow.id);
                      const destSpansCommAndCases = isMultiDest || inheritsForwardTickets;
                      // For multi-destination flows (Notifications, Forward Tickets)
                      // the destination spans BOTH Communication and Cases catalogs —
                      // surface the union of apps and label both categories so users
                      // see the full picture instead of just one side.
                      const destAppNames = destSpansCommAndCases
                        ? Array.from(new Set([
                          ...(categoryAppNames['communication'] || []),
                          ...(categoryAppNames['case_management'] || []),
                        ])).sort()
                        : (categoryAppNames[flow.target] || []);
                      const commMeta = getToolCategoryMeta('communication');
                      const casesMeta = getToolCategoryMeta('case_management');
                      const destMeta = isMultiDest
                        ? {
                          ...targetCat,
                          label: 'Communication & Cases',
                          // Render both category icons side-by-side so the destination
                          // tile visually reads as "both" rather than just one.
                          icon: (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                              <Box component="span" sx={{ display: 'inline-flex', '& > svg': { width: 12, height: 12 } }}>
                                {commMeta?.icon}
                              </Box>
                              <Box component="span" sx={{ display: 'inline-flex', '& > svg': { width: 12, height: 12 } }}>
                                {casesMeta?.icon}
                              </Box>
                            </Box>
                          ),
                        }
                        : targetCat;
                      const destCategoryId = isMultiDest ? 'communication' : flow.target;
                      return ([
                        { title: 'Source', meta: sourceCat, details: sourceDetails, categoryId: flow.source, appNames: categoryAppNames[flow.source] || [] },
                        // Self-contained usecases (e.g. Assign & Escalate) operate entirely
                        // within Cases and have no separate destination tool to wire up.
                        flow.id === 'case_management_assign_escalate_1'
                          ? null
                          : { title: 'Destination', meta: destMeta, details: targetDetails, categoryId: destCategoryId, appNames: destAppNames },
                      ].filter(Boolean) as Array<{ title: string; meta: any; details: any; categoryId: string; appNames: string[] }>).map((endpoint) => {
                        // The Shuffle platform itself owns the Cases category, so always
                        // surface "Shuffle Security" alongside any installed case-management
                        // apps. Pre-pend it so it sorts first and the user immediately sees
                        // that Shuffle covers this leg of the flow.
                        // Skip Shuffle Security on Destination when Source is also Cases —
                        // avoids duplicating the platform on both sides of the flow.
                        // Multi-dest flows span Cases as a valid destination too, so show
                        // the Shuffle Security tile even when the category id we render the
                        // tile under is "communication".
                        const includesCases = endpoint.categoryId === 'case_management'
                          || (endpoint.title === 'Destination' && isMultiDest);
                        // Forward Tickets and Notifications are Cases-sourced: the source
                        // IS Shuffle Security itself, and the destination is the external
                        // tool. Hide the duplicate Shuffle Security tile on the destination
                        // side and disable adding source tools.
                        const isForwardTickets = flow.id === 'case_management_cases_forward_1';
                        const isNotifications = flow.id === 'case_management_communication_1';
                        const isCasesSourceOnly = isForwardTickets || isNotifications;
                        const skipShuffle = endpoint.title === 'Destination'
                          && (isCasesSourceOnly || (flow.source === 'case_management' && !isMultiDest));
                        const showShuffle = includesCases && !skipShuffle;
                        // When Shuffle itself is the Source, only surface the Shuffle Security
                        // tile — hiding other case-management apps that would otherwise clutter
                        // the source side of the flow.
                        const sourceIsShuffleOnly = endpoint.title === 'Source' && endpoint.categoryId === 'case_management';
                        // Some usecases (e.g. Enrichment) run entirely on a built-in Shuffle
                        // workflow — the destination has no third-party apps to wire up,
                        // only the Shuffle Security platform itself.
                        const destIsShuffleOnly = endpoint.title === 'Destination'
                          && DESTINATION_SHUFFLE_ONLY_FLOW_IDS.has(flow.id);
                        const baseAppNames = sourceIsShuffleOnly || destIsShuffleOnly
                          ? ['Shuffle Security']
                          : showShuffle
                            ? ['Shuffle Security', ...endpoint.appNames.filter((n) => n.toLowerCase() !== 'shuffle security')]
                            : endpoint.appNames;
                        // Inject any workflow apps that are enabled but don't belong to
                        // this category's catalog so the user can still see — and
                        // toggle — them locally instead of having ghost apps stuck in
                        // the workflow with no UI representation. Only do this on the
                        // Destination tile (the togglable side); the Source tile is
                        // gated by category and shouldn't surface foreign apps.
                        const baseSeen = new Set(baseAppNames.map((n) => normalizeAppName(n)));
                        const injected: string[] = [];
                        if (endpoint.title === 'Destination' && !destIsShuffleOnly) {
                          // Never inject apps that actually belong to a Source-side
                          // catalog of ANY flow — otherwise a SIEM tool like Wazuh
                          // shows up under unrelated destinations just because it's
                          // enabled in some workflow. Only the current flow's target
                          // catalog and truly-foreign (uncategorized) apps may show.
                          const targetCatKey = flow.target;
                          // When the destination spans Communication AND Cases (multi-dest
                          // or ingest flows that inherit Forward Tickets), treat both
                          // catalogs as the "target" so apps from either side aren't
                          // filtered as "foreign" and dropped.
                          const targetCatKeys = destSpansCommAndCases
                            ? new Set(['communication', 'case_management'])
                            : new Set([targetCatKey]);
                          const targetSeen = new Set<string>();
                          for (const ck of targetCatKeys) {
                            for (const n of (categoryAppNames[ck] || [])) targetSeen.add(normalizeAppName(n));
                          }
                          const foreignCategorySeen = new Set<string>();
                          for (const [catKey, names] of Object.entries(categoryAppNames)) {
                            if (targetCatKeys.has(catKey)) continue;
                            for (const n of (names as string[])) {
                              foreignCategorySeen.add(normalizeAppName(n));
                            }
                          }
                          const endpointEnabledNamesSet = endpoint.title === 'Destination'
                            ? destinationEnabledNamesSet
                            : sourceEnabledNamesSet;
                          for (const k of endpointEnabledNamesSet) {
                            if (baseSeen.has(k)) continue;
                            if (!destSpansCommAndCases && foreignCategorySeen.has(k) && !targetSeen.has(k)) continue;
                            injected.push(k); baseSeen.add(k);
                          }
                        }
                        const appNamesWithShuffle = injected.length
                          ? [...baseAppNames, ...injected]
                          : baseAppNames;
                        const synthetic = (showShuffle || destIsShuffleOnly)
                          ? [{
                            id: 'shuffle-security',
                            name: 'Shuffle Security',
                            icon: shuffleSecurityIcon,
                            validated: !!effectiveEnabled,
                            active: !!effectiveEnabled,
                          }]
                          : undefined;
                        const side: 'source' | 'destination' = endpoint.title === 'Source' ? 'source' : 'destination';
                        const pinned = pinnedTool[side];
                        // `isCases` gates "Add tool" behaviour — for multi-dest we always
                        // want the add button enabled regardless of underlying category id.
                        const isCases = endpoint.categoryId === 'case_management';
                        // Source side of a "coming soon" usecase: intercept toggles so we
                        // surface a clear message instead of silently failing or wiring up
                        // an unsupported source app.
                        const sourceComingSoon = endpoint.title === 'Source'
                          && SOURCE_COMING_SOON_FLOW_IDS.has(flow.id);
                        const handleSourceComingSoon = (_appName: string) => {
                          toast.warning('Coming soon', {
                            description: `${flow.label} does not yet support wiring up ${endpoint.meta?.label || 'source'} tools as triggers. The workflow runs on Shuffle's built-in pipeline.`,
                            duration: 6000,
                          });
                        };
                        // When Shuffle itself is the Source (case_management), the only
                        // meaningful "enabled tool" on the Source side is Shuffle. The
                        // workflow's other apps belong to the Destination side and would
                        // otherwise leak into Source as a "+N more / Hide extras" list.
                        const endpointEnabledNamesSet = side === 'destination'
                          ? destinationEnabledNamesSet
                          : (sourceIsShuffleOnly
                            ? new Set(effectiveEnabled ? [normalizeAppName('Shuffle Security')] : [])
                            : sourceEnabledNamesSet);
                        const endpointWorkflowAppNames = Array.from(endpointEnabledNamesSet);
                        const destinationUsesForwardTickets = side === 'destination' && inheritsForwardTickets;
                        const endpointAllowsMultiDestAdd = MULTI_DEST_FLOW_IDS.has(flow.id) || destinationUsesForwardTickets;
                        const addToolBlocked = isComingSoon
                          || destIsShuffleOnly
                          || sourceComingSoon
                          || (isCases && !endpointAllowsMultiDestAdd)
                          || (isCasesSourceOnly && side === 'source');
                        const endpointToggleHandler = sourceComingSoon
                          ? handleSourceComingSoon
                          : ((flow.automationLabel && !isComingSoon && !destIsShuffleOnly)
                            ? (appName: string, enabled: boolean) => handleUsecaseAppToggle(appName, enabled, destinationUsesForwardTickets
                              ? {
                                automationLabel: 'Forward Tickets',
                                automationCategory: 'cases',
                                workflows: forwardTicketsLinkedForApps,
                                enabledNamesSet: destinationEnabledNamesSet,
                                toastLabel: dynamicForwardTicketsLabel,
                              }
                              : {
                                workflows: side === 'source' ? usecaseLinkedForApps : allLinkedForApps,
                                enabledNamesSet: endpointEnabledNamesSet,
                              })
                            : undefined);

                        return (
                          <Box key={endpoint.title} sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.25 }}>
                              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: MUTED, letterSpacing: '0.1em' }}>
                                {endpoint.title}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>

                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: FG, letterSpacing: '0.02em', flexShrink: 0 }}>
                                  {endpoint.title === 'Source' && endpoint.categoryId === 'case_management' ? 'Shuffle' : (endpoint.meta?.label || 'Unknown')}
                                </Typography>
                                {endpoint.details ? (
                                  <Typography sx={{
                                    fontSize: '0.7rem',
                                    color: MUTED,
                                    lineHeight: 1.4,
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    · {endpoint.details.description.split('—')[0].trim()}
                                  </Typography>
                                ) : null}
                              </Box>
                            </Box>


                            <IntegrationStatusLite
                              key={`${endpoint.categoryId}-${integrationsRefreshKey}`}
                              filterApps={appNamesWithShuffle}
                              isResolving={!categoryAppsResolved}
                              syntheticApps={synthetic}
                              workflowAppNames={endpointWorkflowAppNames}
                              onHover={(item) => setHoveredTool((prev) => ({ ...prev, [side]: item }))}
                              onSelect={(item) => setPinnedTool((prev) => ({ ...prev, [side]: prev[side]?.id === item.id ? null : item }))}
                              selectedId={pinned?.id}
                              usecaseEnabledNames={endpointEnabledNamesSet}
                              onUsecaseAppToggle={endpointToggleHandler}
                              usecaseLabel={destinationUsesForwardTickets ? dynamicForwardTicketsLabel : (flow.id === 'case_management_cases_forward_1' ? dynamicForwardTicketsLabel : flow.label)}
                              onAddApp={addToolBlocked ? undefined : () => setAddToolFor({ side, categoryId: endpoint.categoryId, multiDest: endpointAllowsMultiDestAdd })}
                              addAppLabel={addToolBlocked ? undefined : (endpointAllowsMultiDestAdd ? 'Add destination tool (Communication or Cases)' : `Add ${endpoint.meta?.label || endpoint.title} tool`)}
                              extraTile={renderEndpointSlot && flow ? renderEndpointSlot({ flowId: flow.id, flowLabel: flow.label, side }) : undefined}
                              highlightAddApp={enableAttempted && !effectiveEnabled && (
                                (flow.id === 'case_management_cases_forward_1' || flow.id === 'case_management_communication_1')
                                  ? side === 'destination'
                                  : side === 'source' && !hasValidatedSource
                              )}

                            />
                          </Box>
                        );
                      });
                    })()}
                  </Box>
                );
              })()
            )}
          </Box>
        );
      })()}

      {flow.id !== 'case_management_incident_routing_1' && flow.id !== 'case_management_schedules_notifications_1' && flow.id !== 'case_management_asset_management_monitors_1' && (
        flow.automationArea === 'notifications'
          ? <NotificationsOutcomeBlock />
          : (flow.id === 'threat_intel_ingest_1' || flow.id === 'threat_intel_case_management_1' || flow.label === 'IOC feeds' || flow.label === 'Enrichment')
            ? (
                <>
                  <ThreatIntelReadinessBanner onOpenUsecase={onNavigateUsecase} />
                  {flow.id === 'threat_intel_ingest_1' || flow.label === 'IOC feeds'
                    ? <IocFeedsOutcomeBlock />
                    : <EnrichmentsOutcomeBlock flow={flow} />
                  }
                </>
              )
            : flow.id === 'case_management_assign_escalate_1'
              ? <AssignEscalateOutcomeBlock flow={flow} workflows={workflows} />
              : flow.id === 'case_management_agent_ai_incident_handling_1'
                ? <AssignEscalateOutcomeBlock
                  flow={{ ...flow, automationLabel: 'Assign & Escalate', automationCategory: 'cases', automationArea: 'assign_escalate' }}
                  workflows={workflows}
                />
                : (flow.id === 'siem_case_management_1' || flow.id === 'edr_case_management_1' || flow.id === 'email_case_management_1' || flow.id === 'case_management_cases_forward_1')
                  ? <WebhookExecutionsOutcomeBlock flow={flow} workflows={workflows} sourceCategoryLabel={sourceCat?.label} />
                  : resolveOutcomeKind(flow) === 'enrichments_run'
                    ? <EnrichmentsOutcomeBlock flow={flow} />
                    : <FlowOutcomeBlock flow={flow} sourceCategoryLabel={sourceCat?.label} />
      )}

      {flow.id === 'case_management_communication_1' && (
        <Box sx={{ p: 2.5, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: FG }}>
                Notification Workflow
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: MUTED, mt: 0.25 }}>
                Select which workflow handles sending notifications for incidents.
              </Typography>
            </Box>
          </Box>
          <FormControl fullWidth size="small">
            <MuiSelect
              value={notificationWorkflow?.id || ''}
              onChange={(e) => handleSelectNotificationWorkflow(e.target.value as string)}
              disabled={savingNotificationWf}
              displayEmpty
              sx={{
                bgcolor: 'hsla(0, 0%, 60%, 0.05)',
                fontSize: '0.82rem',
                color: FG,
                '& .MuiSelect-select': { py: 1, px: 1.5 },
              }}
            >
              <MenuItem value="">
                <em>None (Default system notification)</em>
              </MenuItem>
              {workflows.map((wf) => (
                <MenuItem key={wf.id} value={wf.id} sx={{ fontSize: '0.82rem' }}>
                  {wf.name || 'Untitled workflow'}
                </MenuItem>
              ))}
            </MuiSelect>
          </FormControl>
        </Box>
      )}



      {(() => {
        // Mirror the Source/Destination popover behavior — figure out which
        // apps the linked workflows currently use, and provide the same
        // enable/disable handler, so clicking an app chip in Linked Workflows
        // opens the same "Enable/Disable for {usecase}" popover as the
        // Enabled Tools area.
        // Same TRUTH source as Source/Destination: one shared helper resolves
        // every workflow that should count, then one extractor unwraps Singul
        // nodes and returns only real tool names.
        const {
          workflows: allLinkedForSet,
          forwardTicketsWorkflows: forwardTicketsForLW,
          notificationWorkflows: notifForLW,
        } = getLinkedWorkflowsForUsecase(flow, workflows, notificationWorkflow);
        const enabledNamesSetLW = getWorkflowEnabledAppNames(allLinkedForSet);
        if (allLinkedForSet.length === 0) {
          clearInjectedUsecaseApps(flow.id);
        } else {
          for (const n of readInjectedUsecaseApps(flow.id)) {
            enabledNamesSetLW.add(normalizeAppName(n));
          }
        }
        const handleUsecaseAppToggleLW = async (appName: string, enabled: boolean) => {
          if (!flow.automationLabel) {
            toast.error('This usecase is not toggleable yet');
            return;
          }
          const next = new Set(Array.from(enabledNamesSetLW));
          const key = normalizeAppName(appName);
          if (enabled) next.add(key); else next.delete(key);
          if (enabled) pushInjectedUsecaseApp(flow.id, appName);
          else removeInjectedUsecaseApp(flow.id, appName);
          // Optimistically refresh the tool strip so the change is visible
          // immediately, without waiting for the backend write.
          invalidateAppsCache(); setIntegrationsRefreshKey((k2) => k2 + 1);
          // Source of truth = the actual apps inside the linked workflow(s).
          const activeNames: string[] = [];
          const seen = new Set<string>();
          for (const wf of allLinkedForSet) {
            for (const action of (wf.actions || [])) {
              for (const n of extractActionAppNames(action)) {
                const k = normalizeAppName(n);
                if (!k || seen.has(k)) continue;
                if (!enabled && k === key) continue; // drop the one being disabled
                seen.add(k);
                activeNames.push(n);
              }
            }
          }
          if (enabled && !seen.has(key)) { activeNames.push(appName); seen.add(key); }

          try {
            const body: Record<string, string> = { label: flow.automationLabel };
            if (flow.automationCategory) body.category = flow.automationCategory;
            if (activeNames.length > 0) body.app_name = activeNames.join(',');
            else body.action_name = 'remove';
            const res = await fetch(apiUrl('/api/v2/workflows/generate'), {
              method: 'POST',
              credentials: 'include',
              headers: { ...authHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            let parsed: any = null;
            try { parsed = await res.json(); } catch { /* ignore */ }
            const ok = res.ok && parsed?.success !== false;
            if (!ok) throw new Error(parsed?.reason || `Request failed (${res.status})`);
            toast.success(enabled
              ? `${appName} enabled for ${flow.label}`
              : `${appName} disabled for ${flow.label}`);
            invalidateAppsCache(); setIntegrationsRefreshKey((k2) => k2 + 1);
            onToggled?.(flow.automationLabel, activeNames.length > 0);
          } catch (err: any) {
            // Roll back the optimistic localStorage update on failure.
            if (enabled) removeInjectedUsecaseApp(flow.id, appName);
            else pushInjectedUsecaseApp(flow.id, appName);
            invalidateAppsCache(); setIntegrationsRefreshKey((k2) => k2 + 1);
            toast.error(`Failed to ${enabled ? 'enable' : 'disable'} ${appName}`, {
              description: err?.message || 'The backend rejected the request.',
            });
          }
        };
        // The three ingest-to-case_management flows share the "Forward Tickets"
        // workflow on the destination side. Surface it here as informational
        // context — enabling a destination tool on these usecases does NOT
        // toggle Forward Tickets, but it is the workflow that does the actual
        // forwarding, so showing it makes the wiring obvious.
        const forwardTicketsWorkflows = forwardTicketsForLW;
        // Notifications: append the org's defaults.notification_workflow if not
        // already covered by tag/name matching.
        const notifWorkflows = notifForLW;
        const allLinked = allLinkedForSet;
        if (allLinked.length === 0) {
          return (
            <Box sx={{ p: 3, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 2, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em' }}>
                  Linked Workflows (0)
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: MUTED }}>
                  {flow.automationLabel ? `Matched on label "${flow.automationLabel}"` : ''}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.82rem', color: MUTED }}>
                {flow.id === 'case_management_asset_management_monitors_1'
                  ? 'No linked workflows found. Host monitors stream endpoint telemetry directly into Shuffle, and automated response workflows can be attached to trigger containment or diagnostics.'
                  : `No linked workflows found. Activate this usecase to generate the workflow for ${flow.label}.`}
              </Typography>
            </Box>
          );
        }
        const labelHint = forwardTicketsWorkflows.length > 0 && flow.automationLabel
          ? `Matched on "${flow.automationLabel}" and "Forward Tickets"`
          : notifWorkflows.length > 0
            ? 'Matched on org default notification workflow'
            : flow.automationLabel
              ? `Matched on label "${flow.automationLabel}"`
              : 'Matched on label "Forward Tickets"';
        return (
          <Box sx={{ p: 3, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em' }}>
                Linked Workflows ({allLinked.length})
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: MUTED }}>
                {labelHint}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {allLinked.map((wf) => {
                const isForwardingContext = forwardTicketsWorkflows.some((f) => f.id === wf.id);
                // Resolve the workflow's primary trigger so we can show it on
                // the left side instead of a generic lightning icon. Prefer
                // the first non-stopped trigger when there are multiple.
                const triggers: any[] = Array.isArray(wf.triggers) ? wf.triggers : [];
                const primaryTrigger = triggers.find((t: any) => (t?.status || '').toLowerCase() !== 'stopped') || triggers[0] || null;
                const triggerMeta = (() => {
                  const type = String(primaryTrigger?.trigger_type || primaryTrigger?.app_name || '').toUpperCase();
                  switch (type) {
                    case 'WEBHOOK': return { label: 'Webhook', Icon: Webhook };
                    case 'SCHEDULE': return { label: 'Schedule', Icon: Clock };
                    case 'EMAIL': return { label: 'Email', Icon: Mail };
                    case 'USERINPUT': return { label: 'User input', Icon: MessageCircleQuestion };
                    case 'SUBFLOW': return { label: 'Subflow', Icon: GitBranch };
                    case 'PIPELINE': return { label: 'Pipeline', Icon: Activity };
                    case 'MANUAL': return { label: 'Manual', Icon: MousePointerClick };
                    default: return primaryTrigger
                      ? { label: (primaryTrigger.name || 'Trigger'), Icon: Zap }
                      : { label: 'Manual', Icon: MousePointerClick };
                  }
                })();
                // Collect distinct action app names. Singul-wrapped actions
                // resolve to their inner app, so multiple Singul calls to
                // Wazuh dedupe into a single Wazuh chip.
                const actionApps: string[] = (() => {
                  const out: string[] = [];
                  const seen = new Set<string>();
                  for (const a of (wf.actions || []) as any[]) {
                    for (const n of extractActionAppNames(a)) {
                      const k = normalizeAppName(n);
                      if (!k || seen.has(k)) continue;
                      seen.add(k);
                      out.push(n);
                    }
                  }
                  return out;
                })();
                const TriggerIcon = triggerMeta.Icon;
                return (
                  <Box
                    key={wf.id}
                    component="a"
                    href={getShuffleCoreWorkflowUrl(wf.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      p: 1.25,
                      borderRadius: 1.5,
                      border: CARD_BORDER,
                      bgcolor: 'hsla(0, 0%, 60%, 0.03)',
                      textDecoration: 'none',
                      color: FG,
                      transition: 'background-color 120ms ease',
                      '&:hover': { bgcolor: `${primaryColor}0F`, borderColor: `${primaryColor}4D` },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flex: 1 }}>
                      <Box
                        title={`Trigger: ${triggerMeta.label}`}
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.5,
                          px: 0.75, py: 0.25, borderRadius: 0.75,
                          border: CARD_BORDER, bgcolor: 'hsla(0, 0%, 60%, 0.04)',
                          color: MUTED, flexShrink: 0,
                        }}
                      >
                        <TriggerIcon size={12} />
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, lineHeight: 1, color: MUTED }}>
                          {triggerMeta.label}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wf.name || 'Untitled workflow'}
                      </Typography>
                      {isForwardingContext && (
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: MUTED, px: 0.75, py: 0.15, borderRadius: 0.75, border: CARD_BORDER, flexShrink: 0 }}>
                          Forwarding context
                        </Typography>
                      )}
                    </Box>
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}
                      onClick={(e) => {
                        // The card itself is a link to shuffler.io — clicks on
                        // the app tiles should open the same popover used in
                        // Source/Destination, not navigate away.
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      {actionApps.length > 0 && (
                        <Box title={`Actions: ${actionApps.map(a => a.replace(/[_\-]+/g, ' ')).join(', ')}`} sx={{ display: 'flex', alignItems: 'center' }}>
                          <IntegrationStatusLite
                            singleLine
                            filterApps={actionApps}
                            workflowAppNames={actionApps}
                            usecaseEnabledNames={enabledNamesSetLW}
                            onUsecaseAppToggle={flow.automationLabel ? handleUsecaseAppToggleLW : undefined}
                            usecaseLabel={flow.label}
                          />
                        </Box>
                      )}
                      <ExternalLink size={13} style={{ color: MUTED, flexShrink: 0 }} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })()}

      {((showImage && flow.referenceImage) || flow.video || flow.blogpost) && (
        <Box sx={{ p: 3, borderRadius: 2, border: CARD_BORDER, bgcolor: CARD_BG, mb: 3 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', mb: 1.5 }}>
            Resources
          </Typography>
          {showImage && flow.referenceImage && (
            <Box component="a" href={flow.referenceImage} target="_blank" rel="noopener noreferrer" sx={{ display: 'block', mb: (flow.video || flow.blogpost) ? 2 : 0, borderRadius: 1.5, overflow: 'hidden', border: CARD_BORDER }}>
              <Box component="img" src={flow.referenceImage} alt={`${flow.label} reference`} loading="lazy" sx={{ display: 'block', width: '100%', height: 'auto', maxHeight: 420, objectFit: 'contain' }} />
            </Box>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {flow.video && (
              <Button href={flow.video} target="_blank" rel="noopener noreferrer" startIcon={<PlayCircle size={16} />} sx={{ textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, color: primaryColor, border: `1px solid ${primaryColor}4D`, bgcolor: `${primaryColor}0F` }}>
                Watch video
              </Button>
            )}
            {flow.blogpost && (
              <Button href={flow.blogpost} target="_blank" rel="noopener noreferrer" startIcon={<BookOpen size={16} />} sx={{ textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, color: FG, border: CARD_BORDER, bgcolor: 'hsla(0, 0%, 60%, 0.04)' }}>
                Read blogpost
              </Button>
            )}
          </Box>
        </Box>
      )}


      {/* Force-add a tool for the Source / Destination category. Mirrors
          the alluvial diagram's "+" buttons so this view stays in sync. */}
      <AppSearchDrawer
        open={addToolFor !== null}
        onClose={() => {
          setAddToolFor(null);
          // Force IntegrationStatusLite to re-fetch so a newly authenticated
          // app shows up immediately under Your Tools.
          invalidateAppsCache(); setIntegrationsRefreshKey((k) => k + 1);
        }}
        title={addToolFor?.multiDest
          ? 'Add destination tool (Communication or Cases)'
          : `Add ${addToolFor ? categoryLabel(addToolFor.categoryId) : ''} Tool`}
        subtitle="Search and authenticate an integration"
        priorityCategory={addToolFor?.multiDest ? undefined : addToolFor?.categoryId}
        initialQuery={addToolFor?.multiDest
          ? ''
          : (addToolFor ? categoryLabel(addToolFor.categoryId) : '')}
        connectionPathApps={(() => {
          if (!addToolFor) return undefined;
          const cats = addToolFor.multiDest
            ? ['case_management', 'communication']
            : [addToolFor.categoryId];
          const seen = new Set<string>();
          const apps: Array<{ name: string; icon: string; hasValidAuth?: boolean }> = [];
          for (const cat of cats) {
            for (const a of (validatedAppsByCategory[cat] || [])) {
              const key = normalizeAppName(a.name);
              if (seen.has(key)) continue;
              seen.add(key);
              apps.push({ name: a.name, icon: a.icon, hasValidAuth: true });
            }
          }
          return apps.length > 0 ? apps : undefined;
        })()}
        autoActivate
        onSelectOverride={(app: any) => {
          // Two-step UX:
          //   (1) Optimistically wire the picked app into this usecase's
          //       workflow so it appears in the Tools strip right away, and
          //   (2) Persist the choice to localStorage so it survives the
          //       handoff/reload (and shows up next session even if the
          //       backend write was still in flight).
          // We then return `false` so the AppSearchDrawer falls through to
          // opening the AppDetailDrawer (sidebar) for configuration, where
          // `autoActivate` fires the Activate button automatically.
          if (!flow) return false;
          const addTargetsForwardTickets = addToolFor?.side === 'destination'
            && USECASE_IDS_WITH_FORWARD_TICKETS_CONTEXT.has(flow.id);
          const automationLabel = addTargetsForwardTickets ? 'Forward Tickets' : flow?.automationLabel;
          const automationCategory = addTargetsForwardTickets ? 'cases' : flow?.automationCategory;
          if (!automationLabel) return false;
          const linkedForApps = addTargetsForwardTickets
            ? findWorkflowsForUsecase({ automationLabel: 'Forward Tickets', automationArea: undefined as any }, workflows)
            : findWorkflowsForUsecase(flow, workflows);
          const enabledNames = new Set<string>();
          for (const wf of linkedForApps) {
            extractWorkflowAppNames(wf).forEach((n) => enabledNames.add(n));
          }
          const newKey = normalizeAppName(app.name);
          const alreadyWired = enabledNames.has(newKey);
          pushInjectedUsecaseApp(flow.id, app.name);
          // Optimistically refresh the tool strip so the newly-picked app
          // appears immediately, before the backend write completes.
          invalidateAppsCache(); setIntegrationsRefreshKey((k) => k + 1);
          if (alreadyWired) {
            return false; // open detail drawer for configuration
          }
          enabledNames.add(newKey);
          const isMultiDest = MULTI_DEST_FLOW_IDS.has(flow.id) || addTargetsForwardTickets;
          const catalog: string[] = isMultiDest
            ? [
              ...((categoryAppNames['case_management'] || []) as string[]),
              ...((categoryAppNames['communication'] || []) as string[]),
            ]
            : [
              ...((categoryAppNames[flow.source] || []) as string[]),
              ...((categoryAppNames[flow.target] || []) as string[]),
            ];
          const activeNames: string[] = [];
          const seen = new Set<string>();
          for (const n of catalog) {
            const k = normalizeAppName(n);
            if (enabledNames.has(k) && !seen.has(k)) { activeNames.push(n); seen.add(k); }
          }
          for (const k of enabledNames) {
            if (!seen.has(k)) { activeNames.push(k); seen.add(k); }
          }
          if (!seen.has(newKey)) activeNames.push(app.name);
          const body: Record<string, string> = { label: automationLabel, app_name: activeNames.join(',') };
          if (automationCategory) body.category = automationCategory;
          fetch(apiUrl('/api/v2/workflows/generate'), {
            method: 'POST',
            credentials: 'include',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).then(async (res) => {
            let parsed: any = null;
            try { parsed = await res.json(); } catch { /* ignore */ }
            const ok = res.ok && parsed?.success !== false;
            if (!ok) {
              // Roll back the optimistic localStorage update on failure.
              removeInjectedUsecaseApp(flow.id, app.name);
              invalidateAppsCache(); setIntegrationsRefreshKey((k) => k + 1);
              toast.error(`Failed to add ${app.name}`, {
                description: parsed?.reason || `Request failed (${res.status})`,
              });
              return;
            }
            toast.success(`${app.name} added to ${addTargetsForwardTickets || flow.id === 'case_management_cases_forward_1' ? dynamicForwardTicketsLabel : flow.label}`);
            invalidateAppsCache(); setIntegrationsRefreshKey((k) => k + 1);
            onToggled?.(automationLabel, true);
          }).catch((err) => {
            // Roll back the optimistic localStorage update on failure.
            removeInjectedUsecaseApp(flow.id, app.name);
            invalidateAppsCache(); setIntegrationsRefreshKey((k) => k + 1);
            toast.error(`Failed to add ${app.name}`, {
              description: err?.message || 'The backend rejected the request.',
            });
          });
          return false; // open detail drawer for configuration
        }}
      />

    </Box>
  );
}

/**
 * Public props. All optional — when omitted, the page works standalone.
 *
 * Pass these to integrate with a host SPA that already manages auth/config:
 *   <UsecasesPage userdata={userdata} globalUrl={globalUrl} isLoaded isLoggedIn />
 */
export interface UsecasesPageProps {
  /** Override the API base URL (e.g. "https://shuffler.io"). */
  globalUrl?: string;
  /**
   * Raw `/api/v1/getinfo` response body from the host app. When provided
   * the inlined getinfo probe is skipped and this object is used directly
   * (id, username, support, api_key, …).
   */
  userdata?: UsecasesUserData | null;
  /**
   * Whether the host app's getinfo call has finished. While `false`, the
   * page treats auth state as "still resolving" and does NOT fall back to
   * its own getinfo probe — preventing duplicate requests.
   */
  isLoaded?: boolean;
  /**
   * Whether getinfo says the user is logged in. When `isLoaded` is `true`,
   * this fully overrides authentication state. Defaults to `!!userdata`.
   */
  isLoggedIn?: boolean;
  /**
   * Force the color theme of the page. Defaults to `'system'` (follows
   * `prefers-color-scheme` and any ancestor `.dark` class). Pass `'dark'`
   * or `'light'` to lock it.
   */
  theme?: 'light' | 'dark' | 'system';
  /**
   * Optional host slot rendered next to the Source/Destination title in
   * the usecase detail view. Use it to inject host-owned controls such as
   * the Webhook ingestion button without duplicating its implementation.
   */
  renderEndpointSlot?: (params: { flowId: string; flowLabel: string; side: 'source' | 'destination' }) => React.ReactNode;
  /**
   * Optional host slot rendered above the Outcome block in the detail view.
   * Use it to inject a full configuration UI (e.g. Incident Routing editor).
   */
  renderUsecaseDetailSlot?: (params: { flowId: string; flowLabel: string; onOpenModal?: (modal: string) => void }) => React.ReactNode;
  /**
   * Optional host slot that renders an inline modal for a usecase whose
   * `customAction.modal` matches. Used to embed dialogs like "Add Host"
   * directly from the usecase sidebar.
   */
  renderUsecaseActionModal?: (params: {
    modal: string;
    flowId: string;
    flowLabel: string;
    open: boolean;
    onClose: () => void;
  }) => React.ReactNode;
  /**
   * Optional host callback fired whenever a usecase automation is toggled on/off.
   */
  onToggled?: (label: string, enabled: boolean) => void;
  /**
   * Optional preloaded workflows array from the host page.
   * When provided, eliminates duplicate /api/v1/workflows fetches.
   */
  workflows?: WorkflowSummary[];
}

const recordedInterestUsecases = new Set<string>();

function resolveUsecaseBySlug(target: string, list: Usecase[]): Usecase | undefined {
  if (!target) return undefined;
  const s = slugify(target);
  return (
    list.find(u => u.label && slugify(u.label) === s) ||
    list.find(u => u.id && slugify(u.id) === s) ||
    (s === 'add-host-monitors' || s === 'host-monitors' || s === 'add-monitors' || s === 'host-monitoring'
      ? list.find(u => u.id === 'case_management_asset_management_monitors_1')
      : undefined) ||
    (s === 'phishing' || s === 'email-reports'
      ? list.find(u => u.id === 'email_case_management_1')
      : undefined) ||
    list.find(u => u.label && slugify(u.label).includes(s)) ||
    list.find(u => u.label && s.includes(slugify(u.label)))
  );
}

function UsecasesPageInner() {
  usePageTitle('Usecases');

  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<FlowPhase | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  const theme = useTheme()
  const primaryColor = theme.palette.primary.main

  const navigate = useNavigate();
  const { apiUrl, authHeader } = useApi();
  const { scopeClassName: cfgScopeClassName, onToggled: cfgOnToggled, preloadedWorkflows } = useUsecasesConfig();
  const { usecases, apiLoaded, getDrift } = useUsecasesLite();
  const { userInfo, isAuthenticated, refetch: refetchAuth } = useAuthLite();
  const { data: workflows = [], refetch: refetchWorkflows } = useWorkflowsLite(preloadedWorkflows);
  const isSupport = userInfo?.support === true;
  const [showAllAsSupport, setShowAllAsSupport] = useState(false);
  // Support-only toggle: render `referenceImage` previews on cards and at the
  // top of the detail view. Persisted so support users can hide them once and
  // forget. Default on so a freshly-authored image surfaces immediately.
  const [showUsecaseImages, setShowUsecaseImages] = useState<boolean>(() => {
    try { return localStorage.getItem('shuffle-usecase-images') !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('shuffle-usecase-images', showUsecaseImages ? 'true' : 'false'); }
    catch { /* ignore */ }
  }, [showUsecaseImages]);
  const imagesVisible = isSupport && showUsecaseImages;
  const [searchParams, setSearchParams] = useSearchParams();
  const routeParams = useParams<{ flowId?: string }>();
  const [trustedWorkflowStates, setTrustedWorkflowStates] = useState<Record<string, boolean>>({});

  // Allow deep-links like /usecases?area=automatic_ingestion&category=asset_management
  // to pre-filter the grid. Read once on mount so the user can still change
  // the filters afterwards.
  useEffect(() => {
    const area = searchParams.get('area');
    const category = searchParams.get('category');
    if (area) setAreaFilter(area);
    if (category) setCategoryFilter(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Locally-remembered usecase interests — survive the not-logged-in →
  // logged-in transition (and pre-fill before the first /getinfo lands).
  const [localInterests, setLocalInterests] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('shuffle_usecase_interests');
      const list = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  });

  // Drawer state — local source of truth so it works regardless of how the
  // host app wires routes. We still sync to/from /usecases/:flowId so refreshes
  // and deep-links open the drawer.
  //
  // URL slug convention: lowercase + underscores (e.g. /usecases/siem_alerts).
  // We still accept legacy URL-encoded labels ("SIEM%20alerts") for back-compat.
  const drawerLabel = routeParams.flowId ? decodeURIComponent(routeParams.flowId) : null;
  const [drawerFlowId, setDrawerFlowIdState] = useState<string | null>(null);
  const [displayedDrawerFlowId, setDisplayedDrawerFlowId] = useState<string | null>(null);
  useEffect(() => {
    if (drawerFlowId) setDisplayedDrawerFlowId(drawerFlowId);
  }, [drawerFlowId]);
  // When set, the drawer auto-fires Enable for this flow id once it mounts.
  const [autoEnableFlowId, setAutoEnableFlowId] = useState<string | null>(null);

  // Resolve a slug/label from the URL to a flow id once usecases load (and
  // whenever the URL segment changes). Match is permissive so deep-links keep
  // working even when the backend renames or reformats the usecase.
  // Legacy/shareable query form: /usecases?selected_object=SIEM+alerts →
  // redirect to the canonical /usecases/:slug URL so the rest of the page
  // logic only needs to handle one shape.
  useEffect(() => {
    if (routeParams.flowId) return;
    const selected = searchParams.get('selected_object') || searchParams.get('tab') || searchParams.get('flow');
    if (!selected) return;
    const slug = slugify(selected);
    if (!slug) return;
    const next = new URLSearchParams(searchParams);
    next.delete('selected_object');
    next.delete('tab');
    next.delete('flow');
    const qs = next.toString();
    const match = resolveUsecaseBySlug(selected, usecases);
    if (match) {
      setDrawerFlowIdState(match.id);
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/usecases/${slug}${qs ? `?${qs}` : ''}`);
    }
  }, [routeParams.flowId, searchParams, usecases]);

  useEffect(() => {
    if (!drawerLabel) {
      setDrawerFlowIdState(null);
      return;
    }
    const match = resolveUsecaseBySlug(drawerLabel, usecases);
    if (match) {
      setDrawerFlowIdState(match.id);
    } else if (usecases.length > 0) {
      console.warn('[UsecasesPage] No matching usecase for URL slug:', drawerLabel,
        '— available labels:', usecases.map(u => u.label));
    }
  }, [drawerLabel, usecases]);

  // Handle browser back/forward buttons smoothly without unmounting the page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/usecases' || path === '/usecases/') {
        setDrawerFlowIdState(null);
        return;
      }
      const match = path.match(/^\/usecases\/([^/]+)/);
      if (match && match[1]) {
        const flow = resolveUsecaseBySlug(decodeURIComponent(match[1]), usecases);
        if (flow) {
          setDrawerFlowIdState(flow.id);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [usecases]);

  // Synchronize workflow enable/disable state across the application
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleWorkflowToggled = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail?.label) return;
      setTrustedWorkflowStates((prev) => ({
        ...prev,
        [detail.label]: !!detail.enabled,
      }));
    };
    window.addEventListener('shuffle-workflow-toggled', handleWorkflowToggled);
    return () => window.removeEventListener('shuffle-workflow-toggled', handleWorkflowToggled);
  }, []);

  const setDrawerFlowId = (id: string | null, isActivateAction = false) => {
    setDrawerFlowIdState(id);
    const params = new URLSearchParams(searchParams);
    if (isActivateAction) {
      params.set('action', 'activate');
    } else {
      params.delete('action');
    }
    const search = params.toString() ? `?${params.toString()}` : '';
    if (!id) {
      if (typeof window !== 'undefined') {
        const target = `/usecases${search}`;
        if (window.location.pathname + window.location.search !== target) {
          window.history.pushState(null, '', target);
        }
      }
      return;
    }
    const flow = usecases.find(u => u.id === id);
    const name = flow?.label || id;
    const slug = slugify(name);
    // GA: track usecase selection — direct ReactGA call so this page stays
    // standalone (no dependency on src/lib/analytics).
    try {
      ReactGA.event({ category: 'Engagement', action: 'Select_Usecase', label: name });
    } catch { /* ignore — GA may not be initialized */ }
    // Persist locally so the "Interest shown" indicator survives the
    // not-logged-in → logged-in transition (the API call below is a no-op
    // for guests, so without this we'd lose the signal entirely).
    try {
      const raw = localStorage.getItem('shuffle_usecase_interests');
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(name)) {
        list.push(name);
        localStorage.setItem('shuffle_usecase_interests', JSON.stringify(list));
        setLocalInterests(new Set(list));
      }
    } catch { /* ignore */ }
    // Fire-and-forget API call — deduplicated to at most once per usecase per session.
    if (!recordedInterestUsecases.has(name)) {
      recordedInterestUsecases.add(name);
      try {
        fetch(apiUrl(`/api/v1/workflows/usecases/${encodeURIComponent(name)}`), {
          credentials: 'include',
          headers: { ...authHeader() },
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
    // Update browser URL without triggering TanStack route unmount / remount
    if (typeof window !== 'undefined') {
      const target = `/usecases/${slug}${search}`;
      if (window.location.pathname + window.location.search !== target) {
        window.history.pushState(null, '', target);
      }
    }
  };

  // Map: automationLabel -> whether at least one workflow exists for it.
  // Match by workflow name OR tag containing the label (case-insensitive).
  const workflowEnabledLabels = useMemo(() => {
    const set = new Set<string>();
    for (const wf of workflows) {
      const name = (wf.name || '').toLowerCase();
      const tags = (wf.tags || []).map(t => String(t).toLowerCase());
      for (const uc of usecases) {
        if (!uc.automationLabel) continue;
        const lbl = uc.automationLabel.toLowerCase();
        if (lbl === 'vulnerability correlation') {
          const hasActions = Array.isArray(wf.actions) && wf.actions.length > 0;
          if (!hasActions) continue;
        }
        const aliases = [lbl];
        if (lbl.includes('incident routing')) {
          aliases.push('incident routing', 'incident_routing', 'incident_routing_rules');
        }
        if (lbl.includes('schedules & phone') || lbl.includes('schedules_notifications') || lbl.includes('phone notification')) {
          aliases.push('schedules & phone notifications', 'schedules_&_phone_notifications', 'schedules_notifications', 'phone_notifications', 'assign & escalate', 'assign_&_escalate');
        }
        if (lbl.includes('threat feeds') || lbl.includes('ioc extraction')) {
          aliases.push('enable threat feeds', 'enable threat feeds_webhook', 'realtime ioc extraction', 'threat intel');
        }
        if (lbl.includes('vulnerabilit') && (lbl.includes('ingest') || lbl.includes('ingestion'))) {
          aliases.push('ingest vulnerabilities', 'ingest_vulnerabilities', 'vulnerabilities webhook', 'vulnerabilities_webhook');
        }
        const isMatch = aliases.some(a => {
          const isWebhookWf = name.endsWith('_webhook') || name === 'ingestion webhook' || tags.some(t => t.endsWith('_webhook'));
          if (!a.includes('webhook') && isWebhookWf) return false;
          return name === a || name.includes(a) || tags.includes(a) || tags.some(t => t.includes(a));
        });
        if (isMatch) {
          set.add(uc.automationLabel);
        }
      }
    }
    return set;
  }, [workflows, usecases]);

  useEffect(() => {
    setTrustedWorkflowStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [label, desiredEnabled] of Object.entries(prev)) {
        if (workflowEnabledLabels.has(label) === desiredEnabled) {
          delete next[label];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [workflowEnabledLabels]);

  const enabledLabels = useMemo(() => {
    const set = new Set(workflowEnabledLabels);
    for (const [label, trustedEnabled] of Object.entries(trustedWorkflowStates)) {
      if (trustedEnabled) set.add(label);
      else set.delete(label);
    }
    return set;
  }, [trustedWorkflowStates, workflowEnabledLabels]);

  // Deep-link by ?name=... — match either a usecase's label OR a workflow's
  // name/tag, and prefer usecases that are currently Enabled. Falls back to
  // the first match if none are enabled. Redirects to the canonical
  // /usecases/:slug URL so the rest of the page logic stays single-shape.
  useEffect(() => {
    if (routeParams.flowId) return;
    const rawName = searchParams.get('name');
    if (!rawName) return;
    if (!usecases || usecases.length === 0) return;
    const needle = rawName.trim().toLowerCase();
    if (!needle) return;
    const needleSlug = slugify(rawName);

    const labelMatches = usecases.filter(u => {
      const lbl = (u.label || '').toLowerCase();
      if (!lbl) return false;
      return lbl === needle || slugify(u.label || '') === needleSlug || lbl.includes(needle) || needle.includes(lbl);
    });

    const workflowMatchedLabels = new Set<string>();
    for (const wf of workflows) {
      const wname = (wf.name || '').toLowerCase();
      const tags = (wf.tags || []).map(t => String(t).toLowerCase());
      if (wname === needle || wname.includes(needle) || tags.includes(needle) || tags.some(t => t.includes(needle))) {
        for (const uc of usecases) {
          const lbl = uc.automationLabel?.toLowerCase();
          if (!lbl) continue;
          if (wname === lbl || wname.includes(lbl) || tags.includes(lbl) || tags.some(t => t.includes(lbl))) {
            workflowMatchedLabels.add(uc.id);
          }
        }
      }
    }
    const workflowMatches = usecases.filter(u => workflowMatchedLabels.has(u.id));

    const combined: typeof usecases = [];
    const seen = new Set<string>();
    for (const u of [...labelMatches, ...workflowMatches]) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      combined.push(u);
    }
    if (combined.length === 0) return;

    combined.sort((a, b) => {
      const aEn = a.automationLabel && enabledLabels.has(a.automationLabel) ? 1 : 0;
      const bEn = b.automationLabel && enabledLabels.has(b.automationLabel) ? 1 : 0;
      return bEn - aEn;
    });

    const pick = combined[0];
    const slug = slugify(pick.label || pick.id);
    const next = new URLSearchParams(searchParams);
    next.delete('name');
    const qs = next.toString();
    setDrawerFlowIdState(pick.id);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/usecases/${slug}${qs ? `?${qs}` : ''}`);
    }
  }, [routeParams.flowId, searchParams, usecases, workflows, enabledLabels]);

  // Page-level outcomes bundle — used to drive presence-based enable signals
  // (e.g. "Host Monitoring" lights up as Enabled when ≥1 host monitor is
  // actually deployed, regardless of whether a workflow exists).
  const { getOutcome: getPageOutcome } = useUsecaseOutcomes(usecases);
  const realHostCount = useHostMonitorCount();
  const monitorsDeployedCount = typeof realHostCount === 'number'
    ? realHostCount
    : (() => {
        const o = getPageOutcome('case_management_asset_management_monitors_1');
        const v = o?.extraMetrics?.[0]?.value;
        return typeof v === 'number' ? v : 0;
      })();

  // Categories (e.g. 'siem', 'edr', 'email') for which the user has at least
  // one *authenticated* / validated source-tool installed. We use this to gate
  // the visual "Enabled" state on cards: a workflow can be generated server-
  // side, but it is not actually doing anything useful until a source tool
  // can feed it. Sourced from /api/v1/apps/authentication so the signal
  // matches the IntegrationStatus indicator (green dot = validated).
  const [validatedCategories, setValidatedCategories] = useState<Set<string>>(() => getCachedValidatedCategories() || new Set());
  const [validatedAppNames, setValidatedAppNames] = useState<Set<string>>(() => getCachedValidatedAppNames() || new Set());
  useEffect(() => {
    let cancelled = false;
    const fetchValidatedCats = async () => {
      try {
        const res = await fetchAppsCached(apiUrl('/api/v1/apps/authentication'), {
          credentials: 'include',
          headers: { ...authHeader() },
        });
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body?.data || []);
        const cats = new Set<string>();
        const appNames = new Set<string>();
        for (const entry of Array.isArray(list) ? list : []) {
          // Only count fully-validated authentications — matches the green
          // dot in IntegrationStatus. An unvalidated/active one is not yet
          // a working source.
          if (entry?.validation?.valid !== true) continue;
          const app = entry?.app;
          if (!app?.name) continue;
          appNames.add(normalizeAppName(app.name));
          for (const categoryId of matchAppToCategoryList(app.name, app.categories || [])) {
            cats.add(categoryId);
          }
        }
        if (!cancelled) {
          setCachedValidatedCategories(cats);
          setCachedValidatedAppNames(appNames);
          setValidatedCategories(cats);
          setValidatedAppNames(appNames);
        }
      } catch {
        /* keep previous state */
      }
    };

    const cached = getCachedValidatedCategories();
    const cachedNames = getCachedValidatedAppNames();
    if (!cached || cached.size === 0 || !cachedNames) {
      fetchValidatedCats();
    }

    const handleInvalidate = () => {
      fetchValidatedCats();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('shuffle-apps-invalidated', handleInvalidate);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('shuffle-apps-invalidated', handleInvalidate);
      }
    };
  }, [apiUrl, authHeader]);

  // Detect whether the "Run AI Agent" automation is enabled on the
  // shuffle-security_incidents category. Powers the Agent Response usecase.
  const [aiAgentAutomationActive, setAiAgentAutomationActive] = useState(false);
  const [incidentsCategoryConfig, setIncidentsCategoryConfig] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchIncidentsCat = async () => {
      try {
        const info = localStorage.getItem('shuffle_user_info');
        const orgId = info ? JSON.parse(info)?.active_org?.id : null;
        if (!orgId) return;
        const data = await fetchCategoryAutomationsCached(
          apiUrl(`/api/v1/orgs/${orgId}/list_cache?category=shuffle-security_incidents&top=1`),
          { credentials: 'include', headers: { ...authHeader() } },
        );
        if (!data) return;
        if (!cancelled && (data?.category_config || data?.categoryConfig)) {
          setIncidentsCategoryConfig(data?.category_config || data?.categoryConfig);
        }
        const automations: any[] = data?.category_config?.automations || data?.category_config?.Automations || [];
        const active = automations.some(
          (a) => a?.enabled && (a?.type === 'ai_agent' || a?.name === 'Run AI Agent'),
        );
        if (!cancelled) setAiAgentAutomationActive(active);
      } catch {
        /* keep previous state */
      }
    };
    fetchIncidentsCat();

    const handleCatUpdate = () => {
      fetchIncidentsCat();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('shuffle-category-automations-updated', handleCatUpdate);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('shuffle-category-automations-updated', handleCatUpdate);
      }
    };
  }, [apiUrl, authHeader]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleAiToggle = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (typeof detail?.enabled === 'boolean') {
        setAiAgentAutomationActive(detail.enabled);
      }
    };
    window.addEventListener('shuffle-ai-agent-toggled', handleAiToggle);
    return () => window.removeEventListener('shuffle-ai-agent-toggled', handleAiToggle);
  }, []);

  // Detect whether the Notifications usecase is wired up:
  //   1. /api/v1/orgs/{orgId}.defaults.notification_workflow -> workflow UUID
  //   2. Fetch that workflow and check that it has at least one app wired in.
  // Presence-driven (mirrors Host-Monitors): the card shows Enabled as soon
  // as the org has a notification workflow with apps, independent of tags.
  const [notificationWorkflowReady, setNotificationWorkflowReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = localStorage.getItem('shuffle_user_info');
        const orgId = info ? JSON.parse(info)?.active_org?.id : null;
        if (!orgId) return;
        const orgData = await fetchOrgCached(apiUrl(`/api/v1/orgs/${orgId}`), {
          credentials: 'include',
          headers: { ...authHeader() },
        });
        const wfId = orgData?.defaults?.notification_workflow;
        if (!wfId || typeof wfId !== 'string') {
          if (!cancelled) setNotificationWorkflowReady(false);
          return;
        }
        const existing = workflows.find((w) => w.id === wfId);
        const wf = existing || await fetchWorkflowByIdCached(apiUrl(`/api/v1/workflows/${wfId}`), wfId, {
          credentials: 'include',
          headers: { ...authHeader() },
        });
        if (!wf) {
          if (!cancelled) setNotificationWorkflowReady(false);
          return;
        }
        const appNames = extractNotificationWorkflowAppNames(wf);
        if (!cancelled) setNotificationWorkflowReady(appNames.size > 0);
      } catch {
        /* keep previous state */
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl, authHeader, workflows]);

  // Compose the final per-flow "is enabled" predicate. A flow is shown as
  // enabled only when (a) a workflow exists for its automationLabel AND
  // (b) at least one validated source-tool covers `flow.source`. Without (b)
  // the workflow has no input and would never run, so surfacing a green
  // "Disable" button there is misleading.
  const isFlowVisuallyEnabled = React.useCallback(
    (flow: Usecase): boolean => {
      // Ingestion usecases (Email reports, SIEM alerts, EDR alerts) share the Ingest Tickets
      // workflow, but each one must be INDIVIDUALLY active based strictly on whether
      // an app in its specific source category is active (authenticated and wired into the workflow).
      // They must NOT be marked active merely because the webhook is active or because
      // the org has total incident outcomes > 0.
      if (
        flow.automationArea === 'automatic_ingestion' &&
        flow.target === 'case_management' &&
        flow.id !== 'vulnerability_ingestion_1'
      ) {
        return isIngestionUsecaseActive(flow, workflows, validatedCategories, validatedAppNames);
      }

      // Agent Response / AI Incident Handling are driven by the category
      // automation (Run AI Agent on shuffle-security_incidents), not a workflow.
      if (
        flow.id === 'case_management_agent_response_1' ||
        flow.id === 'case_management_agent_ai_incident_handling_1'
      ) return aiAgentAutomationActive;
      // Host Monitoring is presence-driven: as soon as >=1 host monitor is
      // deployed, treat it as enabled — there is no separate workflow to gate.
      if (flow.id === 'case_management_asset_management_monitors_1') {
        return monitorsDeployedCount >= 1;
      }
      // Notifications is driven by the org's `defaults.notification_workflow`
      // pointing to a workflow that has at least one app wired in.
      if (flow.id === 'case_management_communication_1') {
        return notificationWorkflowReady;
      }
      // Assign & Escalate is self-contained on the Cases category — driven
      // solely by whether the "Assign & Escalate" workflow exists, with no
      // separate source-tool requirement.
      if (flow.id === 'case_management_assign_escalate_1') {
        return !!flow.automationLabel && enabledLabels.has(flow.automationLabel);
      }
      // Forward Tickets is Cases-sourced: Shuffle itself IS the source, so
      // there is no third-party source auth to validate. It is only enabled
      // when the "Forward Tickets" workflow exists and has at least one
      // destination app wired in.
      if (flow.id === 'case_management_cases_forward_1') {
        if (!flow.automationLabel || !enabledLabels.has(flow.automationLabel)) return false;
        const forwardWf = findForwardTicketsWorkflow(workflows);
        if (!forwardWf) return false;
        const appNames = extractWorkflowAppNames(forwardWf);
        const count = (appNames as any)?.size ?? (appNames as any)?.length ?? 0;
        return count > 0;
      }
      // Incident Routing Rules requires both:
      // 1. Does the workflow exist?
      // 2. Is it in the "Automation for Incidents" category settings?
      if (flow.id === 'case_management_incident_routing_1') {
        const wf = findRoutingWorkflow(
          workflows as any,
          { singular: 'incident', plural: 'incidents' },
          'shuffle-security_incidents',
        );
        if (!wf) return false;
        if (!incidentsCategoryConfig) {
          return !!flow.automationLabel && enabledLabels.has(flow.automationLabel);
        }
        return isWorkflowHookedToCategory(wf.id, incidentsCategoryConfig);
      }
      // Schedules & Phone Notifications is Cases-sourced / schedule-driven:
      // driven solely by whether its workflow exists.
      if (flow.id === 'case_management_schedules_notifications_1') {
        return !!flow.automationLabel && enabledLabels.has(flow.automationLabel);
      }
      // Vulnerability Correlation and Vulnerability Ingestion are self-contained / schedule-driven —
      // driven solely by whether their workflows exist.
      if (flow.id === 'asset_management_case_management_vuln_1') {
        return !!flow.automationLabel && enabledLabels.has(flow.automationLabel);
      }
      if (flow.id === 'vulnerability_ingestion_1') {
        return (
          !!flow.automationLabel &&
          (enabledLabels.has(flow.automationLabel) || enabledLabels.has('vulnerabilities_webhook'))
        );
      }
      // Threat-intel usecases are presence-driven: they "work" as soon as the
      // dedicated "Realtime IOC extraction" / "Enable Threat feeds" workflow
      // is wired up.
      if (flow.source === 'threat_intel') {
        return !!flow.automationLabel && enabledLabels.has(flow.automationLabel);
      }
      if (!flow.automationLabel) {
        // Presence-based fallback: for unmanaged or external feeds without a dedicated
        // workflow label, if the outcome bundle proves data is flowing, treat it as enabled.
        const outcomeValue = getPageOutcome(flow.id)?.primary?.value;
        if (typeof outcomeValue === 'number' && outcomeValue > 0) return true;
        return false;
      }
      if (!enabledLabels.has(flow.automationLabel)) return false;
      if (!validatedCategories.has(flow.source)) return false;

      return true;
    },
    [enabledLabels, validatedCategories, validatedAppNames, workflows, aiAgentAutomationActive, monitorsDeployedCount, notificationWorkflowReady, getPageOutcome],
  );


  const handleUsecaseWorkflowGenerated = React.useCallback((label: string, enabled: boolean) => {
    setTrustedWorkflowStates((prev) => ({ ...prev, [label]: enabled }));
    invalidateAppsCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shuffle-workflow-toggled', { detail: { label, enabled } })
      );
      window.dispatchEvent(new CustomEvent('shuffle-workflows-updated'));
    }
    cfgOnToggled?.(label, enabled);
    refetchWorkflows();
    window.setTimeout(() => { refetchWorkflows(); }, 1200);
    window.setTimeout(() => { refetchWorkflows(); }, 3000);
    window.setTimeout(() => { refetchWorkflows(); }, 8000);
  }, [refetchWorkflows, cfgOnToggled]);

  // Set of usecase names the user has shown interest in. Sourced from both
  // /getinfo `.interests` (server-side, multi-device) and localStorage
  // (so guest clicks survive the login transition).
  const interestNames = useMemo(() => {
    const set = new Set<string>(localInterests);
    for (const i of userInfo?.interests || []) {
      if (i?.type !== 'usecase' || !i?.active || !i?.name) continue;
      try { set.add(decodeURIComponent(i.name)); } catch { set.add(i.name); }
    }
    return set;
  }, [userInfo?.interests, localInterests]);

  // Export the current usecase registry (with live `running` state) as JSON.
  const handleExportJson = () => {
    try {
      const json = getUsecasesJson(usecases, enabledLabels);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `automations-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Usecases exported');
    } catch (err) {
      console.error('[UsecasesPage] export failed', err);
      toast.error('Failed to export usecases');
    }
  };

  // Collect unique tags across all usecases
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    usecases.forEach((u) => u.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [usecases]);

  // Memoize workflow-derived app names and workflowsByAppName mapping so that
  // opening/closing a drawer or re-rendering UsecasesPageInner does not construct
  // fresh object/array references that trigger re-fetching in IntegrationStatusLite.
  const { selectedAppNames, selectedWorkflowsByAppName } = useMemo(() => {
    const appNameSet = new Set<string>();
    const wfMap = new Map<string, string[]>();
    for (const wf of workflows) {
      const wfLabel = wf.name || 'Untitled workflow';
      for (const n of extractWorkflowAppNames(wf)) {
        appNameSet.add(n);
        const key = normalizeAppName(n);
        const arr = wfMap.get(key) || [];
        if (!arr.includes(wfLabel)) arr.push(wfLabel);
        wfMap.set(key, arr);
      }
    }
    return {
      selectedAppNames: Array.from(appNameSet),
      selectedWorkflowsByAppName: wfMap,
    };
  }, [workflows]);

  const filtered = useMemo(() => {
    let list = filterVisibleUsecases(usecases, { isSupport, showAllAsSupport, isAuthenticated });

    if (phaseFilter !== 'all') {
      list = list.filter((u) => u.phase === phaseFilter);
    }
    if (categoryFilter !== 'all') {
      list = list.filter((u) => u.source === categoryFilter || u.target === categoryFilter);
    }
    if (areaFilter !== 'all') {
      list = list.filter((u) => u.automationArea === areaFilter);
    }
    if (tagFilter !== 'all') {
      list = list.filter((u) => u.tags.includes(tagFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.label.toLowerCase().includes(q) ||
          u.description.toLowerCase().includes(q) ||
          u.tags.some((t) => t.toLowerCase().includes(q)) ||
          categoryLabel(u.source).toLowerCase().includes(q) ||
          categoryLabel(u.target).toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, phaseFilter, categoryFilter, tagFilter, usecases, isAuthenticated, isSupport, showAllAsSupport]);

  // Group by phase in order
  const grouped = useMemo(() => {
    const phases = phaseFilter === 'all' ? FLOW_PHASES : FLOW_PHASES.filter((p) => p.id === phaseFilter);
    return phases.map((p) => ({
      ...p,
      flows: filtered.filter((f) => f.phase === p.id),
    })).filter((g) => g.flows.length > 0);
  }, [filtered, phaseFilter]);

  // Full-page detail view: ONLY /usecases/:flowId/details renders just
  // UsecaseDetailContent at full width. A plain /usecases/:flowId refresh
  // keeps the grid + drawer pattern so the surrounding app shell (sidebar,
  // header) stays visible.
  const location = useLocation();
  const isDetailsRoute = location.pathname.endsWith('/details');
  if (isDetailsRoute) {
    const detailFlow = drawerFlowId ? usecases.find(u => u.id === drawerFlowId) : null;
    const detailEnabled = detailFlow ? isFlowVisuallyEnabled(detailFlow) : false;
    const detailCanToggle = isAuthenticated && !!detailFlow?.automationLabel;
    const detailHasValidatedSource = detailFlow ? validatedCategories.has(detailFlow.source) : true;
    return (
      <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 1200, width: '100%', mx: 'auto', color: 'hsl(var(--foreground))' }}>
        <UsecaseDetailContent
          flowId={drawerFlowId ?? undefined}
          showConnectionPath
          useAlluvialDiagram
          onNavigateUsecase={(id) => {
            const f = usecases.find(u => u.id === id);
            const name = f?.label || id || '';
            navigate(`/usecases/${slugify(name)}/details`);
          }}
          usecases={usecases}
          isEnabled={detailEnabled}
          canToggle={detailCanToggle}
          isAuthenticated={isAuthenticated}
          hasValidatedSource={detailHasValidatedSource}
          onToggled={handleUsecaseWorkflowGenerated}
          workflows={workflows}
          showImage={imagesVisible}
        />
      </Box>
    );
  }


  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 1200, width: '100%', mx: 'auto', color: 'hsl(var(--foreground))' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, color: 'hsl(var(--foreground))', fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Usecases
          </Typography>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Some of Shuffle's default usecases across your security stack — grouped by implementation phase.
          </Typography>
        </Box>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {isSupport && (
            <Box
              component="button"
              onClick={handleExportJson}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1,
                borderRadius: 1.5,
                border: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500,
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                '&:hover': {
                  bgcolor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--primary) / 0.4)',
                  boxShadow: '0 2px 8px hsl(var(--primary) / 0.1)',
                },
              }}
            >
              <FileJson size={16} />
              Export JSON
            </Box>
          )}
          {(() => {
            // Always link to shuffle.security/infrastructure in a new window.
            // Outside of shuffle.security itself, restrict visibility to support users.
            const onSecurityHost = typeof window !== 'undefined' && ['shuffle.security', 'www.shuffle.security', 'security.shuffler.io'].includes(window.location.hostname);
            if (!onSecurityHost && !isSupport) return null;
            const tooltip = onSecurityHost
              ? 'Open Infrastructure'
              : 'Support-only: opens shuffle.security/infrastructure in a new tab';
            return (
              <Tooltip title={tooltip} placement="bottom" arrow>
                <Box
                  component="a"
                  href="https://shuffle.security/infrastructure"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 1,
                    borderRadius: 1.5,
                    border: '1px solid hsl(var(--border))',
                    bgcolor: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    '&:hover': {
                      bgcolor: 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--primary) / 0.4)',
                      boxShadow: '0 2px 8px hsl(var(--primary) / 0.1)',
                    },
                  }}
                >
                  <Network size={16} />
                  Infrastructure
                  <ExternalLink size={14} style={{ opacity: 0.5 }} />
                </Box>
              </Tooltip>
            );
          })()}
        </Box>
      </Box>

      {/* Selected apps — same format as the AppSearchDrawer's "Your Apps" row */}
      {isAuthenticated && (
        <Box sx={{ mb: 3 }}>
          <Typography
            sx={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              mb: 1,
              px: 1,
            }}
          >
            Selected apps
          </Typography>
          <Box
            sx={{
              p: 1,
              borderRadius: 1.5,
              border: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--card))',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <IntegrationStatusLite
                singleLine
                workflowAppNames={selectedAppNames}
                workflowsByAppName={selectedWorkflowsByAppName}
              />
            </Box>
            <Button
              component={Link}
              to="/apps?tab=all_apps"
              size="small"
              variant="outlined"
              startIcon={<Search size={14} />}
              sx={{
                flexShrink: 0,
                textTransform: 'none',
                borderColor: 'hsl(var(--border, 0 0% 20%))',
                color: 'hsl(var(--foreground, 0 0% 100%)) !important',
                bgcolor: 'transparent',
                '&:hover': {
                  borderColor: primaryColor,
                  bgcolor: `${primaryColor}1F`,
                  color: 'hsl(var(--foreground, 0 0% 100%)) !important',
                },
                '&:hover .MuiButton-startIcon': {
                  color: 'hsl(var(--foreground, 0 0% 100%))',
                },
              }}
            >
              Find apps
            </Button>
          </Box>
        </Box>
      )}

      {/* Banner */}
      {isSupport ? (
        <Box sx={{
          mb: 3, px: 2, py: 1.5, borderRadius: 1,
          bgcolor: 'hsl(45 93% 47% / 0.1)',
          border: '1px solid hsl(45 93% 47% / 0.3)',
          display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'space-between',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={14} style={{ color: 'hsl(45 93% 47%)' }} />
            <Typography variant="body2" sx={{ color: 'hsl(45 93% 47%)', fontWeight: 500 }}>
              {showAllAsSupport
                ? `Support view — showing all ${usecases.length} usecases (including ${usecases.filter(u => !u.animated).length} inactive hidden from users)`
                : `Viewing as normal user — showing ${usecases.filter(u => u.animated).length} active usecases`
              }
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={showUsecaseImages ? 'Images: on' : 'Images: off'}
              size="small"
              onClick={() => setShowUsecaseImages((v) => !v)}
              sx={{
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.7rem',
                bgcolor: showUsecaseImages ? 'hsl(var(--primary) / 0.15)' : 'hsl(0 0% 50% / 0.18)',
                color: showUsecaseImages ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                '&:hover': { bgcolor: showUsecaseImages ? 'hsl(var(--primary) / 0.25)' : 'hsl(0 0% 50% / 0.28)' },
              }}
            />
            <Chip
              label={showAllAsSupport ? 'View as user' : 'View as support'}
              size="small"
              onClick={() => setShowAllAsSupport(!showAllAsSupport)}
              sx={{
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.7rem',
                bgcolor: showAllAsSupport ? 'hsl(var(--primary) / 0.15)' : 'hsl(45 93% 47% / 0.2)',
                color: showAllAsSupport ? 'hsl(var(--primary))' : 'hsl(45 93% 47%)',
                '&:hover': { bgcolor: showAllAsSupport ? 'hsl(var(--primary) / 0.25)' : 'hsl(45 93% 47% / 0.3)' },
              }}
            />
          </Box>
        </Box>
      ) : null}


      {/* Grouped card grid */}
      {grouped.map((group) => (
        <Box key={group.id} sx={{ mb: 6 }}>
          {/* Phase header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, pt: 5 }}>
            <Chip
              label={group.step}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                height: 22,
                minWidth: 22,
                bgcolor: `hsl(var(${group.color}) / 0.15)`,
                color: `hsl(var(${group.color}))`,
              }}
            />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {group.label}
            </Typography>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              — {group.subtitle}
            </Typography>
          </Box>

          {/* Cards grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
              gap: 1.5,
            }}
          >
            {group.flows.map((flow) => (
              <UsecaseCard
                key={flow.id}
                flow={flow}
                drift={getDrift(flow.id)}
                apiLoaded={apiLoaded}
                isEnabled={isFlowVisuallyEnabled(flow)}
                hasInterest={isSupport && interestNames.has(flow.label)}
                isSupport={isSupport}
                showImage={imagesVisible}
                canToggle={isAuthenticated && !!flow.automationLabel}
                isAuthenticated={isAuthenticated}
                hasValidatedSource={validatedCategories.has(flow.source)}
                onToggled={handleUsecaseWorkflowGenerated}
                workflows={workflows}
                onClick={() => setDrawerFlowId(flow.id)}
                onEnable={() => {
                  setPendingAutoEnableFlow(flow.id);
                  setAutoEnableFlowId(flow.id);
                  setDrawerFlowId(flow.id, true);
                }}
              />

            ))}
          </Box>
        </Box>
      ))}

      {filtered.length === 0 && (
        <Typography sx={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center', py: 8 }}>
          No usecases match your search.
        </Typography>
      )}

      {/* Right-hand drawer rendering the EXACT same component as /usecases/:id */}
      <Drawer
        anchor="right"
        open={drawerFlowId !== null}
        onClose={() => setDrawerFlowId(null)}
        ModalProps={{
          disableScrollLock: true,
        }}
        PaperProps={{
          className: cfgScopeClassName,
          sx: {
            width: { xs: '100%', sm: 720, md: 900 },
            minWidth: { xs: '100vw', sm: 480, md: 640 },
            maxWidth: { xs: '100vw', sm: '90vw', md: 1000 },
            boxSizing: 'border-box',
            // Tokens resolve via the scope class on this paper. Fallback HSL
            // values guarantee the drawer is never transparent even if the
            // host CSS does not define --background / --foreground.
            bgcolor: 'hsl(var(--background, 0 0% 10%))',
            color: 'hsl(var(--foreground, 0 0% 100%))',
            backgroundImage: 'none',
          },
        }}
        sx={{
          zIndex: 10030,
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: { xs: '100%', sm: 720, md: 900 },
            minWidth: { xs: '100vw', sm: 480, md: 640 },
            maxWidth: { xs: '100vw', sm: '90vw', md: 1000 },
          },
        }}
      >
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3, py: 2,
          borderBottom: '1px solid hsl(var(--border, 0 0% 20%))',
          position: 'sticky', top: 0, zIndex: 2,
          bgcolor: 'hsl(var(--background, 0 0% 10%))',
        }}>
          <Box />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {drawerFlowId && (
              <Tooltip title="Open full page" placement="top" arrow>
                <IconButton
                  onClick={() => {
                    const id = drawerFlowId;
                    const name = usecases.find(u => u.id === id)?.label || id || '';
                    const slug = slugify(name);
                    navigate(`/usecases/${slug}/details`);
                  }}
                  size="small"
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <ExternalLink size={16} />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={() => setDrawerFlowId(null)} size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              <X size={18} />
            </IconButton>
          </Box>
        </Box>
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          {(() => {
            const effectiveFlowId = drawerFlowId || displayedDrawerFlowId;
            const drawerFlow = effectiveFlowId ? usecases.find(u => u.id === effectiveFlowId) : null;
            const drawerEnabled = drawerFlow ? isFlowVisuallyEnabled(drawerFlow) : false;
            const drawerCanToggle = isAuthenticated && !!drawerFlow?.automationLabel;
            const drawerHasValidatedSource = drawerFlow ? validatedCategories.has(drawerFlow.source) : true;
            return (
              <UsecaseDetailContent
                flowId={effectiveFlowId ?? undefined}
                hideBackNav
                showConnectionPath
                useAlluvialDiagram
                onNavigateUsecase={(id) => setDrawerFlowId(id || null)}
                usecases={usecases}
                isEnabled={drawerEnabled}
                canToggle={drawerCanToggle}
                isAuthenticated={isAuthenticated}
                hasValidatedSource={drawerHasValidatedSource}
                onToggled={handleUsecaseWorkflowGenerated}
                workflows={workflows}
                autoEnable={
                  (autoEnableFlowId !== null && (autoEnableFlowId === drawerFlowId || autoEnableFlowId === effectiveFlowId)) ||
                  getPendingAutoEnableFlow() === effectiveFlowId
                }
                onAutoEnableConsumed={() => {
                  setAutoEnableFlowId(null);
                  setPendingAutoEnableFlow(null);
                }}
                showImage={imagesVisible}
              />
            );
          })()}
        </Box>
      </Drawer>
    </Box>
  );
}


export interface UsecaseCardProps {
  flow: Usecase;
  drift?: UsecaseDrift;
  apiLoaded?: boolean;
  isEnabled: boolean;
  hasInterest?: boolean;
  isSupport?: boolean;
  /** Support-only: render the usecase's reference image as a top banner. */
  showImage?: boolean;
  canToggle: boolean;
  isAuthenticated?: boolean;
  hasValidatedSource?: boolean;
  onToggled?: (label: string, enabled: boolean) => void;
  workflows?: WorkflowSummary[];
  onClick: () => void;
  /** Optional parent handler — when provided, clicking the card's Enable
   *  button delegates to this instead of toggling inline. The list view uses
   *  this to open the detail drawer first and then auto-fire Enable inside
   *  it, so the user can watch the workflow appear in realtime. Disable
   *  still happens inline (no need for context). */
  onEnable?: () => void;
}

export function UsecaseCard({
  flow,
  drift,
  apiLoaded = true,
  isEnabled,
  hasInterest = false,
  isSupport = false,
  showImage = false,
  canToggle,
  isAuthenticated = true,
  hasValidatedSource = true,
  onToggled,
  workflows = [],
  onClick,
  onEnable,
}: UsecaseCardProps) {
  const sourceCat = categoryLabel(flow.source) || 'source';
  const isComingSoon = !ACTIVE_USECASE_IDS.includes(flow.id);
  const targetCat = categoryLabel(flow.target) || 'destination';
  const [toggling, setToggling] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const effectiveEnabled = optimisticEnabled !== null ? optimisticEnabled : isEnabled;
  const { environments } = useWorkflowHealth();
  const linkedWfs = useMemo(() => findWorkflowsForUsecase(flow, workflows), [flow, workflows]);
  const usecaseHealth = useMemo(() => diagnoseUsecase(linkedWfs, environments), [linkedWfs, environments]);
  const isBlocked = effectiveEnabled && usecaseHealth.hasProblem;
  const { apiUrl, authHeader } = useApi();

  const { plural: entityPlural } = useEntityPreference();
  const dynamicForwardTicketsLabel = useMemo(() => `Forward ${entityPlural || 'Tickets'}`, [entityPlural]);
  const cardDisplayLabel = flow.id === 'case_management_cases_forward_1' ? dynamicForwardTicketsLabel : flow.label;
  const isMonitorsFlow = flow.id === 'case_management_asset_management_monitors_1';
  const canDisable = canToggle && !isMonitorsFlow;

  const theme = useTheme()
  const primaryColor = theme.palette.primary.main
  const navigate = useNavigate();
  // Clear optimistic state only once the server has caught up. Otherwise a
  // refetch that lands before the backend finished the mutation will briefly
  // flip the button back to its previous state.
  useEffect(() => {
    if (optimisticEnabled !== null && optimisticEnabled === isEnabled) {
      setOptimisticEnabled(null);
    }
  }, [isEnabled, optimisticEnabled]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!flow.automationLabel || toggling) return;
    const willBeEnabled = !effectiveEnabled;

    // Host Monitoring is presence-driven: "activating" means deploying a host monitor
    if (flow.id === 'case_management_asset_management_monitors_1') {
      if (willBeEnabled) {
        if (onEnable) onEnable();
        else onClick();
      } else {
        toast.warning('Host Monitoring is active on your endpoints', {
          description: 'To unregister monitors or adjust monitoring groups, manage them in the Monitors view.',
          action: {
            label: 'Open Monitors',
            onClick: () => navigate('/monitors'),
          },
        });
      }
      return;
    }

    // When enabling from the list, hand off to the parent so the detail
    // drawer opens and the user can watch the workflow materialize.
    if (willBeEnabled && onEnable) {
      onEnable();
      return;
    }
    const selfContained = flow ? SELF_CONTAINED_ENABLE[flow.id] : undefined;
    if (selfContained) {
      setToggling(true);
      setOptimisticEnabled(willBeEnabled);
      try {
        const ok = willBeEnabled ? await selfContained.enable() : await selfContained.disable();
        if (!ok) throw new Error('Backend rejected the request');
        const desc = flow.id === 'case_management_agent_ai_incident_handling_1'
          ? (willBeEnabled ? 'AI Agent is now active on incoming incidents.' : 'Removed AI Agent from Incident Automation.')
          : undefined;
        toast.success(willBeEnabled ? `${cardDisplayLabel} enabled` : `${cardDisplayLabel} disabled`, {
          description: desc,
        });
        onToggled?.(flow.automationLabel, willBeEnabled);
      } catch (err: any) {
        setOptimisticEnabled(null);
        toast.error(`Failed to ${willBeEnabled ? 'enable' : 'disable'} ${cardDisplayLabel}`);
      } finally {
        setToggling(false);
      }
      return;
    }
    if (willBeEnabled && !hasValidatedSource) {
      // Hard-block — see UsecaseDetailContent.handleToggle for rationale.
      toast.error(`Authenticate a ${sourceCat} tool first`, {
        description: `${cardDisplayLabel} needs a validated ${sourceCat} integration as input. Without one, the workflow has nothing to react to and will not be created.`,
        duration: 10000,
      });
      return;
    }
    setToggling(true);
    setOptimisticEnabled(willBeEnabled);
    try {
      // Same logic as UsecaseDetailContent.handleToggle: when disabling, the
      // backing workflow may be shared with sibling usecases (SIEM / EDR /
      // Email all share "Ingest Tickets"). Strip only this usecase's source
      // apps and re-post the remainder instead of nuking the workflow.
      const requestBody: Record<string, string> = { label: flow.automationLabel };
      if (flow.automationCategory) requestBody.category = flow.automationCategory;
      if (!willBeEnabled) {
        const isShuffleSourcedFlow = flow?.id === 'case_management_cases_forward_1'
          || flow?.id === 'case_management_communication_1'
          || flow?.id === 'case_management_incident_routing_1'
          || flow?.id === 'case_management_schedules_notifications_1'
          || flow?.id === 'asset_management_case_management_vuln_1'
          || flow?.id === 'vulnerability_ingestion_1'
          || flow?.id === 'threat_intel_ingest_1'
          || flow?.id === 'threat_intel_case_management_1'
          || flow?.source === 'threat_intel';

        if (isShuffleSourcedFlow || flow.id === 'asset_management_case_management_vuln_1') {
          requestBody.action_name = 'remove';
        } else {
          const sourceToIngest: Record<string, string> = {
            email: 'email', edr: 'edr', siem: 'siem', case_management: 'cases',
          };
          const thisCat = sourceToIngest[flow.source];
          const linked = findWorkflowsForUsecase(flow, workflows);
          const currentNames: string[] = [];
          const seen = new Set<string>();
          for (const wf of linked) {
            for (const action of (wf.actions || [])) {
              for (const n of extractActionAppNames(action)) {
                const k = normalizeAppName(n);
                if (!seen.has(k)) { currentNames.push(n); seen.add(k); }
              }
            }
          }
          const remaining = currentNames.filter((n) => {
            const cat = getIngestionCategory(n);
            // Only sibling ingestion sources (siem/edr/email) justify keeping
            // the workflow alive — destination/Cases apps are shared by every
            // ingestion usecase and would falsely leave it looking enabled.
            if (!cat || cat === 'other' || cat === 'cases') return false;
            return thisCat ? cat !== thisCat : true;
          });
          if (remaining.length > 0) requestBody.app_name = remaining.join(',');
          else requestBody.action_name = 'remove';
        }
      }
      const res = await fetch(apiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      let body: any = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const reason = typeof body?.reason === 'string' ? body.reason : '';
      const ok = res.ok && body?.success !== false;
      if (!ok) {
        throw new Error(reason || `Request failed (${res.status})`);
      }
      invalidateAppsCache();
      toast.success(willBeEnabled ? `${cardDisplayLabel} enabled` : `${cardDisplayLabel} disabled`);
      onToggled?.(flow.automationLabel, willBeEnabled);
      // Hard safety net in case the server never reflects the change.
      setTimeout(() => setOptimisticEnabled(null), 8000);
    } catch (err: any) {
      setOptimisticEnabled(null);
      const raw = err?.message || '';
      const isNetwork = /failed to fetch|networkerror|load failed/i.test(raw);
      const description = isNetwork
        ? 'Could not reach the Shuffle API. Check your connection or backend status and try again.'
        : (raw || 'The backend rejected the request.');
      toast.error(`Failed to ${willBeEnabled ? 'enable' : 'disable'} ${cardDisplayLabel}`, {
        description,
        duration: 8000,
      });
    } finally {
      setToggling(false);
    }
  };


  const driftTypes = drift?.drifts ?? [];
  const showDrift = isSupport && apiLoaded && driftTypes.length > 0;
  const driftColor =
    driftTypes.includes('local_only')
      ? 'hsl(45 93% 47%)' // amber — exists locally but not in API
      : driftTypes.includes('api_only')
        ? 'hsl(199 89% 48%)' // blue — exists in API but not local
        : 'hsl(280 70% 60%)'; // purple — mismatch / description added
  const driftLabel =
    driftTypes.includes('local_only')
      ? 'Local only'
      : driftTypes.includes('api_only')
        ? 'API only'
        : driftTypes.includes('phase_mismatch')
          ? 'Phase mismatch'
          : 'Description drift';
  const driftTooltip = `Drift (support only): ${driftTypes.join(', ')}`;

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        height: '100%',
        bgcolor: isBlocked
          ? 'hsl(var(--destructive) / 0.05)'
          : effectiveEnabled
            ? 'hsl(var(--severity-low) / 0.05)'
            : 'hsl(var(--card))',
        border: isBlocked
          ? '1px solid hsl(var(--destructive) / 0.5)'
          : effectiveEnabled
            ? '1px solid hsl(var(--severity-low))'
            : showDrift
              ? `1px solid ${driftColor.replace(')', ' / 0.5)')}`
              : '1px solid hsl(var(--border))',
        boxShadow: isBlocked
          ? '0 2px 8px hsl(var(--destructive) / 0.12)'
          : effectiveEnabled
            ? '0 2px 8px hsl(var(--severity-low) / 0.12)'
            : undefined,
        transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
        '&:hover': {
          borderColor: 'hsl(var(--primary) / 0.4)',
          boxShadow: '0 2px 12px hsl(var(--primary) / 0.08)',
        },
        '@keyframes ucCardActionIn': {
          from: { opacity: 0, transform: 'scale(0.96)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
        '&:hover .uc-card-action': {
          display: 'inline-flex',
          opacity: 1,
          pointerEvents: 'auto',
          animation: 'ucCardActionIn 0.15s ease-out',
        },
      }}
    >
      <CardActionArea
        component="div"
        onClick={onClick}
        sx={{
          px: 2,
          py: '14.5px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: showImage && flow.referenceImage ? 'flex-start' : 'center',
          height: '100%',
          cursor: 'pointer',
        }}
      >
        {showImage && flow.referenceImage && (
          <Box
            component="img"
            src={flow.referenceImage}
            alt=""
            loading="lazy"
            sx={{
              display: 'block',
              width: 'calc(100% + 32px)',
              mx: -2,
              mt: '-14.5px',
              mb: 1.25,
              height: 96,
              objectFit: 'cover',
              borderBottom: '1px solid hsl(var(--border))',
            }}
          />
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
          {/* Left: Label + Route */}
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 0.25 }}>
            <Typography variant="body2" title={cardDisplayLabel} sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', fontSize: '0.82rem', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cardDisplayLabel}
            </Typography>
            {/* Source → Target */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
                {flow.source === 'case_management' ? 'Shuffle' : sourceCat}
              </Typography>
              <ArrowRight size={10} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
                {MULTI_DEST_FLOW_IDS.has(flow.id) ? 'Communication & Cases' : targetCat}
              </Typography>
            </Box>
          </Box>

          {/* Right: Badges & Unified Action / Status Chip-Button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            {showDrift && (
              <Tooltip title={driftTooltip} placement="top" arrow>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    px: 0.6,
                    py: 0.1,
                    borderRadius: 0.75,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    textTransform: 'uppercase',
                    color: driftColor,
                    bgcolor: `${driftColor.replace(')', ' / 0.12)')}`,
                    border: `1px solid ${driftColor.replace(')', ' / 0.35)')}`,
                    lineHeight: 1.4,
                  }}
                >
                  {driftLabel}
                </Box>
              </Tooltip>
            )}
            {hasInterest && (
              <Tooltip title="Interest shown (support only)" placement="top" arrow>
                <Box sx={{ display: 'inline-flex', flexShrink: 0 }}>
                  <Sparkles size={13} style={{ color: 'hsl(var(--primary))' }} />
                </Box>
              </Tooltip>
            )}

            {/* Unified Action / Status Chip-Button */}
            {effectiveEnabled ? (
              <Tooltip
                title={
                  isBlocked
                    ? `${usecaseHealth.primaryProblem?.title || 'Execution blocked'}: ${usecaseHealth.primaryProblem?.description || 'Runtime location is offline.'} Click to disable.`
                    : isMonitorsFlow
                      ? 'Host Monitoring is active on endpoints · Managed in Monitors view'
                      : canDisable
                        ? 'Automation active · Click to disable'
                        : 'Automation active'
                }
                placement="top"
                arrow
              >
                <Box
                  component="button"
                  type="button"
                  disabled={toggling}
                  onClick={
                    isMonitorsFlow
                      ? (e: React.MouseEvent) => {
                          e.stopPropagation();
                          e.preventDefault();
                          navigate('/monitors');
                        }
                      : canDisable
                        ? handleToggle
                        : undefined
                  }
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.85,
                    py: 0.2,
                    height: 22,
                    borderRadius: 0.75,
                    bgcolor: isBlocked
                      ? 'hsl(var(--destructive) / 0.12)'
                      : 'hsl(var(--severity-low) / 0.12)',
                    border: isBlocked
                      ? '1px solid hsl(var(--destructive) / 0.45)'
                      : '1px solid hsl(var(--severity-low) / 0.4)',
                    color: isBlocked
                      ? 'hsl(var(--destructive))'
                      : 'hsl(var(--severity-low))',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    lineHeight: 1,
                    cursor: isMonitorsFlow ? 'pointer' : canDisable ? (toggling ? 'default' : 'pointer') : 'default',
                    outline: 'none',
                    boxShadow: 'none',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                    '&:hover': (isMonitorsFlow || canDisable) ? {
                      bgcolor: isBlocked
                        ? 'hsl(var(--destructive) / 0.22)'
                        : 'hsl(var(--severity-low) / 0.22)',
                      borderColor: isBlocked
                        ? 'hsl(var(--destructive) / 0.7)'
                        : 'hsl(var(--severity-low) / 0.7)',
                    } : {},
                  }}
                >
                  {toggling ? (
                    <CircularProgress size={11} sx={{ color: 'inherit' }} />
                  ) : (
                    <Power size={11} style={{ color: 'inherit' }} />
                  )}
                  <span>{isBlocked ? 'Active · Blocked' : 'Active'}</span>
                </Box>
              </Tooltip>
            ) : (flow.customAction?.href || flow.customAction?.url) && (!canToggle || (flow.id !== 'threat_intel_ingest_1' && flow.id !== 'case_management_agent_ai_incident_handling_1')) ? (
              <Box
                className="uc-card-action"
                sx={{
                  display: 'none',
                  opacity: 0,
                  pointerEvents: 'none',
                  flexShrink: 0,
                }}
              >
                <Button
                  {...(flow.customAction.url
                    ? { component: 'a' as const, href: flow.customAction.url, target: '_blank', rel: 'noopener noreferrer' }
                    : { component: Link, to: flow.customAction.href! })}
                  size="small"
                  variant="contained"
                  disableElevation
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  startIcon={<ArrowRight size={11} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    minHeight: 0,
                    height: 22,
                    py: 0,
                    px: 0.85,
                    borderRadius: 0.75,
                    bgcolor: primaryColor,
                    color: '#FFFFFF',
                    '&:hover': { bgcolor: primaryColor },
                  }}
                >
                  {flow.customAction.label || 'Configure'}
                </Button>
              </Box>
            ) : isComingSoon ? (
              <Tooltip title="Coming soon" placement="top" arrow>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.4,
                    px: 0.7,
                    py: 0.15,
                    height: 22,
                    borderRadius: 0.75,
                    bgcolor: 'hsl(var(--severity-medium) / 0.08)',
                    border: '1px solid hsl(var(--severity-medium) / 0.35)',
                    color: 'hsl(var(--severity-medium))',
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    cursor: 'default',
                    flexShrink: 0,
                  }}
                >
                  <Clock size={11} style={{ color: 'inherit' }} />
                  <span>Coming soon</span>
                </Box>
              </Tooltip>
            ) : canToggle ? (
              <Box
                className="uc-card-action"
                sx={{
                  display: 'none',
                  opacity: 0,
                  pointerEvents: 'none',
                  flexShrink: 0,
                }}
              >
                <Tooltip
                  title={
                    !hasValidatedSource
                      ? `No active ${sourceCat} integration is connected. Activating will not do anything until a ${sourceCat} tool is authenticated — the workflow will be disabled again automatically.`
                      : 'Click to activate'
                  }
                  placement="top"
                  arrow
                >
                  <Box
                    component="button"
                    type="button"
                    disabled={toggling}
                    onClick={handleToggle}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 0.85,
                      py: 0.25,
                      height: 22,
                      borderRadius: 0.75,
                      bgcolor: 'hsl(var(--destructive) / 0.12)',
                      border: '1px solid hsl(var(--destructive) / 0.4)',
                      color: 'hsl(var(--destructive))',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      lineHeight: 1,
                      cursor: toggling ? 'default' : 'pointer',
                      outline: 'none',
                      boxShadow: 'none',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: 'hsl(var(--destructive) / 0.22)',
                        borderColor: 'hsl(var(--destructive) / 0.7)',
                      },
                    }}
                  >
                    {toggling ? (
                      <CircularProgress size={11} sx={{ color: 'inherit' }} />
                    ) : (
                      <Power size={11} style={{ color: 'hsl(var(--destructive))' }} />
                    )}
                    <span>Activate</span>
                  </Box>
                </Tooltip>
              </Box>
            ) : !isAuthenticated && flow.automationLabel ? (
              <Box
                className="uc-card-action"
                sx={{
                  display: 'none',
                  opacity: 0,
                  pointerEvents: 'none',
                  flexShrink: 0,
                }}
              >
                <Box
                  component={Link}
                  to={`/register?view=${encodeURIComponent(`/usecases/${slugify(flow.label)}`)}`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.85,
                    py: 0.25,
                    height: 22,
                    borderRadius: 0.75,
                    bgcolor: 'hsl(var(--destructive) / 0.12)',
                    border: '1px solid hsl(var(--destructive) / 0.4)',
                    color: 'hsl(var(--destructive))',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    lineHeight: 1,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: 'hsl(var(--destructive) / 0.22)',
                      borderColor: 'hsl(var(--destructive) / 0.7)',
                    },
                  }}
                >
                  <Power size={11} style={{ color: 'hsl(var(--destructive))' }} />
                  <span>Activate</span>
                </Box>
              </Box>
            ) : null}
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}

/**
 * Default export — wraps `UsecasesPageInner` with a config provider so host
 * apps can pass `userdata` / `globalUrl` / `isLoaded` / `isLoggedIn` props
 * exactly like the legacy Shuffle Frontend route:
 *
 *   <Route exact path="/usecases" element={
 *     <UsecasesPage userdata={userdata} globalUrl={globalUrl} isLoaded isLoggedIn />
 *   } />
 *
 * When called with no props the page falls back to standalone behavior
 * (env / hostname-derived API URL, `localStorage.shuffle_api_key` auth, and
 * an internal `/api/v1/getinfo` probe).
 */
export default function UsecasesPage(props: UsecasesPageProps = {}) {
  usePageMeta({
    title: 'Usecases',
    description: 'Browse and configure security automation usecases and data flows.',
    url: '/usecases',
  });
  useInjectScopedStyles();
  const { globalUrl, userdata, isLoaded, isLoggedIn, theme = 'system', renderEndpointSlot, renderUsecaseDetailSlot, renderUsecaseActionModal, onToggled, workflows } = props;
  // Sync host-injected `globalUrl` into the Shuffle-Core api.ts runtime so
  // every internal `getApiUrl()` call (hooks, helpers, etc.) targets the host
  // backend instead of the bundled default.
  useSyncHostBaseUrl(globalUrl);

  // Resolve the theme class applied directly on the scope wrapper. 'system'
  // means "do nothing" — let the host app's `.dark` ancestor (or none) decide.
  const themeClass =
    theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : '';

  // Detect whether the host app is driving auth/config. As soon as ANY of the
  // four props is supplied, we treat the host as the source of truth and
  // suppress the inlined getinfo probe — even while `isLoaded` is still false
  // (host's getinfo is in flight).
  const hostManaged =
    globalUrl !== undefined ||
    userdata !== undefined ||
    isLoaded !== undefined ||
    isLoggedIn !== undefined;

  const externalApiKey = userdata?.api_key || userdata?.apikey || null;
  const stableAuthHeader = React.useCallback((): Record<string, string> => {
    if (externalApiKey) return { Authorization: `Bearer ${externalApiKey}` };
    return getAuthHeader();
  }, [externalApiKey]);

  const config = React.useMemo<UsecasesPageConfig>(() => {
    const baseUrl = (globalUrl && globalUrl.replace(/\/+$/, '')) || DEFAULT_API_BASE_URL;
    const externalUserInfo = userdata ?? null;

    // Auth state mirrors the host: only authenticated once getinfo finished
    // (`isLoaded === true`) AND `isLoggedIn` is true (or, if `isLoggedIn` was
    // omitted, `userdata` is present).
    const loaded = isLoaded !== false; // default true when undefined
    const loggedIn =
      typeof isLoggedIn === 'boolean' ? isLoggedIn : !!userdata;
    const externalIsAuthenticated = hostManaged ? loaded && loggedIn : false;

    return {
      baseUrl,
      authHeader: stableAuthHeader,
      hasExternalAuth: hostManaged,
      externalUserInfo,
      externalIsAuthenticated,
      isLoaded: loaded,
      renderEndpointSlot,
      renderUsecaseDetailSlot,
      renderUsecaseActionModal,
      onToggled,
      preloadedWorkflows: workflows,
      scopeClassName: themeClass ? `${SCOPE_CLASS} ${themeClass}` : SCOPE_CLASS,
    };
  }, [globalUrl, userdata, isLoaded, isLoggedIn, hostManaged, renderEndpointSlot, renderUsecaseDetailSlot, renderUsecaseActionModal, onToggled, workflows, themeClass, stableAuthHeader]);

  return (
    <UsecasesPageConfigContext.Provider value={config}>
      <div className={themeClass ? `${SCOPE_CLASS} ${themeClass}` : SCOPE_CLASS}>
        <UsecasesPageInner />
      </div>
    </UsecasesPageConfigContext.Provider>
  );
}

// ============================================================================
// UsecaseDrawer — standalone, embeddable version of the right-hand usecase
// detail drawer that lives inside the Usecases page. Hosts (e.g. the
// Security Operations dashboard) mount this to open a specific usecase in
// place instead of navigating away to /usecases.
//
// Accepts the SAME host props as <UsecasesPage> (globalUrl, userdata,
// isLoaded, isLoggedIn, theme, renderEndpointSlot, renderUsecaseDetailSlot)
// so wiring is identical everywhere.
// ============================================================================
export interface UsecaseDrawerProps extends UsecasesPageProps {
  /** Controls visibility. */
  open: boolean;
  /** Close handler — fired by the X button and outside-click. */
  onClose: () => void;
  /** Which usecase to render. Use the canonical flow id (e.g.
   *  'siem_case_management_1'). When null/undefined the drawer renders empty. */
  flowId?: string | null;
  /** Optional width override. Defaults match the inline drawer in /usecases. */
  width?: number | { xs?: string | number; sm?: number; md?: number };
  /** Optional min-width override. Defaults match the inline drawer in /usecases. */
  minWidth?: number | { xs?: string | number; sm?: number; md?: number };
  /** Optional max-width override. Defaults match the inline drawer in /usecases. */
  maxWidth?: number | { xs?: string | number; sm?: number; md?: number };
}

function UsecaseDrawerInner({
  open,
  onClose,
  flowId,
  width,
  minWidth,
  maxWidth,
}: {
  open: boolean;
  onClose: () => void;
  flowId: string | null;
  width?: number | { xs?: string | number; sm?: number; md?: number };
  minWidth?: number | { xs?: string | number; sm?: number; md?: number };
  maxWidth?: number | { xs?: string | number; sm?: number; md?: number };
}) {
  const navigate = useNavigate();
  const { apiUrl, authHeader } = useApi();
  const { usecases } = useUsecasesLite();
  const { isAuthenticated } = useAuthLite();
  const { scopeClassName: cfgScopeClassName, preloadedWorkflows } = useUsecasesConfig();
  const { data: workflows = [], refetch: refetchWorkflows } = useWorkflowsLite(preloadedWorkflows);

  // Simplified mirror of UsecasesPageInner.workflowEnabledLabels — good enough
  // for the standalone drawer (presence-based gates like agent-response /
  // monitor count are out of scope here; opening the drawer is the user's
  // entry point into the full Usecases page if they want richer state).
  const enabledLabels = useMemo(() => computeEnabledLabels(workflows, usecases), [workflows, usecases]);

  // Fetch validated source categories (same call as UsecasesPageInner). Skips
  // out gracefully if the user is not authenticated.
  const [validatedCategories, setValidatedCategories] = useState<Set<string>>(() => getCachedValidatedCategories() || new Set());
  const [validatedAppNames, setValidatedAppNames] = useState<Set<string>>(() => getCachedValidatedAppNames() || new Set());
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const fetchValidatedCats = async () => {
      try {
        const res = await fetchAppsCached(apiUrl('/api/v1/apps/authentication'), {
          credentials: 'include',
          headers: { ...authHeader() },
        });
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body?.data || []);
        const cats = new Set<string>();
        const appNames = new Set<string>();
        for (const entry of Array.isArray(list) ? list : []) {
          if (entry?.validation?.valid !== true) continue;
          const app = entry?.app;
          if (!app?.name) continue;
          appNames.add(normalizeAppName(app.name));
          for (const categoryId of matchAppToCategoryList(app.name, app.categories || [])) {
            cats.add(categoryId);
          }
        }
        if (!cancelled) {
          setCachedValidatedCategories(cats);
          setCachedValidatedAppNames(appNames);
          setValidatedCategories(cats);
          setValidatedAppNames(appNames);
        }
      } catch { /* keep previous */ }
    };

    const cached = getCachedValidatedCategories();
    const cachedNames = getCachedValidatedAppNames();
    if (!cached || cached.size === 0 || !cachedNames) {
      fetchValidatedCats();
    }
    const handleInvalidate = () => {
      fetchValidatedCats();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('shuffle-apps-invalidated', handleInvalidate);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('shuffle-apps-invalidated', handleInvalidate);
      }
    };
  }, [isAuthenticated, apiUrl, authHeader]);

  const [activeFlowId, setActiveFlowId] = useState<string | null>(flowId);
  useEffect(() => { setActiveFlowId(flowId); }, [flowId]);

  const flow = activeFlowId ? usecases.find(u => u.id === activeFlowId) : null;
  const isEnabled = flow ? isUsecaseFlowEnabled(flow, workflows, enabledLabels, validatedCategories, validatedAppNames) : false;
  const canToggle = isAuthenticated && !!flow?.automationLabel;
  const hasValidatedSource = flow ? validatedCategories.has(flow.source) : true;

  const handleToggled = React.useCallback(() => {
    // Mirror handleUsecaseWorkflowGenerated: nudge workflows refetch so the
    // drawer reflects the new state without requiring a page refresh.
    window.setTimeout(() => { refetchWorkflows(); }, 3000);
    window.setTimeout(() => { refetchWorkflows(); }, 8000);
  }, [refetchWorkflows]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{
        disableScrollLock: true,
      }}
      PaperProps={{
        className: cfgScopeClassName,
        sx: {
          width: width || { xs: '100%', sm: 720, md: 900 },
          minWidth: minWidth || { xs: '100vw', sm: 480, md: 640 },
          maxWidth: maxWidth || { xs: '100vw', sm: '90vw', md: 1000 },
          boxSizing: 'border-box',
          bgcolor: 'hsl(var(--background, 0 0% 10%))',
          color: 'hsl(var(--foreground, 0 0% 100%))',
          backgroundImage: 'none',
        },
      }}
      sx={{
        zIndex: 10030,
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: width || { xs: '100%', sm: 720, md: 900 },
          minWidth: minWidth || { xs: '100vw', sm: 480, md: 640 },
          maxWidth: maxWidth || { xs: '100vw', sm: '90vw', md: 1000 },
        },
      }}
    >
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3, py: 2,
        borderBottom: '1px solid hsl(var(--border, 0 0% 20%))',
        position: 'sticky', top: 0, zIndex: 2,
        bgcolor: 'hsl(var(--background, 0 0% 10%))',
      }}>
        <Box />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {activeFlowId && (
            <Tooltip title="Open full page" placement="top" arrow>
              <IconButton
                onClick={() => {
                  const id = activeFlowId;
                  const name = usecases.find(u => u.id === id)?.label || id || '';
                  const slug = slugify(name);
                  navigate(`/usecases/${slug}/details`);
                  onClose();
                }}
                size="small"
                sx={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <ExternalLink size={16} />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            <X size={18} />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <UsecaseDetailContent
          flowId={activeFlowId ?? undefined}
          hideBackNav
          showConnectionPath
          useAlluvialDiagram
          onNavigateUsecase={(id) => setActiveFlowId(id || null)}
          usecases={usecases}
          isEnabled={isEnabled}
          canToggle={canToggle}
          isAuthenticated={isAuthenticated}
          hasValidatedSource={hasValidatedSource}
          onToggled={handleToggled}
          workflows={workflows}
        />
      </Box>
    </Drawer>
  );
}

/**
 * Standalone usecase drawer. Wraps `UsecaseDetailContent` in the same
 * scoped style + auth/config provider as the Usecases page so it renders
 * identically when mounted anywhere (dashboards, deep-link triggers, etc.).
 */
export function UsecaseDrawer(props: UsecaseDrawerProps) {
  useInjectScopedStyles();
  const {
    open,
    onClose,
    flowId = null,
    width,
    minWidth,
    maxWidth,
    globalUrl,
    userdata,
    isLoaded,
    isLoggedIn,
    theme = 'system',
    renderEndpointSlot,
    renderUsecaseDetailSlot,
    renderUsecaseActionModal,
    onToggled,
    workflows,
  } = props;
  useSyncHostBaseUrl(globalUrl);

  const themeClass = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : '';

  const hostManaged =
    globalUrl !== undefined ||
    userdata !== undefined ||
    isLoaded !== undefined ||
    isLoggedIn !== undefined;

  const externalApiKey = userdata?.api_key || userdata?.apikey || null;
  const stableAuthHeader = React.useCallback((): Record<string, string> => {
    if (externalApiKey) return { Authorization: `Bearer ${externalApiKey}` };
    return getAuthHeader();
  }, [externalApiKey]);

  const config = React.useMemo<UsecasesPageConfig>(() => {
    const baseUrl = (globalUrl && globalUrl.replace(/\/+$/, '')) || DEFAULT_API_BASE_URL;
    const externalUserInfo = userdata ?? null;
    const loaded = isLoaded !== false;
    const loggedIn = typeof isLoggedIn === 'boolean' ? isLoggedIn : !!userdata;
    const externalIsAuthenticated = hostManaged ? loaded && loggedIn : false;
    return {
      baseUrl,
      authHeader: stableAuthHeader,
      hasExternalAuth: hostManaged,
      externalUserInfo,
      externalIsAuthenticated,
      isLoaded: loaded,
      renderEndpointSlot,
      renderUsecaseDetailSlot,
      renderUsecaseActionModal,
      onToggled,
      preloadedWorkflows: workflows,
      scopeClassName: themeClass ? `${SCOPE_CLASS} ${themeClass}` : SCOPE_CLASS,
    };
  }, [globalUrl, userdata, isLoaded, isLoggedIn, hostManaged, renderEndpointSlot, renderUsecaseDetailSlot, renderUsecaseActionModal, onToggled, workflows, themeClass, stableAuthHeader]);

  return (
    <UsecasesPageConfigContext.Provider value={config}>
      <div className={themeClass ? `${SCOPE_CLASS} ${themeClass}` : SCOPE_CLASS}>
        <UsecaseDrawerInner
          open={open}
          onClose={onClose}
          flowId={flowId}
          width={width}
          minWidth={minWidth}
          maxWidth={maxWidth}
        />
      </div>
    </UsecasesPageConfigContext.Provider>
  );
}
