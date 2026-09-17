import { Rocket as RocketLaunchIcon, RotateCcw as RestoreIcon, X as CloseIcon, Network as AccountTreeIcon, Route as RouteIcon, Webhook as WebhookIcon, Lock as EnhancedEncryptionIcon, Trash2 as DeleteSweepIcon, Shield as SecurityIcon, ChevronDown as ExpandMoreIcon, Download as DownloadIcon, Plus as AddIcon, Settings as SettingsIcon } from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from '@/lib/router-compat';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Divider,
  CircularProgress,
  Checkbox,
  TextField,
  Autocomplete,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  FormControlLabel,
  Switch,
  Tooltip,
} from '@mui/material';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import { toast } from 'react-toastify';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import PopupTextEditor from './PopupTextEditor';
import AppSearchDrawer from '@/Shuffle-MCPs/views/AppSearchDrawer';
import AiAgentPromptsEditor from '@/Shuffle-MCPs/components/AiAgentPromptsEditor';
import { AgentPresets, AGENT_PRESETS, AgentPreset } from '@/Shuffle-MCPs/components/AgentPresets';
import { useAuthenticatedApps } from '../useAuthenticatedApps';

import { CategoryAutomation, DATASTORE_CATEGORIES, getDatastoreByCategory, RBACConfig } from '@/Shuffle-MCPs/datastore';
import { ShareAccessModal } from '@/components/common/ShareAccessModal';
import { IncidentRoutingEditor } from '@/components/settings/IncidentRoutingEditor';
import { useIsSupport } from '@/hooks/useIsSupport';
import { extractValidatedIngestionApps, ValidatedIngestionApp, findIngestTicketsWorkflow, extractWorkflowAppNames } from '@/Shuffle-MCPs/ingestionDetection';
import { fetchAuthenticatedApps } from '@/Shuffle-MCPs/authenticatedApps';
import { fetchAppsCached, fetchWorkflowsCached } from '../views/appsFetchCache';

// API format for automations
interface AutomationApiFormat {
  name: string;
  description: string;
  options: { key: string; value: string; apps?: string[] | null; template?: string; skill?: string }[];
  icon: string;
  enabled: boolean;
  type?: string;
  disabled?: boolean;
}

interface Workflow {
  id: string;
  name: string;
}

export interface CategoryAutomationsDialogProps {
  open: boolean;
  onClose: () => void;
  category: string;
  automations: CategoryAutomation[] | null;
  onAutomationsChange: (automations: CategoryAutomation[]) => void;
  initialSettings?: { timeout?: number; public?: boolean; rbac?: RBACConfig | null };
  onSaved?: () => void;
  entityLabel?: { singular: string; plural: string };
  /** Explicit org id to save against. Falls back to reading
   *  `shuffle_user_info` from localStorage (shuffle-security's own auth
   *  storage) when omitted — pass this explicitly on hosts that don't use
   *  that storage key (e.g. shaffuru). */
  orgId?: string | null;
  /** Which view to start on: 'automations' or 'settings'. Defaults to 'automations'. */
  initialView?: 'automations' | 'settings';
  /** Whether to show the top-right swap icon button to toggle between views. Defaults to true. */
  showViewToggle?: boolean;
}

/** Datastore categories Shuffle Security supports automation for. All of these
 *  are pre-loaded (top=1 lookup) when the dialog opens so the "When" dropdown
 *  can show which ones already have automation enabled and swap between them. */
const CATEGORY_OPTIONS: { category: string; singular: string; plural: string }[] = [
  { category: DATASTORE_CATEGORIES.INCIDENTS, singular: 'incident', plural: 'incidents' },
  { category: DATASTORE_CATEGORIES.VULNERABILITIES, singular: 'vulnerability', plural: 'vulnerabilities' },
  { category: DATASTORE_CATEGORIES.INFRASTRUCTURE, singular: 'sensor', plural: 'sensors' },
  { category: DATASTORE_CATEGORIES.ASSETS, singular: 'asset', plural: 'assets' },
  { category: DATASTORE_CATEGORIES.PACKAGES, singular: 'package', plural: 'packages' },
  { category: DATASTORE_CATEGORIES.SOFTWARE, singular: 'software', plural: 'software' },
  { category: DATASTORE_CATEGORIES.USERS, singular: 'user', plural: 'users' },
];


interface CategoryEntry {
  automations: CategoryAutomation[] | null;
  settings?: { timeout?: number; public?: boolean; rbac?: RBACConfig | null };
}

const WEEKS_OPTIONS = [
  { label: 'Never', seconds: 0 },
  { label: '1 week', seconds: 604800 },
  { label: '2 weeks', seconds: 1209600 },
  { label: '4 weeks', seconds: 2419200 },
  { label: '8 weeks', seconds: 4838400 },
  { label: '12 weeks', seconds: 7257600 },
  { label: '26 weeks', seconds: 15724800 },
  { label: '52 weeks', seconds: 31449600 },
  { label: '104 weeks', seconds: 62899200 },
  { label: '156 weeks', seconds: 94348800 },
];

/** Blank/undefined = Never. Anything under 60s is also treated as Never.
 *  Any other value is kept as-is (a custom option is rendered for it) so we
 *  never silently misrepresent the stored timeout. */
const normalizeCleanupTimeout = (raw: unknown): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60) return 0;
  return n;
};

const formatCustomTimeout = (seconds: number): string => {
  const weeks = seconds / 604800;
  const rounded = Math.round(weeks * 10) / 10;
  return `${rounded} week${rounded === 1 ? '' : 's'}`;
};

const automationConfigs = [
  {
    type: 'ai_agent',
    name: 'Run AI Agent',
    description: 'Runs an AI Agent to process the updated value. Uses built-in ShuffleAI configs. Learn more: https://shuffler.io/docs/AI',
    icon: (props: any) => <AgentIcon size={props?.sx?.fontSize || 20} />,
    color: '#10b981',
    apiIcon: '',
    apiType: 'singul',
    optionKey: 'prompts',
    hasConfig: true,
  },
  {
    type: 'workflow',
    name: 'Run workflow',
    description: 'Runs one or more workflows with the updated value as runtime argument',
    icon: AccountTreeIcon,
    color: '#3b82f6',
    apiIcon: '',
    optionKey: 'workflow_id',
    hasConfig: true,
  },
  {
    type: 'webhook',
    name: 'Send webhook',
    description: 'Sends the updated value to a specified webhook URL as a POST request',
    icon: WebhookIcon,
    color: '#8b5cf6',
    apiIcon: '',
    optionKey: 'webhook_url',
    hasConfig: true,
  },
  {
    type: 'enrich',
    name: 'Enrich',
    description: "Enriches the data. Only runs on valid JSON data AND if the 'enrichment' field does not exist.",
    icon: EnhancedEncryptionIcon,
    color: '#f59e0b',
    apiIcon: '/images/logos/singul.svg',
    apiType: 'singul',
    hasConfig: false,
  },
  {
    type: 'security_rules',
    name: 'Security Rules',
    description: 'Describes security rules that are validated BEFORE an update occurs. This is in order for bad writes to be avoided. Control: allow, deny, merge, overwrite. Logic: if, or, and. Functions: same_shape, is_superset, has_deleted_field',
    icon: SecurityIcon,
    color: '#3b82f6',
    apiIcon: '',
    apiType: '',
    optionKey: 'rule',
    hasConfig: true,
  },
];

const getOrgId = (): string | null => {
  try {
    const userInfo = localStorage.getItem('shuffle_user_info');
    if (userInfo) {
      const parsed = JSON.parse(userInfo);
      return parsed.active_org?.id || null;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
};

const DEFAULT_INCIDENT_AI_PROMPTS: string[] = [
  `Triage, investigate, and respond holistically to this incident.

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

Update the internal shuffle datastore with the same key and category 'shuffle-security_incidents'. CRITICAL: You MUST ONLY send the specific fields that require a change. NEVER send or echo unchanged fields (such as unchanged tasks, activity, severity, or metadata). Do NOT overwrite unrelated fields.`,
];
const DEFAULT_INCIDENT_AI_APPS: string[][] = [['48793430d21468f9e371ace402efcd8e', 'b82668d868f6dc7ac1dc14caa92c674b']];

const DEFAULT_VULNERABILITY_AI_PROMPTS: string[] = [
  `Review, analyze, and remediate this vulnerability. Follow this evaluation process:

1. CLARIFY & DEMYSTIFY:
- Explain what this CVE/vulnerability actually means in plain, direct language.
- Identify the exploit mechanism (e.g. remote code execution, SQLi, authentication bypass, DoS, privilege escalation) and attack prerequisites (e.g. unauthenticated network access vs. local privileged access).

2. REAL-WORLD RISK & EXPLOITABILITY:
- Evaluate exploitability: identify affected package versions, attack vector, and prerequisites.
- Assess asset context: determine if the affected software/system is internet-facing or isolated internally.
- Classify urgency: Immediate Patching, Next Maintenance Window, Scheduled Backlog, or False Positive / Not Applicable.

3. ACTIONABLE REMEDIATION & MITIGATION:
- Provide exact, copy-pasteable update commands for the package/system (e.g. apt, dnf, apk, npm, pip, docker) to reach a patched version.
- If patching is immediately disruptive or requires a maintenance window, provide concrete temporary workarounds, configuration tweaks, or compensating controls (e.g. firewall/WAF rule, disabling unused vulnerable features).

4. VERIFICATION & DOCUMENTATION:
- Specify how to verify the fix (package query, service status, vulnerability rescan).
- Update the internal datastore with category 'shuffle-security_vulns' and key. ONLY update modified fields in JSON format.`,
];
const DEFAULT_VULNERABILITY_AI_APPS: string[][] = [['shuffle_vulnerabilities', 'shuffle_software_and_packages', 'b82668d868f6dc7ac1dc14caa92c674b']];

const DEFAULT_AI_PROMPTS = DEFAULT_INCIDENT_AI_PROMPTS;
const DEFAULT_AI_APPS = DEFAULT_INCIDENT_AI_APPS;

export const CategoryAutomationsDialog: React.FC<CategoryAutomationsDialogProps> = ({
  open,
  onClose,
  category,
  automations: initialAutomations,
  onAutomationsChange,
  initialSettings,
  onSaved,
  entityLabel,
  orgId: orgIdProp,
  initialView = 'automations',
  showViewToggle = true,
}) => {
  // Which view is active: 'automations' or 'settings'
  const [currentView, setCurrentView] = useState<'automations' | 'settings' | 'routing'>(initialView);

  // Sync view when dialog opens or initialView changes
  useEffect(() => {
    if (open) {
      setCurrentView(initialView);
    }
  }, [open, initialView]);

  // Which category the dialog is currently editing. Starts at the category the
  // host opened it with, but can be swapped through the "When" dropdown.
  const [activeCategory, setActiveCategory] = useState<string>(category);
  const [categoryEntries, setCategoryEntries] = useState<Record<string, CategoryEntry>>({});
  const [loadingCategories, setLoadingCategories] = useState(false);

  const categoryOptions = useMemo(() => {
    const opts = [...CATEGORY_OPTIONS];
    if (!opts.some(o => o.category === category)) {
      opts.unshift({
        category,
        singular: entityLabel?.singular || category,
        plural: entityLabel?.plural || category,
      });
    }
    return opts;
  }, [category, entityLabel?.singular, entityLabel?.plural]);

  const activeOption = categoryOptions.find(o => o.category === activeCategory) || categoryOptions[0];
  const entitySingular =
    (activeCategory === category ? entityLabel?.singular : undefined) || activeOption?.singular || 'incident';
  const entityPlural =
    (activeCategory === category ? entityLabel?.plural : undefined) || activeOption?.plural || 'incidents';
  const entitySingularCap = entitySingular.charAt(0).toUpperCase() + entitySingular.slice(1);
  const entityPluralCap = entityPlural.charAt(0).toUpperCase() + entityPlural.slice(1);
  // Support-only: routing rules view. Category the backing routing workflow
  // is generated for — incidents use the legacy "cases" category.
  const isSupportUser = useIsSupport();
  const routingGenerateCategory =
    activeCategory === DATASTORE_CATEGORIES.INCIDENTS ? 'cases' : activeCategory;
  const navigate = useNavigate();
  const [automations, setAutomations] = useState<CategoryAutomation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [cleanupTimeout, setCleanupTimeout] = useState<number>(0);
  const [categoryTimeout, setCategoryTimeout] = useState<number>(0);
  const [isCategoryPublic, setIsCategoryPublic] = useState<boolean>(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [selectedWorkflows, setSelectedWorkflows] = useState<Workflow[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [ingestionApps, setIngestionApps] = useState<ValidatedIngestionApp[]>([]);
  const [securityRulesText, setSecurityRulesText] = useState('');
  const [aiAgentPrompts, setAiAgentPrompts] = useState<string[]>(['']);
  /** Per-prompt allow-list of app names. Indices align with aiAgentPrompts. */
  const [aiAgentApps, setAiAgentApps] = useState<string[][]>([[]]);
  const [aiAgentSkill, setAiAgentSkill] = useState<string>('incident-response');

  const selectedSkillPreset = useMemo(() => {
    if (!aiAgentSkill) return null;
    return (
      AGENT_PRESETS.find(
        (p) =>
          p.id === aiAgentSkill ||
          (aiAgentSkill === 'incident-handler' && p.id === 'incident-response') ||
          (aiAgentSkill === 'vulnerability-agent' && p.id === 'vulnerability') ||
          (aiAgentSkill === 'vulnerability-management' && p.id === 'vulnerability') ||
          (aiAgentSkill === 'workflow-edit' && p.id === 'build-workflows') ||
          (aiAgentSkill === 'computer-use' && p.id === 'host-monitor-control'),
      ) || null
    );
  }, [aiAgentSkill]);

  const handleSelectSkillPreset = (preset: AgentPreset) => {
    setAiAgentSkill(preset.id);
    setHasChanges(true);

    const isEmptyPrompt =
      aiAgentPrompts.length === 0 ||
      (aiAgentPrompts.length === 1 && !aiAgentPrompts[0].trim());

    if (preset.id === 'incident-response') {
      if (isEmptyPrompt) {
        setAiAgentPrompts([...DEFAULT_INCIDENT_AI_PROMPTS]);
        setAiAgentApps(DEFAULT_INCIDENT_AI_APPS.map((a) => [...a]));
      }
    } else if (preset.id === 'vulnerability') {
      if (isEmptyPrompt) {
        setAiAgentPrompts([...DEFAULT_VULNERABILITY_AI_PROMPTS]);
        setAiAgentApps(DEFAULT_VULNERABILITY_AI_APPS.map((a) => [...a]));
      }
    } else {
      if (isEmptyPrompt && preset.defaultPrompt) {
        setAiAgentPrompts([preset.defaultPrompt]);
        if (preset.defaultApps && preset.defaultApps.length > 0) {
          setAiAgentApps([preset.defaultApps.map((a) => a.name)]);
        }
      }
    }
  };

  const handleRemoveSkillPreset = () => {
    setAiAgentSkill('');
    setHasChanges(true);
  };

  const [appPickerForIdx, setAppPickerForIdx] = useState<number | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [categoryRBAC, setCategoryRBAC] = useState<RBACConfig | null>(null);
  const { data: authenticatedApps = [] } = useAuthenticatedApps();
  /** Lookup table for app metadata (image, display name) keyed by both
   *  app ID and app name, so that legacy stored values still resolve. */
  const appMetaById = React.useMemo(() => {
    const map = new Map<string, { name: string; image: string }>();
    authenticatedApps.forEach((a: any) => {
      const name = a?.app?.name;
      const id = a?.app?.id || a?.id;
      const image = a?.app?.large_image || a?.app?.small_image || '';
      if (id && !map.has(id)) map.set(id, { name: name || id, image });
      if (name && !map.has(name)) map.set(name, { name, image });
    });
    return map;
  }, [authenticatedApps]);

  /** Algolia-fetched metadata for app IDs that are NOT in the authenticated
   *  list (allowed apps may include catalog-only apps). Cached for the
   *  lifetime of the component. */
  const [algoliaAppMeta, setAlgoliaAppMeta] = useState<Record<string, { name: string; image: string }>>({});
  useEffect(() => {
    // Collect all IDs currently referenced that we don't know yet
    const allIds = new Set<string>();
    aiAgentApps.forEach(arr => arr.forEach(id => { if (id) allIds.add(id); }));
    const missing = [...allIds].filter(id =>
      !appMetaById.has(id) && !algoliaAppMeta[id] && /^[a-f0-9]{16,}$/i.test(id),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolved: Record<string, { name: string; image: string }> = {};

      // Pass 1 — local /api/v1/apps cache. Covers built-in / locally installed
      // apps (e.g. Shuffle Datastore) that aren't in the authenticated list
      // and works even when Algolia is blocked/offline.
      try {
        const { fetchAppsViaApiConfig } = await import('@/Shuffle-MCPs/appsCache');
        const apps = await fetchAppsViaApiConfig();
        if (!cancelled && Array.isArray(apps)) {
          const byId = new Map<string, any>();
          for (const a of apps) if (a?.id) byId.set(String(a.id), a);
          for (const id of missing) {
            const hit = byId.get(id);
            if (hit) {
              resolved[id] = {
                name: hit.name || id,
                image: hit.large_image || hit.image_url || hit.image || '',
              };
            }
          }
        }
      } catch { /* fall through to Algolia */ }

      // Pass 2 — Algolia for anything still missing.
      const stillMissing = missing.filter(id => !resolved[id]);
      if (stillMissing.length > 0) {
        try {
          const { algoliasearch } = await import('algoliasearch');
          const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
          const res: any = await (client as any).getObjects({
            requests: stillMissing.map(objectID => ({ indexName: 'appsearch', objectID })),
          });
          if (!cancelled) {
            (res?.results || []).forEach((hit: any) => {
              if (hit?.objectID) {
                resolved[hit.objectID] = {
                  name: hit.name || hit.objectID,
                  image: hit.image_url || '',
                };
              }
            });
          }
        } catch { /* ignore — image lookup is optional */ }
      }

      if (!cancelled && Object.keys(resolved).length > 0) {
        setAlgoliaAppMeta(prev => ({ ...prev, ...resolved }));
      }
    })();
    return () => { cancelled = true; };
  }, [aiAgentApps, appMetaById, algoliaAppMeta]);

  /** Unified resolver: prefer authenticated apps, then Algolia cache. */
  const resolveAppMeta = (key: string): { name: string; image: string } => {
    return (
      appMetaById.get(key) ||
      algoliaAppMeta[key] || {
        name: key,
        image: '',
      }
    );
  };
  /**
   * Tracks which automation rows have their config section expanded.
   * Enabling an automation no longer auto-expands it — the user explicitly
   * clicks the chevron on the row header to reveal/hide configuration.
   * Keyed by automation type (e.g. 'workflow', 'webhook', 'security_rules').
   */
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  // (Popup editor lives inside the shared PopupTextEditor component.)
  const toggleExpanded = (type: string) =>
    setExpandedTypes(prev => ({ ...prev, [type]: !prev[type] }));

  const DEFAULT_SECURITY_RULES = 'merge if always; deny if has_deleted_field';

  const resetRow = (type: string) => {
    setAutomations(prev => prev.map(a => {
      if (a.type !== type) return a;
      // enrich / security_rules / ai_agent default to enabled; others default to disabled
      const enabledByDefault = type === 'enrich' || type === 'security_rules' || type === 'ai_agent';
      return { ...a, enabled: enabledByDefault, trigger: 'on_edit' as const };
    }));
    if (type === 'workflow') {
      setSelectedWorkflows([]);
    } else if (type === 'webhook') {
      setWebhookUrl('');
    } else if (type === 'security_rules') {
      setSecurityRulesText(DEFAULT_SECURITY_RULES);
    } else if (type === 'ai_agent') {
      const isVuln = activeCategory === 'vulnerabilities' || activeCategory.includes('vuln');
      const defSkill = isVuln ? 'vulnerability' : 'incident-response';
      setAiAgentSkill(defSkill);
      if (isVuln) {
        setAiAgentPrompts([...DEFAULT_VULNERABILITY_AI_PROMPTS]);
        setAiAgentApps(DEFAULT_VULNERABILITY_AI_APPS.map(a => [...a]));
      } else {
        setAiAgentPrompts([...DEFAULT_INCIDENT_AI_PROMPTS]);
        setAiAgentApps(DEFAULT_INCIDENT_AI_APPS.map(a => [...a]));
      }
    }
    setHasChanges(true);
  };

  const fetchIngestionApps = async () => {
    try {
      const [authApps, wfList] = await Promise.all([
        fetchAuthenticatedApps().catch(() => []),
        fetchWorkflowsCached(getApiUrl('/api/v1/workflows'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
      ]);
      if (Array.isArray(authApps)) {
        let workflowAppNames: Set<string> | undefined;
        const ingestWf = findIngestTicketsWorkflow(wfList);
        if (ingestWf) {
          workflowAppNames = extractWorkflowAppNames(ingestWf);
        }
        setIngestionApps(extractValidatedIngestionApps(authApps, workflowAppNames));
      }
    } catch (error) {
      console.error('Failed to fetch ingestion apps:', error);
    }
  };

  // Fetch workflows and ingestion config when dialog opens
  useEffect(() => {
    if (open) {
      const fetchWorkflows = async () => {
        setLoadingWorkflows(true);
        try {
          const workflowList = await fetchWorkflowsCached(getApiUrl('/api/v1/workflows'), {
            credentials: 'include',
            headers: {
              ...getAuthHeader(),
            },
          });
            // Pre-collect already-selected workflow IDs from the existing config so
            // background_processing workflows that are already in use stay visible
            // (otherwise the picker would show their raw ID instead of the name).
            const preselectedIds = new Set<string>();
            const wfAutomation = (initialAutomations || []).find(a => a.name === 'Run workflow');
            const wfOption = wfAutomation?.options?.find(o => o.key === 'workflow_id');
            if (wfOption?.value) {
              wfOption.value.split(',').map(s => s.trim()).filter(Boolean).forEach(id => preselectedIds.add(id));
            }
            setWorkflows(
              workflowList
                .filter((w: any) => !w.background_processing || preselectedIds.has(w.id))
                .map((w: any) => ({ id: w.id, name: w.name || w.id })),
            );
        } catch (error) {
          console.error('Failed to fetch workflows:', error);
        } finally {
          setLoadingWorkflows(false);
        }
      };

      fetchWorkflows();
      fetchIngestionApps();
    }
  }, [open]);

  // Pre-load the automation config for every supported category with a
  // top=1 lookup so the "When" dropdown can show enabled state and swap
  // instantly between areas.
  useEffect(() => {
    if (!open) return;
    setActiveCategory(category);
    setCategoryEntries({ [category]: { automations: initialAutomations || null, settings: initialSettings } });
    let cancelled = false;
    setLoadingCategories(true);
    (async () => {
      const results = await Promise.all(
        categoryOptions
          .filter(opt => (initialAutomations && initialAutomations.length > 0) ? opt.category !== category : true)
          .map(async (opt) => {
            try {
              const res: any = await getDatastoreByCategory(opt.category, undefined, 1, orgIdProp || undefined);
              const cfg = res?.categoryConfig;
              return {
                category: opt.category,
                automations: (cfg?.automations as CategoryAutomation[]) || null,
                settings: cfg?.settings,
              };
            } catch {
              return { category: opt.category, automations: null, settings: undefined };
            }
          }),
      );
      if (cancelled) return;
      setCategoryEntries(prev => {
        const next = { ...prev };
        results.forEach(r => {
          if (r && (!next[r.category] || !next[r.category]?.automations)) {
            next[r.category] = { automations: r.automations, settings: r.settings };
          }
        });
        return next;
      });
      setLoadingCategories(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const activeEntry = categoryEntries[activeCategory];
  const initializedRef = useRef<{ category: string; entry: CategoryEntry | undefined } | null>(null);

  useEffect(() => {
    if (!open) {
      initializedRef.current = null;
      return;
    }
    // Only (re)initialize the form when the active category changes or when
    // its config was (re)loaded — never on unrelated re-renders, so in-flight
    // edits are not wiped.
    if (
      initializedRef.current &&
      initializedRef.current.category === activeCategory &&
      initializedRef.current.entry === activeEntry
    ) {
      return;
    }
    initializedRef.current = { category: activeCategory, entry: activeEntry };
    {
      const sourceAutomations = activeEntry?.automations || null;
      const sourceSettings = activeEntry?.settings;
      // Initialize with all automation types, preserving existing states
      // Match by name since API uses name as identifier
      const existingByName = new Map((sourceAutomations || []).map(a => [a.name, a]));
      const allAutomations: CategoryAutomation[] = automationConfigs.map(config => {
        const existing = existingByName.get(config.name);
        if (existing) {
          return {
            ...existing,
            type: config.type as CategoryAutomation['type'],
          };
        }
        return {
          id: `auto-${config.type}`,
          name: config.name,
          type: config.type as CategoryAutomation['type'],
          trigger: 'on_edit' as const,
          enabled: false,
        };
      });
      setAutomations(allAutomations);
      setHasChanges(false);
      setCleanupTimeout(normalizeCleanupTimeout(sourceSettings?.timeout));
      setCategoryTimeout(sourceSettings?.timeout || 0);
      setIsCategoryPublic(Boolean(sourceSettings?.public));
      setCategoryRBAC(sourceSettings?.rbac ?? null);

      // Extract existing workflow IDs and webhook URL
      const workflowAutomation = existingByName.get('Run workflow');
      const workflowOption = workflowAutomation?.options?.find(o => o.key === 'workflow_id');
      if (workflowOption?.value) {
        const ids = workflowOption.value.split(',').filter(Boolean);
        // Will be populated once workflows are loaded
        setSelectedWorkflows(ids.map(id => ({ id: id.trim(), name: id.trim() })));
      } else {
        setSelectedWorkflows([]);
      }

      const webhookAutomation = existingByName.get('Send webhook');
      const urlOption = webhookAutomation?.options?.find(o => o.key === 'webhook_url');
      setWebhookUrl(urlOption?.value || '');

      const rulesAutomation = existingByName.get('Security Rules');
      const rulesOption = rulesAutomation?.options?.find(o => o.key === 'rule');
      setSecurityRulesText(rulesOption?.value || '');


      const aiAutomation = existingByName.get('Run AI Agent');
      const isVuln = activeCategory === 'vulnerabilities' || activeCategory.includes('vuln');
      const defaultSkillForCat = isVuln ? 'vulnerability' : 'incident-response';

      if (aiAutomation?.options && aiAutomation.options.length > 0) {
        // Options use keys: "action", "action-2", "action-3", etc.
        const actionOptions = aiAutomation.options
          .filter(o => o.key === 'action' || /^action-\d+$/.test(o.key))
          .sort((a, b) => {
            const numA = a.key === 'action' ? 1 : parseInt(a.key.replace('action-', ''));
            const numB = b.key === 'action' ? 1 : parseInt(b.key.replace('action-', ''));
            return numA - numB;
          });
        const prompts = actionOptions.map(o => o.value).filter(Boolean);
        const finalPrompts = prompts.length > 0 ? prompts : [''];
        setAiAgentPrompts(finalPrompts);

        // Apps live inside the same option as the prompt (option.apps).
        // Legacy fallback: parallel "apps" / "apps-N" options.
        const appsByIdx: string[][] = actionOptions.map((opt, i) => {
          const inline = (opt as any)?.apps;
          if (Array.isArray(inline)) {
            return inline.map((s: unknown) => String(s).trim()).filter(Boolean);
          }
          const key = i === 0 ? 'apps' : `apps-${i + 1}`;
          const legacy = aiAutomation.options?.find(o => o.key === key);
          return legacy?.value
            ? legacy.value.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        });
        setAiAgentApps(appsByIdx.length > 0 ? appsByIdx : [[]]);

        const firstOpt = actionOptions[0] as any;
        const savedSkill = firstOpt?.template || firstOpt?.skill;
        if (savedSkill) {
          setAiAgentSkill(savedSkill);
        } else {
          setAiAgentSkill(defaultSkillForCat);
        }
      } else {
        setAiAgentSkill(defaultSkillForCat);
        if (isVuln) {
          setAiAgentPrompts([...DEFAULT_VULNERABILITY_AI_PROMPTS]);
          setAiAgentApps(DEFAULT_VULNERABILITY_AI_APPS.map(a => [...a]));
        } else {
          setAiAgentPrompts(['']);
          setAiAgentApps([[]]);
        }
      }
    }
  }, [open, activeCategory, activeEntry]);

  // Update selected workflows with names once workflows are loaded
  useEffect(() => {
    if (workflows.length > 0 && selectedWorkflows.length > 0) {
      setSelectedWorkflows(prev =>
        prev.map(sw => {
          const found = workflows.find(w => w.id === sw.id);
          return found || sw;
        })
      );
    }
  }, [workflows]);

  const handleToggleAutomation = (type: string) => {
    setAutomations(automations.map(a =>
      a.type === type ? { ...a, enabled: !a.enabled, trigger: 'on_edit' as CategoryAutomation['trigger'] } : a
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const orgId = orgIdProp || getOrgId();
    if (!orgId) {
      toast.error('No tenant found');
      return;
    }

    setIsSaving(true);
    try {
      // Build API format payload
      const apiAutomations: AutomationApiFormat[] = automationConfigs.map(config => {
        const automation = automations.find(a => a.type === config.type);
        const isEnabled = automation?.enabled || false;

        // Build options based on type
        let options: { key: string; value: string; apps?: string[] | null; template?: string; skill?: string }[] = [];
        if (config.type === 'workflow') {
          options = [{ key: config.optionKey || '', value: selectedWorkflows.map(w => w.id).join(',') }];
        } else if (config.type === 'webhook') {
          options = [{ key: config.optionKey || '', value: webhookUrl }];
        } else if (config.type === 'security_rules') {
          options = [{ key: config.optionKey || '', value: securityRulesText }];
        } else if (config.type === 'ai_agent') {
          // Use "action", "action-2", "action-3" format. The per-prompt app
          // allow-list lives INSIDE the same option object as `apps`.
          const effectiveSkill = aiAgentSkill || (activeCategory.includes('vuln') ? 'vulnerability' : 'incident-response');
          const pairs = aiAgentPrompts
            .map((prompt, idx) => ({ prompt, apps: aiAgentApps[idx] || [] }))
            .filter(p => p.prompt.trim());
          options = pairs.map((p, idx) => ({
            key: idx === 0 ? 'action' : `action-${idx + 1}`,
            value: p.prompt,
            apps: p.apps.length > 0 ? p.apps : null,
            template: effectiveSkill,
            skill: effectiveSkill,
          }));
          if (options.length === 0) {
            options = [{
              key: 'action',
              value: '',
              apps: null,
              template: effectiveSkill,
              skill: effectiveSkill,
            }];
          }
        } else {
          options = [{ key: config.optionKey || '', value: '' }];
        }

        const baseAutomation: AutomationApiFormat = {
          name: config.name,
          description: config.description,
          options,
          icon: config.apiIcon || '',
          enabled: isEnabled,
        };

        if (config.apiType) {
          baseAutomation.type = config.apiType;
        }

        return baseAutomation;
      });

      // Add "Send message" as disabled (per API format)
      apiAutomations.push({
        name: 'Send message',
        description: '',
        type: 'singul',
        options: [{ key: 'app', value: '' }],
        icon: '',
        disabled: true,
        enabled: false,
      });

      const payload: any = {
        category: activeCategory,
        automations: apiAutomations,
      };
      // Preserve any settings fields this dialog doesn't manage itself
      // (e.g. `public`) — the backend overwrites the whole settings object,
      // so dropping them here would silently reset them.
      const baseSettings = (activeCategory === category ? initialSettings : activeEntry?.settings) || {};
      const effectiveTimeout = categoryTimeout > 0 ? categoryTimeout : (cleanupTimeout > 0 ? cleanupTimeout : 0);
      payload.settings = {
        ...baseSettings,
        timeout: effectiveTimeout,
        public: isCategoryPublic,
        rbac: categoryRBAC || undefined,
      };

      const response = await fetch(getApiUrl('/api/v2/datastore/automate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(currentView === 'automations' ? 'Failed to save automations' : 'Failed to save settings');
      }

      const enabledAutomations = automations.filter(a => a.enabled);
      // Keep the in-dialog cache in sync so the "When" dropdown reflects the
      // new enabled state immediately.
      setCategoryEntries(prev => ({
        ...prev,
        [activeCategory]: {
          automations: apiAutomations as unknown as CategoryAutomation[],
          settings: payload.settings,
        },
      }));
      if (activeCategory === category) {
        onAutomationsChange(enabledAutomations);
      }
      toast.success(
        currentView === 'automations'
          ? `Automations saved for ${entityPlural}`
          : `Settings saved for ${entityPlural}`
      );
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(currentView === 'automations' ? 'Failed to save automations' : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCategoryRBAC = async (newRBAC: RBACConfig | null) => {
    setCategoryRBAC(newRBAC);
    setHasChanges(true);

    const baseSettings = (activeCategory === category ? initialSettings : activeEntry?.settings) || {};
    const effectiveTimeout = categoryTimeout > 0 ? categoryTimeout : (cleanupTimeout > 0 ? cleanupTimeout : 0);
    const updatedSettings = {
      ...baseSettings,
      timeout: effectiveTimeout,
      public: isCategoryPublic,
      rbac: newRBAC || undefined,
    };

    const apiAutomations: AutomationApiFormat[] = automationConfigs.map(config => {
      const automation = automations.find(a => a.type === config.type);
      const isEnabled = automation?.enabled || false;

      let options: { key: string; value: string; apps?: string[] | null; template?: string; skill?: string }[] = [];
      if (config.type === 'workflow') {
        options = [{ key: config.optionKey || '', value: selectedWorkflows.map(w => w.id).join(',') }];
      } else if (config.type === 'webhook') {
        options = [{ key: config.optionKey || '', value: webhookUrl }];
      } else if (config.type === 'security_rules') {
        options = [{ key: config.optionKey || '', value: securityRulesText }];
      } else if (config.type === 'ai_agent') {
        const effectiveSkill = aiAgentSkill || (activeCategory.includes('vuln') ? 'vulnerability' : 'incident-response');
        const pairs = aiAgentPrompts
          .map((prompt, idx) => ({ prompt, apps: aiAgentApps[idx] || [] }))
          .filter(p => p.prompt.trim());
        options = pairs.map((p, idx) => ({
          key: idx === 0 ? 'action' : `action-${idx + 1}`,
          value: p.prompt,
          apps: p.apps.length > 0 ? p.apps : null,
          template: effectiveSkill,
          skill: effectiveSkill,
        }));
        if (options.length === 0) {
          options = [{
            key: 'action',
            value: '',
            apps: null,
            template: effectiveSkill,
            skill: effectiveSkill,
          }];
        }
      } else {
        options = [{ key: config.optionKey || '', value: '' }];
      }

      const baseAutomation: AutomationApiFormat = {
        name: config.name,
        description: config.description,
        options,
        icon: config.apiIcon || '',
        enabled: isEnabled,
      };

      if (config.apiType) {
        baseAutomation.type = config.apiType;
      }

      return baseAutomation;
    });

    apiAutomations.push({
      name: 'Send message',
      description: '',
      type: 'singul',
      options: [{ key: 'app', value: '' }],
      icon: '',
      disabled: true,
      enabled: false,
    });

    const payload: any = {
      category: activeCategory,
      automations: apiAutomations,
      settings: updatedSettings,
    };

    const response = await fetch(getApiUrl('/api/v2/datastore/automate'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.reason || 'Failed to save category access rules');
    }

    setCategoryEntries(prev => ({
      ...prev,
      [activeCategory]: {
        automations: apiAutomations as unknown as CategoryAutomation[],
        settings: updatedSettings,
      },
    }));

    toast.success(`Access updated for category "${activeCategory}"`);
    onSaved?.();
  };

  const enabledCount = automations.filter(a => a.enabled).length;

  /** Enabled-automation count per category, from the pre-loaded configs. */
  const enabledCountFor = (cat: string): number => {
    if (cat === activeCategory) return enabledCount;
    return (categoryEntries[cat]?.automations || []).filter(a => a.enabled).length;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ pb: 2, px: 4, pt: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {currentView === 'automations' ? (
            <RocketLaunchIcon size={26} style={{ color: enabledCount > 0 ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))' }} />
          ) : currentView === 'routing' ? (
            <RouteIcon size={26} style={{ color: 'hsl(var(--foreground))' }} />
          ) : (
            <SettingsIcon size={26} style={{ color: 'hsl(var(--foreground))' }} />
          )}
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
            {currentView === 'automations'
              ? `Automation for ${entityPluralCap}`
              : currentView === 'routing'
                ? `Routing for ${entityPluralCap}`
                : `Settings for ${entityPluralCap}`}
          </Typography>
          {currentView === 'routing' && (
            <Chip
              label="Support only"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 500,
                color: 'hsl(var(--muted-foreground))',
                bgcolor: 'hsl(var(--muted) / 0.5)',
                border: '1px solid hsl(var(--border))',
                '& .MuiChip-label': { px: 1 },
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isSupportUser && (
            <Tooltip
              title={
                currentView === 'routing'
                  ? `Switch to Automation for ${entityPluralCap}`
                  : 'Routing rules are a support-only preview and are not visible to regular users yet.'
              }
            >
              <IconButton
                size="small"
                onClick={() => setCurrentView(currentView === 'routing' ? 'automations' : 'routing')}
                sx={{
                  color: currentView === 'routing' ? 'hsl(var(--primary))' : 'text.secondary',
                  border: '1px solid hsl(var(--border))',
                  borderColor: currentView === 'routing' ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  borderRadius: 1.5,
                  p: 0.75,
                  bgcolor: currentView === 'routing' ? 'hsl(var(--muted) / 0.5)' : 'transparent',
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: 'hsl(var(--muted) / 0.5)',
                    borderColor: 'hsl(var(--primary))',
                  },
                }}
              >
                <RouteIcon size={18} />
              </IconButton>
            </Tooltip>
          )}
          {showViewToggle && (
            <Tooltip
              title={
                currentView === 'settings'
                  ? `Switch to Automation for ${entityPluralCap}`
                  : `Switch to Settings for ${entityPluralCap}`
              }
            >
              <IconButton
                size="small"
                onClick={() => setCurrentView(currentView === 'settings' ? 'automations' : 'settings')}
                sx={{
                  color: currentView === 'settings' ? 'hsl(var(--primary))' : 'text.secondary',
                  border: '1px solid hsl(var(--border))',
                  borderColor: currentView === 'settings' ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  borderRadius: 1.5,
                  p: 0.75,
                  bgcolor: currentView === 'settings' ? 'hsl(var(--muted) / 0.5)' : 'transparent',
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: 'hsl(var(--muted) / 0.5)',
                    borderColor: 'hsl(var(--primary))',
                  },
                }}
              >
                {currentView === 'settings' ? (
                  <RocketLaunchIcon size={18} />
                ) : (
                  <SettingsIcon size={18} />
                )}
              </IconButton>
            </Tooltip>
          )}
          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: 'text.secondary',
              p: 0.75,
            }}
          >
            <CloseIcon size={18} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 4, pb: 3 }}>
        {currentView === 'routing' ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.8rem' }}>
              Rules are evaluated when a {entitySingular} is created or edited. Conditions are
              generic field checks, so the same mechanism works for every category.
            </Typography>
            <IncidentRoutingEditor
              forceShow
              entityCategory={activeCategory}
              entityLabel={{ singular: entitySingular, plural: entityPlural }}
              generateCategory={routingGenerateCategory}
            />
          </Box>
        ) : (
        <>
        {/* Trigger Section */}
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 1.5,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontSize: '0.75rem',
            }}
          >
            {currentView === 'automations' ? 'When' : 'Category'}
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={activeCategory}
              onChange={(e) => {
                const next = String(e.target.value);
                if (next === activeCategory) return;
                if (hasChanges && !window.confirm('You have unsaved changes. Switch area and discard them?')) return;
                setActiveCategory(next);
              }}
              sx={{
                bgcolor: 'hsl(var(--muted) / 0.4)',
                fontSize: '0.95rem',
                '& .MuiSelect-select': { py: 1.5, px: 2 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              }}
              MenuProps={{
                PaperProps: {
                  sx: { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' },
                },
              }}
            >
              {categoryOptions.map((opt) => {
                const count = enabledCountFor(opt.category);
                return (
                  <MenuItem key={opt.category} value={opt.category}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          flexShrink: 0,
                          bgcolor: count > 0 ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground) / 0.5)',
                        }}
                      />
                      <Typography sx={{ fontSize: '0.95rem', flex: 1 }}>
                        {currentView === 'automations'
                          ? `A${/^[aeiou]/i.test(opt.singular) ? 'n' : ''} ${opt.singular} is edited`
                          : `${opt.plural.charAt(0).toUpperCase() + opt.plural.slice(1)} (${opt.category})`}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {loadingCategories && !categoryEntries[opt.category]
                          ? 'Loading…'
                          : count > 0
                            ? `${count} enabled`
                            : 'No automation'}
                      </Typography>
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ mb: 3, borderColor: 'hsl(var(--border))' }} />

        {currentView === 'automations' ? (
          <Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 2,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontSize: '0.75rem',
            }}
          >
            Do
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {automations.map((automation) => {
              const config = automationConfigs.find(c => c.type === automation.type);
              if (!config) return null;
              const TypeIcon = config.icon;

              return (
                <Box
                  key={automation.id || automation.name}
                  sx={{
                    borderRadius: 1.5,
                    transition: 'all 0.15s',
                    bgcolor: automation.enabled ? 'hsl(var(--muted) / 0.35)' : 'transparent',
                    border: '1px solid',
                    borderColor: automation.enabled ? 'hsl(var(--border))' : 'transparent',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      py: 1.5,
                      px: 1.5,
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'hsl(var(--muted) / 0.45)',
                      },
                    }}
                    onClick={() => handleToggleAutomation(automation.type!)}
                  >
                    <Checkbox
                      checked={automation.enabled}
                      onChange={() => handleToggleAutomation(automation.type!)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                      sx={{
                        color: 'hsl(var(--muted-foreground))',
                        p: 0.5,
                        '&.Mui-checked': {
                          color: config.color,
                        },
                      }}
                    />
                    <TypeIcon
                      size={22}
                      style={{
                        color: automation.enabled ? config.color : 'hsl(var(--muted-foreground))',
                        transition: 'color 0.15s',
                      }}
                    />
                    <Typography
                      sx={{
                        flex: 1,
                        fontSize: '0.95rem',
                        color: automation.enabled ? 'text.primary' : 'hsl(var(--muted-foreground))',
                        fontWeight: automation.enabled ? 500 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      {config.name}
                    </Typography>
                    {/* Per-row Reset — only shown for rows that actually
                        have a default to restore (enrich, security_rules,
                        ai_agent). workflow/webhook have no defaults. */}
                    {(automation.type === 'enrich' ||
                      automation.type === 'security_rules' ||
                      automation.type === 'ai_agent') && (
                      <Tooltip title={`Reset ${(config.name || '').replace(/[_\-]+/g, ' ')} to default`}>
                        <IconButton
                          size="small"
                          aria-label={`Reset ${(config.name || '').replace(/[_\-]+/g, ' ')} to default`}
                          onClick={(e) => {
                            e.stopPropagation();
                            resetRow(automation.type!);
                          }}
                          sx={{
                            color: 'hsl(var(--muted-foreground))',
                            p: 0.5,
                            '&:hover': { color: 'hsl(var(--primary))' },
                          }}
                        >
                          <RestoreIcon size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* Chevron — only for automations that have a config
                        section. Clicking expands/collapses the config without
                        toggling the enabled state. Enabling no longer auto-
                        opens the config; the user controls visibility. */}
                    {config.hasConfig && (
                      <IconButton
                        size="small"
                        aria-label={expandedTypes[automation.type!] ? 'Collapse configuration' : 'Expand configuration'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(automation.type!);
                        }}
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          p: 0.5,
                          transition: 'transform 0.15s',
                          transform: expandedTypes[automation.type!] ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      >
                        <ExpandMoreIcon size={20} />
                      </IconButton>
                    )}
                  </Box>

                  {/* Workflow Configuration */}
                  {automation.type === 'workflow' && expandedTypes['workflow'] && (
                    <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
                      <Autocomplete
                        multiple
                        size="small"
                        options={workflows}
                        loading={loadingWorkflows}
                        value={selectedWorkflows}
                        onChange={(_, newValue) => {
                          setSelectedWorkflows(newValue);
                          setHasChanges(true);
                        }}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Select workflows to run"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: 'hsl(var(--background))',
                              },
                            }}
                          />
                        )}
                        renderTags={(value, getTagProps) =>
                          value.map((option, index) => (
                            <Chip
                              {...getTagProps({ index })}
                              key={option.id}
                              label={option.name}
                              size="small"
                              sx={{
                                bgcolor: 'hsl(var(--severity-info) / 0.2)',
                                color: 'hsl(var(--severity-info))',
                                '& .MuiChip-deleteIcon': {
                                  color: 'hsl(var(--severity-info) / 0.6)',
                                  '&:hover': { color: 'hsl(var(--severity-info))' },
                                },
                              }}
                            />
                          ))
                        }
                        sx={{
                          '& .MuiAutocomplete-popupIndicator': { color: 'text.secondary' },
                          '& .MuiAutocomplete-clearIndicator': { color: 'text.secondary' },
                        }}
                        slotProps={{
                          paper: {
                            sx: {
                              bgcolor: 'background.paper',
                              border: '1px solid',
                              borderColor: 'divider',
                            },
                          },
                        }}
                      />
                    </Box>
                  )}

                  {/* AI Agent Configuration - multiple prompts */}
                  {automation.type === 'ai_agent' && expandedTypes['ai_agent'] && (
                    <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
                      <AiAgentPromptsEditor
                        prompts={aiAgentPrompts}
                        apps={aiAgentApps}
                        resolveAppMeta={resolveAppMeta}
                        onChangePrompt={(idx, next) => {
                          const updated = [...aiAgentPrompts];
                          updated[idx] = next;
                          setAiAgentPrompts(updated);
                          setHasChanges(true);
                        }}
                        onRemovePrompt={(idx) => {
                          setAiAgentPrompts(aiAgentPrompts.filter((_, i) => i !== idx));
                          setAiAgentApps(aiAgentApps.filter((_, i) => i !== idx));
                          setHasChanges(true);
                        }}
                        onAddPrompt={() => {
                          setAiAgentPrompts([...aiAgentPrompts, '']);
                          setAiAgentApps([...aiAgentApps, []]);
                          setHasChanges(true);
                        }}
                        onRemoveApp={(idx, appKey) => {
                          const updated = [...aiAgentApps];
                          updated[idx] = (updated[idx] || []).filter((n) => n !== appKey);
                          setAiAgentApps(updated);
                          setHasChanges(true);
                        }}
                        onAddAppRequested={(idx) => setAppPickerForIdx(idx)}
                        renderPromptInput={({ index, value, onChange, placeholder }) => (
                          <PopupTextEditor
                            value={value}
                            onChange={onChange}
                            placeholder={placeholder}
                            title={`Edit prompt ${index + 1}`}
                            subtitle="Full editor for the AI Agent prompt."
                            toolbar={
                              index === 0 ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <AgentPresets
                                    variant="floating"
                                    selectedPreset={selectedSkillPreset}
                                    onSelectPreset={handleSelectSkillPreset}
                                    onRemoveSelected={handleRemoveSkillPreset}
                                    placement="top-start"
                                    sx={{ height: 26, fontSize: '0.72rem' }}
                                  />
                                </Box>
                              ) : undefined
                            }
                            inlineTextFieldProps={
                              index === 0
                                ? {
                                    InputProps: {
                                      startAdornment: (
                                        <InputAdornment
                                          position="start"
                                          sx={{ mr: 0.5 }}
                                          onClick={(e) => e.stopPropagation()}
                                          onMouseDown={(e) => e.stopPropagation()}
                                        >
                                          <AgentPresets
                                            variant="floating"
                                            selectedPreset={selectedSkillPreset}
                                            onSelectPreset={handleSelectSkillPreset}
                                            onRemoveSelected={handleRemoveSkillPreset}
                                            placement="bottom-start"
                                            sx={{ height: 26, fontSize: '0.72rem' }}
                                          />
                                        </InputAdornment>
                                      ),
                                    },
                                  }
                                : undefined
                            }
                          />
                        )}
                      />
                    </Box>
                  )}

                  {/* Webhook Configuration */}
                  {automation.type === 'webhook' && expandedTypes['webhook'] && (
                    <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="https://your-webhook-url.com"
                        value={webhookUrl}
                        onChange={(e) => {
                          setWebhookUrl(e.target.value);
                          setHasChanges(true);
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'hsl(var(--background))',
                          },
                        }}
                      />
                    </Box>
                  )}

                  {/* Security Rules Configuration */}
                  {automation.type === 'security_rules' && expandedTypes['security_rules'] && (
                    <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                        maxRows={6}
                        placeholder="Enter security rules..."
                        value={securityRulesText}
                        onChange={(e) => {
                          setSecurityRulesText(e.target.value);
                          setHasChanges(true);
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'hsl(var(--background))',
                            fontSize: '0.85rem',
                          },
                        }}
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Entry Expiration & Retention */}
            <Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1.5,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontSize: '0.75rem',
                }}
              >
                Entry Expiration & Retention
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Default Entry Timeout (seconds)"
                  type="number"
                  size="small"
                  fullWidth
                  value={categoryTimeout}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCategoryTimeout(val);
                    setCleanupTimeout(val);
                    setHasChanges(true);
                  }}
                  helperText="Set to 0 for no expiration (permanent entries). Example: 86400 for 1 day."
                  sx={{ mt: 1 }}
                />

                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 2,
                    bgcolor: 'hsl(var(--muted) / 0.35)',
                    borderRadius: 1.5,
                    border: '1px solid hsl(var(--border))',
                  }}
                >
                  <DeleteSweepIcon size={22} style={{ color: cleanupTimeout > 0 ? 'hsl(var(--severity-medium))' : 'hsl(var(--muted-foreground))' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.95rem', color: cleanupTimeout > 0 ? 'text.primary' : 'hsl(var(--muted-foreground))' }}>
                      Auto-delete {entityPlural} after
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      Automatically removes resolved {entityPlural} after the selected period
                    </Typography>
                  </Box>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select
                      value={String(normalizeCleanupTimeout(cleanupTimeout))}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCleanupTimeout(val);
                        if (val > 0) {
                          setCategoryTimeout(val);
                        }
                        setHasChanges(true);
                      }}
                      displayEmpty
                      sx={{
                        bgcolor: 'hsl(var(--background))',
                        fontSize: '0.85rem',
                        '& .MuiSelect-select': { py: 0.75 },
                      }}
                      MenuProps={{
                        PaperProps: {
                          sx: { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' },
                        },
                      }}
                    >
                      {WEEKS_OPTIONS.map((opt) => (
                        <MenuItem key={opt.seconds} value={String(opt.seconds)}>
                          {opt.label}
                        </MenuItem>
                      ))}
                      {normalizeCleanupTimeout(cleanupTimeout) > 0 &&
                        !WEEKS_OPTIONS.some((o) => o.seconds === normalizeCleanupTimeout(cleanupTimeout)) && (
                          <MenuItem
                            key="custom"
                            value={String(normalizeCleanupTimeout(cleanupTimeout))}
                          >
                            {formatCustomTimeout(normalizeCleanupTimeout(cleanupTimeout))} (current)
                          </MenuItem>
                        )}
                    </Select>
                  </FormControl>
                </Box>
              </Box>
            </Box>

            <Divider sx={{ borderColor: 'hsl(var(--border))' }} />

            {/* Access & Sharing Section */}
            <Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1.5,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontSize: '0.75rem',
                }}
              >
                Access & Sharing (RBAC)
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  py: 1.5,
                  px: 2,
                  bgcolor: 'hsl(var(--muted) / 0.35)',
                  borderRadius: 1.5,
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.95rem', color: 'text.primary', fontWeight: 500 }}>
                    Category Permissions (RBAC)
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {categoryRBAC
                      ? 'Custom access rules are configured for this category'
                      : 'Standard workspace permissions apply (RBAC inactive)'}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShareModalOpen(true)}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    '&:hover': {
                      borderColor: 'hsl(var(--primary))',
                      bgcolor: 'hsl(var(--primary) / 0.05)',
                    },
                  }}
                >
                  Manage Access
                </Button>
              </Box>
            </Box>

            <Divider sx={{ borderColor: 'hsl(var(--border))' }} />

            {/* Public Authorization */}
            <Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1.5,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontSize: '0.75rem',
                }}
              >
                Public API Querying
              </Typography>
              <Box
                sx={{
                  py: 1.5,
                  px: 2,
                  bgcolor: 'hsl(var(--muted) / 0.35)',
                  borderRadius: 1.5,
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={isCategoryPublic}
                      onChange={(e) => {
                        setIsCategoryPublic(e.target.checked);
                        setHasChanges(true);
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontSize: '0.92rem', color: 'text.primary', fontWeight: 500 }}>
                        Make category publicly queryable
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Allow querying keys in this category via authorization tokens without cookie sessions
                      </Typography>
                    </Box>
                  }
                  sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
                />
              </Box>
            </Box>
          </Box>
        )}
        </>
        )}
      </DialogContent>

      <Divider sx={{ borderColor: 'hsl(var(--border))' }} />

      <DialogActions sx={{ px: 4, py: 2.5, justifyContent: currentView === 'routing' ? 'flex-end' : 'space-between' }}>
        {currentView === 'routing' ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
        <>
        <Button
          size="small"
          startIcon={<RestoreIcon />}
          onClick={() => {
            if (currentView === 'automations') {
              const isVulnerabilities = activeCategory === 'vulnerabilities' || activeCategory.includes('vulnerabilit') || activeCategory.includes('vuln');
              setAutomations(automations.map(a => {
                if (a.type === 'enrich') return { ...a, enabled: true, trigger: 'on_edit' as const };
                if (a.type === 'security_rules') return { ...a, enabled: true, trigger: 'on_edit' as const };
                if (a.type === 'ai_agent') return { ...a, enabled: true, trigger: 'on_edit' as const };
                return a;
              }));
              setSecurityRulesText('merge if always; deny if has_deleted_field');
              if (isVulnerabilities) {
                setAiAgentSkill('vulnerability');
                setAiAgentPrompts([...DEFAULT_VULNERABILITY_AI_PROMPTS]);
                setAiAgentApps(DEFAULT_VULNERABILITY_AI_APPS.map(a => [...a]));
              } else {
                setAiAgentSkill('incident-response');
                setAiAgentPrompts([...DEFAULT_INCIDENT_AI_PROMPTS]);
                setAiAgentApps(DEFAULT_INCIDENT_AI_APPS.map(a => [...a]));
              }
              setHasChanges(true);
            } else {
              setCategoryTimeout(0);
              setCleanupTimeout(0);
              setIsCategoryPublic(false);
              setHasChanges(true);
            }
          }}
          sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.8rem' }}
        >
          Reset to default
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
        </>
        )}
      </DialogActions>

      <AppSearchDrawer
        open={appPickerForIdx !== null}
        onClose={() => setAppPickerForIdx(null)}
        title="Allow App"
        subtitle="Restrict this AI Agent prompt to specific apps"
        multiSelect
        selectedApps={
          appPickerForIdx === null
            ? []
            : (aiAgentApps[appPickerForIdx] || []).map((id) => {
                const meta = resolveAppMeta(id);
                return { name: meta.name, id, icon: meta.image };
              })
        }
        onSelectionChange={(apps) => {
          if (appPickerForIdx === null) return;
          const ids = apps.map((a) => a.id).filter((id): id is string => !!id);
          if (ids.length !== apps.length) {
            toast.error('Cannot allow app: missing canonical app ID');
          }
          const updated = [...aiAgentApps];
          updated[appPickerForIdx] = Array.from(new Set(ids));
          setAiAgentApps(updated);
          setHasChanges(true);
        }}
      />

      <ShareAccessModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        resourceType="category"
        resourceName={activeCategory}
        initialRBAC={categoryRBAC}
        onSave={handleSaveCategoryRBAC}
      />
    </Dialog>
  );
};

export default CategoryAutomationsDialog;
