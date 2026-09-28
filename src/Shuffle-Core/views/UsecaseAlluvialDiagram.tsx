/**
 * UsecaseAlluvialDiagram — Alluvial/Sankey-style visualization showing
 * Source tools → Shuffle → Destination tools for a given usecase.
 *
 * For ingest usecases (SIEM→Ticket, EDR→Ticket, Phishing→Ticket), sources
 * are all apps enabled in the "Ingest Tickets" workflow, with the apps
 * matching the usecase's source category visually highlighted (ring glow).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { algoliasearch } from 'algoliasearch';
import { Box, Typography, Avatar, Tooltip, IconButton, Chip, Popover, Button, Dialog, InputBase } from '@mui/material';
import { Link, useSearchParams } from '@/lib/router-compat';
import {
  Plus,
  Webhook,
  Ban as BlockIcon,
  CheckCircle as CheckCircleOutlineIcon,
  Check as CheckIcon,
  Copy as ContentCopyIcon,
  ExternalLink as OpenInNewIcon,
  ChevronDown,
  ChevronUp,
  X as CloseIcon,
  Power,
  PowerOff,
} from 'lucide-react';
import { AppSearchDrawer } from '@shuffleio/shuffle-mcps';
import { useAppDetailOptional } from '@shuffleio/shuffle-mcps';
import { getApiUrl, getAuthHeader } from '@shuffleio/shuffle-mcps';
import type { ShuffleCoreHostProps } from '../types/host-props';
import { deduplicateAuthApps, backfillAppImages, type AuthAppEntry } from '../auth-utils';
import {
  SIEM_PATTERNS,
  CASES_PATTERNS,
  EDR_PATTERNS,
  EMAIL_APP_PATTERNS,
  VULN_SCANNER_PATTERNS,
  COMMUNICATION_PATTERNS_NAMES,
  findIngestTicketsWorkflow,
  findForwardTicketsWorkflow,
  extractWorkflowAppNames,
  normalizeAppName,
} from '../ingestionDetection';
import { TOOL_CATEGORIES } from './Usecases';
import {
  fetchAppsCached,
  fetchWorkflowsCached,
  getAlluvialCache,
  setAlluvialCache,
  updateAlluvialIngest,
  updateAlluvialForward,
} from './appsFetchCache';
import shuffleInfraLogo from '../assets/shuffle-infrastructure-logo.png';
import shuffleIcon from '../assets/shuffle-icon.png';
import singulAgentIcon from '../assets/singul-agent-icon.png';

import { useWorkflowHealth } from '@/hooks/useWorkflowHealth';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppNode {
  id: string;
  name: string;
  icon: string;
  hasValidAuth: boolean;
  isActiveOnly: boolean;
  /** Whether this app matches the highlighted source category */
  isHighlighted?: boolean;
  /** Whether this app is enabled in the workflow (false = greyed out) */
  isEnabled?: boolean;
  /** Whether this app's runtime execution is blocked (e.g. stopped runtime location) */
  isBlocked?: boolean;
  /** Diagnostic details when execution is blocked */
  blockReason?: string;
  /** Direct action URL to fix the blockage */
  actionUrl?: string;
}

export interface UsecaseAlluvialDiagramProps extends ShuffleCoreHostProps {
  /** Optional flow/usecase ID (e.g. 'vulnerability_ingestion_1') */
  flowId?: string;
  /** Source tool category ID (e.g. 'siem') */
  sourceCategory: string;
  /** Target tool category ID (e.g. 'case_management') */
  targetCategory: string;
  /**
   * If set, source apps are ALL apps in the Ingest Tickets workflow,
   * and apps matching this category get a visual highlight.
   */
  highlightCategory?: string;
  /**
   * If true, the source cannot be modified (no '+' button on left, no removing source apps).
   * Used for flows where Shuffle/Cases is the fixed source.
   */
  lockSource?: boolean;
  /**
   * If true, omits the entire left side (source). The diagram becomes 2-stage:
   * Shuffle -> Destination (used for Notifications).
   */
  omitSource?: boolean;
  /**
   * Optional pre-resolved notification workflow object.
   */
  notificationWorkflow?: any;
  /**
   * Whether the parent flow is considered enabled/active.
   */
  isFlowEnabled?: boolean;
  /**
   * Dynamic label for the usecase (e.g. "Forward Incidents" or "Notifications").
   */
  usecaseLabel?: string;
  /**
   * Host-side handoff for clicking an app bubble. Return `true` to suppress
   * the diagram's built-in Visit/Enable Sync/Remove popover and let the host
   * render its own (mirrors the default Source/Destination tile popover in
   * `UsecaseDetailContent`).
   */
  onBubbleClick?: (args: { appName: string; side: 'left' | 'right'; anchorEl: HTMLElement }) => boolean;
  /**
   * Host-side handoff for clicking a `+` Add tool button. Return `true` to
   * suppress the diagram's built-in `AppSearchDrawer` and let the host open
   * its own (mirrors `setAddToolFor` in `UsecaseDetailContent`).
   */
  onAddTool?: (side: 'left' | 'right') => boolean;
  /** Optional pre-fetched workflows list to avoid redundant API round-trips */
  workflows?: any[];
}

// ── Pattern matchers ───────────────────────────────────────────────────────────

const COMMUNICATION_PATTERNS = [
  ...COMMUNICATION_PATTERNS_NAMES,
  'email', 'gmail', 'outlook', 'pagerduty', 'sms', 'twilio',
];
const ASSET_VULN_PATTERNS = [
  ...VULN_SCANNER_PATTERNS,
  'asset', 'cmdb', 'inventory', 'snipe', 'vulnerability', 'qualys', 'tenable', 'snyk',
];

export const CATEGORY_PATTERNS: Record<string, string[]> = {
  siem: SIEM_PATTERNS,
  case_management: CASES_PATTERNS,
  edr: EDR_PATTERNS,
  email: EMAIL_APP_PATTERNS,
  communication: COMMUNICATION_PATTERNS,
  asset_management: ASSET_VULN_PATTERNS,
  vulnerabilities: ASSET_VULN_PATTERNS,
};

export function matchesCategory(appName: string, categoryId: string): boolean {
  if (isShuffleInternalApp(appName)) return false;
  const patterns = CATEGORY_PATTERNS[categoryId];
  if (!patterns) return false;
  const lower = appName.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

/** Filter out Shuffle's own internal tools (e.g. "Shuffle Tools", "Shuffle Datastore") */
export const SHUFFLE_INTERNAL_PATTERNS = ['shuffle tools', 'shuffle datastore', 'shuffle workflow'];
export function isShuffleInternalApp(appName: string): boolean {
  const lower = appName.toLowerCase();
  return SHUFFLE_INTERNAL_PATTERNS.some(p => lower.includes(p));
}

/**
 * Extract active app names from a Notification workflow, handling both direct
 * app actions (e.g. Slack, Teams, Email, PagerDuty, Discord, Webhook, etc.)
 * and Singul-wrapped actions.
 */
export function extractNotificationWorkflowAppNames(workflow: any): Set<string> {
  const names = new Set<string>();
  if (!workflow || !Array.isArray(workflow.actions)) return names;

  const extractFromObject = (val: any) => {
    if (!val) return;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          extractFromObject(JSON.parse(trimmed));
        } catch { /* ignore */ }
      }
      return;
    }
    if (typeof val === 'object') {
      for (const k of ['app_name', 'app', 'tool', 'target_app', 'integration', 'destination', 'service']) {
        if (typeof val[k] === 'string' && val[k].trim()) {
          names.add(normalizeAppName(val[k].trim()));
        }
      }
      if (Array.isArray(val)) {
        val.forEach(extractFromObject);
      } else {
        Object.values(val).forEach(extractFromObject);
      }
    }
  };

  for (const action of workflow.actions) {
    if (!action) continue;
    // Direct app actions
    if (action.app_name && !isShuffleInternalApp(action.app_name)) {
      names.add(normalizeAppName(action.app_name));
    }
    // Action name if it doesn't match generic words
    if (action.name && !isShuffleInternalApp(action.name) && !['start', 'condition', 'filter', 'branch'].includes(action.name.toLowerCase())) {
      const lowerActionName = action.name.toLowerCase();
      if (COMMUNICATION_PATTERNS.some(p => lowerActionName.includes(p))) {
        names.add(normalizeAppName(action.name));
      }
    }
    // Singul parameters or generic parameters
    if (Array.isArray(action.parameters)) {
      for (const param of action.parameters) {
        if (!param) continue;
        const pName = (param.name || '').toLowerCase();
        if (['app_name', 'app', 'tool', 'target_app', 'integration', 'destination', 'service'].includes(pName) && typeof param.value === 'string') {
          names.add(normalizeAppName(param.value.trim()));
        }
        extractFromObject(param.value);
      }
    } else if (action.parameters && typeof action.parameters === 'object') {
      extractFromObject(action.parameters);
    }
    // Check action fields / environment / extra config if present
    if (action.environment && typeof action.environment === 'object') {
      extractFromObject(action.environment);
    }
  }

  return names;
}

/**
 * Find the Notification Workflow from a list of workflows.
 */
export function findNotificationWorkflow(workflows: any[], defaultId?: string): any {
  if (!Array.isArray(workflows)) return undefined;
  if (defaultId) {
    const found = workflows.find(w => w.id === defaultId);
    if (found) return found;
  }
  return workflows.find(w =>
    w.name === 'Notification Workflow' ||
    w.name?.toLowerCase().includes('notification') ||
    (Array.isArray(w.usecase_ids) && (w.usecase_ids.includes('Notifications') || w.usecase_ids.includes('case_management_communication_1'))) ||
    (Array.isArray(w.tags) && (w.tags.includes('notification') || w.tags.includes('notifications')))
  );
}

// ── Sample apps for unauthenticated visitors ────────────────────────────────

const SAMPLE_APPS: Record<string, { name: string; icon: string }[]> = {
  siem: [
    { name: 'Splunk', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Splunk_1995363ec370368ed05a2882ec0ea8fc.png' },
    { name: 'Elasticsearch', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Elasticsearch_971706758e274c2e4083f2621fb5a6f7.png' },
    { name: 'Wazuh', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Wazuh_fb715a176a192620c25d49ba119e94e5.png' },
  ],
  edr: [
    { name: 'SentinelOne', icon: 'https://storage.googleapis.com/shuffle_public/app_images/SentinelOne_0373ed696a3a2cba0a2b6838068f2b80.png' },
    { name: 'Microsoft Defender', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Microsoft_365_Defender_29c926c37334c191666f6470caa05e1c.png' },
    { name: 'Carbon Black', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Carbon_Black_Response_e9fa2602ea6baafffa4b5eec722095d3.png' },
  ],
  email: [
    { name: 'Gmail', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Gmail_794e51c3c1a8b24b89ccc573a3defc47.png' },
    { name: 'Outlook', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Outlook_Office365_accdaaf2eeba6a6ed43b2efc0112032d.png' },
  ],
  case_management: [
    { name: 'Jira', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Jira_eb0c5e572e14ac1140a8355ba93c0d76.png' },
    { name: 'ServiceNow', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Servicenow_b9c2feaf99b6309dabaeaa8518c61d3d.png' },
    { name: 'TheHive', icon: 'https://storage.googleapis.com/shuffle_public/app_images/TheHive_7b0b20f198b28bcd6e7e3d2e7c1d84af.png' },
  ],
  communication: [
    { name: 'Slack', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Slack_9a528623b378c8d8b9ba582e6ef92be1.png' },
    { name: 'Microsoft Teams', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Microsoft_Teams_59ba339ee8397a612301c37905156a5c.png' },
    { name: 'PagerDuty', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Pagerduty_7a37a91176bc5ee845a7ee46d03dcbbe.png' },
  ],
  asset_management: [
    { name: 'Qualys', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Qualys_792dbba1bb886bfe2cb08a798544d673.png' },
    { name: 'Tenable', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Tenable_io_771804f54e195725da95ce70e0f2f01f.png' },
    { name: 'Snyk', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Snyk_29227f6a73c09b69b3f36a8d052a5127.png' },
  ],
  vulnerabilities: [
    { name: 'Qualys', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Qualys_792dbba1bb886bfe2cb08a798544d673.png' },
    { name: 'Tenable', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Tenable_io_771804f54e195725da95ce70e0f2f01f.png' },
    { name: 'Snyk', icon: 'https://storage.googleapis.com/shuffle_public/app_images/Snyk_29227f6a73c09b69b3f36a8d052a5127.png' },
  ],
};

function getSampleApps(categoryId: string): AppNode[] {
  const samples = SAMPLE_APPS[categoryId] || [];
  return samples.map(s => ({
    id: `sample-${s.name}`,
    name: s.name,
    icon: s.icon,
    hasValidAuth: false,
    isActiveOnly: false,
  }));
}

// ── Status dot color ───────────────────────────────────────────────────────────

function getStatusColor(app: AppNode): string {
  if (app.isBlocked) return 'hsl(var(--destructive))';
  if (app.isEnabled === false) return 'hsl(var(--muted-foreground) / 0.4)';
  if (app.hasValidAuth) return 'hsl(var(--severity-low))';       // Green — validated
  if (app.isActiveOnly) return 'hsl(var(--destructive))';        // Red — activated, no auth
  return 'hsl(var(--severity-medium))';                          // Yellow — auth exists, not validated
}

// ── App bubble component ───────────────────────────────────────────────────────

function AppBubble({
  app,
  size = 40,
  highlighted = false,
  isSample = false,
  disabled = false,
  side = 'left',
  usecaseLabel,
  onClickApp,
  onRemoveApp,
  onToggleSync,
  onVisitApp,
  onPrimaryClick,
  webhookInfo,
  onWebhookToggled,
  isVuln = false,
  isNotification = false,
}: {
  app: AppNode;
  size?: number;
  highlighted?: boolean;
  isSample?: boolean;
  disabled?: boolean;
  side?: 'left' | 'right';
  usecaseLabel?: string;
  onClickApp?: (appName: string) => void;
  onRemoveApp?: (appName: string) => void;
  onToggleSync?: (appName: string, enabled: boolean) => void;
  onVisitApp?: (appName: string) => void;
  onPrimaryClick?: (appName: string, anchorEl: HTMLElement, side: 'left' | 'right') => boolean;
  webhookInfo?: { url: string | null; exists: boolean; enabled: boolean; workflowId: string | null };
  onWebhookToggled?: () => void;
  isVuln?: boolean;
  isNotification?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [webhookOptimistic, setWebhookOptimistic] = useState<boolean | null>(null);
  const popoverOpen = Boolean(anchorEl);

  const displayName = (app.name || '').replace(/[_\-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  const isEnabled = app.isEnabled !== false;
  const isWebhook = app.id === 'webhook-ingestion';
  const webhookEnabled = webhookOptimistic !== null ? webhookOptimistic : (webhookInfo?.enabled ?? false);
  const webhookTitle = isVuln ? 'Vulnerability Webhook' : 'Ingestion Webhook';
  const webhookLabel = isVuln ? 'vulnerabilities_webhook' : 'Ingest Tickets_webhook';

  const closeTooltip = useCallback(() => {
    setTooltipOpen(false);
    setHovered(false);
  }, []);

  const openTooltip = useCallback(() => {
    if (!popoverOpen && !confirmRemoveOpen) {
      setTooltipOpen(true);
    }
  }, [confirmRemoveOpen, popoverOpen]);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (isSample) return;
    closeTooltip();
    // Host can hijack the click (e.g. to open the same popover the default
    // Source/Destination tile uses). Webhook bubbles always keep the local
    // popover since the host has no equivalent UX for them.
    if (!isWebhook && onPrimaryClick && onPrimaryClick(app.name, e.currentTarget, side)) {
      return;
    }
    setAnchorEl(e.currentTarget);
  };

  const handleToggle = () => {
    setAnchorEl(null);
    closeTooltip();
    onToggleSync?.(app.name, !isEnabled);
  };

  const content = (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
        transition: 'transform 0.15s ease',
        cursor: 'pointer',
        '&:hover': { transform: 'scale(1.12)' },
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {app.isBlocked ? (
        <Box
          sx={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            border: '2px solid hsl(var(--destructive))',
            boxShadow: '0 0 10px hsla(var(--destructive) / 0.5)',
            pointerEvents: 'none',
          }}
        />
      ) : highlighted && (
        <Box
          sx={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            border: '2px solid hsl(var(--primary))',
            boxShadow: '0 0 10px hsl(var(--primary) / 0.4)',
            pointerEvents: 'none',
          }}
        />
      )}
      {isWebhook ? (
        <Avatar
          sx={{
            width: size,
            height: size,
            backgroundColor: webhookEnabled ? 'hsl(var(--severity-low) / 0.15)' : 'hsl(var(--severity-info) / 0.15)',
            color: webhookEnabled ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-info))',
            opacity: webhookEnabled ? 1 : 0.5,
          }}
        >
          <Webhook size={size * 0.5} />
        </Avatar>
      ) : app.icon && !imgFailed ? (
        <Box
          component="img"
          src={app.icon}
          alt={displayName}
          onError={() => setImgFailed(true)}
          sx={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'contain',
            backgroundColor: 'hsl(var(--muted))',
            p: 0.5,
            opacity: disabled ? 0.3 : (highlighted || isSample ? 1 : 0.7),
            filter: disabled ? 'grayscale(100%)' : 'none',
          }}
        />
      ) : (
        <Avatar
          sx={{
            width: size,
            height: size,
            backgroundColor: 'hsl(var(--muted))',
            fontSize: size * 0.38,
            color: 'hsl(var(--foreground))',
            opacity: disabled ? 0.3 : (highlighted || isSample ? 1 : 0.7),
            filter: disabled ? 'grayscale(100%)' : 'none',
          }}
        >
          {app.name.charAt(0).toUpperCase()}
        </Avatar>
      )}
      {!isSample && !hovered && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: getStatusColor(app),
            border: '2px solid hsl(var(--card))',
            pointerEvents: 'none',
          }}
        />
      )}
      {isSample && hovered && onRemoveApp && (
        <Box
          onClick={(e) => {
            e.stopPropagation();
            onRemoveApp(app.name);
          }}
          sx={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: 'hsl(var(--destructive))',
            border: '2px solid hsl(var(--card))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.1s ease',
            '&:hover': { transform: 'scale(1.2)' },
          }}
        >
          <Box
            component="svg"
            viewBox="0 0 24 24"
            sx={{ width: 8, height: 8, stroke: 'white', strokeWidth: 3, fill: 'none' }}
          >
            <line x1="4" y1="4" x2="20" y2="20" />
            <line x1="20" y1="4" x2="4" y2="20" />
          </Box>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      <Tooltip
        title={
          <Box sx={{ textAlign: 'left', p: 0.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>
              {displayName}
            </Typography>
            {!isSample && (
              <Typography sx={{ fontSize: '0.7rem', color: app.isBlocked ? 'hsl(var(--destructive))' : disabled ? 'hsl(var(--muted-foreground))' : (app.isEnabled === false) ? 'hsl(var(--muted-foreground))' : app.hasValidAuth ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))' }}>
                {app.isBlocked
                  ? 'Runtime offline'
                  : disabled
                  ? 'Not enabled for ingestion'
                  : (app.isEnabled === false)
                    ? (side === 'right' ? (isNotification ? 'Notifications disabled' : 'Not forwarding') : 'Not enabled')
                    : app.hasValidAuth
                      ? (side === 'right' ? (isNotification ? 'Notifications active' : 'Forwarding') : 'Enabled')
                      : app.isActiveOnly ? 'Not enabled' : 'Inactive'}
              </Typography>
            )}
          </Box>
        }
        placement="bottom"
        arrow
        open={!popoverOpen && !confirmRemoveOpen && tooltipOpen}
        disableInteractive
        disableHoverListener
        disableFocusListener
        disableTouchListener
        slotProps={{
          popper: { sx: { zIndex: 10050 } },
          tooltip: {
            sx: {
              bgcolor: 'hsl(var(--popover))',
              color: 'hsl(var(--popover-foreground))',
              border: '1px solid hsl(var(--border))',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
              borderRadius: '8px',
              p: 1,
            },
          },
          arrow: {
            sx: {
              color: 'hsl(var(--popover))',
              '&::before': {
                border: '1px solid hsl(var(--border))',
                boxSizing: 'border-box',
              },
            },
          },
        }}
      >
        <Box
          onMouseEnter={openTooltip}
          onMouseLeave={closeTooltip}
          onMouseDown={closeTooltip}
          onClick={isSample ? undefined : handleClick}
          sx={{ textDecoration: 'none', cursor: 'pointer' }}
        >
          {content}
        </Box>
      </Tooltip>

      {/* Popover — webhook or app actions */}
      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          closeTooltip();
        }}
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
              minWidth: isWebhook ? 280 : 160,
              maxWidth: isWebhook ? 400 : undefined,
            },
          },
        }}
      >
        {isWebhook ? (
          /* Webhook popover — same UX as /incidents WebhookIngestionButton */
          <>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.5, display: 'block' }}>
              {webhookTitle}
              {app.isBlocked ? (
                <Chip label="Blocked" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))', fontWeight: 600 }} />
              ) : !webhookEnabled && (
                <Chip label="Not Active" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }} />
              )}
            </Typography>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1, display: 'block', lineHeight: 1.4 }}>
              {webhookEnabled
                ? (isVuln ? 'Send scanner findings to this URL to push vulnerabilities directly.' : 'Send alerts to this URL to push incidents directly.')
                : webhookInfo?.exists
                  ? 'This webhook is currently stopped. Enable it to receive pushed alerts.'
                  : (isVuln ? 'Enable to create a webhook endpoint for pushing vulnerabilities.' : 'Enable to create a webhook endpoint for pushing alerts.')}
            </Typography>

            {app.isBlocked && (
              <Box sx={{
                p: 1.25,
                mb: 1.25,
                borderRadius: 1,
                bgcolor: 'hsl(var(--destructive) / 0.08)',
                border: '1px solid hsl(var(--destructive) / 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--destructive))' }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--destructive))' }}>
                    Execution Blocked
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
                  {app.blockReason || 'The runtime location used by this webhook is offline.'}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  href={app.actionUrl || '/admin/runtime-locations'}
                  sx={{
                    fontSize: '0.7rem',
                    py: 0.25,
                    px: 1,
                    alignSelf: 'flex-start',
                    borderColor: 'hsl(var(--destructive))',
                    color: 'hsl(var(--destructive))',
                    textTransform: 'none',
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

            {webhookEnabled && webhookInfo?.url && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                bgcolor: 'hsl(var(--muted) / 0.5)', border: '1px solid hsl(var(--border))',
                borderRadius: 1, px: 1, py: 0.5, mb: 1,
              }}>
                <InputBase
                  value={webhookInfo.url}
                  readOnly
                  fullWidth
                  sx={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'hsl(var(--foreground))', '& input': { p: 0 } }}
                />
                <IconButton size="small" onClick={async () => {
                  try {
                    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(webhookInfo.url!);
                    }
                    setCopied(true);
                    import('sonner').then(({ toast }) => toast.success('Webhook URL copied'));
                    setTimeout(() => setCopied(false), 2000);
                  } catch { import('sonner').then(({ toast }) => toast.error('Failed to copy')); }
                }} sx={{ p: 0.5, color: 'hsl(var(--muted-foreground))' }}>
                  {copied ? <CheckIcon size={14} color={'hsl(var(--severity-low))'} /> : <ContentCopyIcon size={14} />}
                </IconButton>
              </Box>
            )}

            <Button
              size="small"
              startIcon={webhookEnabled ? <BlockIcon size={14} /> : <CheckCircleOutlineIcon size={14} />}
              onClick={async () => {
                const willBeEnabled = !webhookEnabled;
                setWebhookOptimistic(willBeEnabled);
                setAnchorEl(null);
                try {
                  const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      label: webhookLabel,
                      ...(willBeEnabled ? {} : { action_name: 'remove' }),
                    }),
                  });
                  if (!res.ok) throw new Error();
                  import('sonner').then(({ toast }) => toast.success(willBeEnabled ? `${webhookTitle} enabled` : `${webhookTitle} disabled`));
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('shuffle-workflow-toggled', {
                        detail: { label: webhookLabel, enabled: willBeEnabled },
                      }),
                    );
                    window.dispatchEvent(new CustomEvent('shuffle-workflows-updated'));
                  }
                  setWebhookOptimistic(null);
                  onWebhookToggled?.();
                } catch {
                  setWebhookOptimistic(null);
                  import('sonner').then(({ toast }) => toast.error('Failed to update webhook status'));
                }
              }}
              sx={{
                justifyContent: 'flex-start', textTransform: 'none', fontSize: '0.75rem',
                  color: webhookEnabled ? 'hsl(var(--destructive))' : 'hsl(var(--severity-low))',
                px: 1, py: 0.5, borderRadius: 1,
                  '&:hover': { bgcolor: webhookEnabled ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--severity-low) / 0.1)' },
              }}
            >
              {webhookEnabled ? 'Disable Webhook' : 'Enable Webhook'}
            </Button>
          </>
        ) : (
          /* Regular app popover */
          <>
            {(() => {
              const isDestination = side === 'right';
              const currentLabel = usecaseLabel || 'this usecase';
              const statusLabel = app.isBlocked
                ? 'Blocked'
                : !isEnabled
                ? 'Not in use'
                : (app.hasValidAuth ? 'Validated' : (app.isActiveOnly ? 'Active' : 'Active'));
              const statusColor = app.isBlocked
                ? 'hsl(var(--destructive))'
                : !isEnabled
                ? 'hsl(var(--muted-foreground))'
                : (app.hasValidAuth ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-medium))');
              const statusBg = app.isBlocked
                ? 'hsl(var(--destructive) / 0.12)'
                : !isEnabled
                ? 'hsl(var(--muted))'
                : (app.hasValidAuth ? 'hsl(var(--severity-low) / 0.12)' : 'hsl(var(--severity-medium) / 0.12)');

              const subtitleText = isDestination
                ? (isNotification
                  ? (isEnabled ? 'Notifications active' : 'Notifications disabled')
                  : (isEnabled ? 'Forwarding active' : 'Not forwarding'))
                : (isEnabled ? `Active in ${currentLabel}` : `Not part of ${currentLabel}`);

              const toggleButtonLabel = isDestination
                ? (isNotification
                  ? (isEnabled ? 'Disable Notifications' : 'Enable Notifications')
                  : (isEnabled ? 'Disable Forwarding' : 'Enable Forwarding'))
                : (isEnabled ? `Disable for ${currentLabel}` : `Enable for ${currentLabel}`);

              return (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', textTransform: 'capitalize', fontSize: '0.8rem' }}>
                      {displayName}
                    </Typography>
                    <Chip
                      label={statusLabel}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.65rem',
                        bgcolor: statusBg,
                        color: statusColor,
                        fontWeight: 500,
                        border: '1px solid hsla(var(--border) / 0.5)',
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', mb: 1.25 }}>
                    {subtitleText}
                  </Typography>
                  {app.isBlocked && (
                    <Box sx={{
                      p: 1.25,
                      mb: 1.25,
                      borderRadius: 1,
                      bgcolor: 'hsl(var(--destructive) / 0.08)',
                      border: '1px solid hsl(var(--destructive) / 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.75,
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--destructive))' }} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--destructive))' }}>
                          Execution Blocked
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
                        {app.blockReason || 'The runtime location used by this workflow is offline.'}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        href={app.actionUrl || '/admin/runtime-locations'}
                        sx={{
                          fontSize: '0.7rem',
                          py: 0.25,
                          px: 1,
                          alignSelf: 'flex-start',
                          borderColor: 'hsl(var(--destructive))',
                          color: 'hsl(var(--destructive))',
                          textTransform: 'none',
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {onToggleSync && (
                      <Button
                        size="small"
                        startIcon={isEnabled ? <PowerOff size={14} /> : <Power size={14} />}
                        onClick={handleToggle}
                        sx={{
                          justifyContent: 'flex-start',
                          textTransform: 'none',
                          fontSize: '0.75rem',
                          color: isEnabled ? 'hsl(var(--destructive))' : 'hsl(var(--severity-low))',
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          '&:hover': {
                            bgcolor: isEnabled ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--severity-low) / 0.1)',
                          },
                        }}
                      >
                        {toggleButtonLabel}
                      </Button>
                    )}
                    <Button
                      size="small"
                      startIcon={<OpenInNewIcon size={14} />}
                      onClick={() => {
                        setAnchorEl(null);
                        onVisitApp?.(app.name);
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
                      Open app
                    </Button>
                    {onRemoveApp && (
                      <Button
                        size="small"
                        startIcon={<CloseIcon size={14} />}
                        onClick={() => {
                          setAnchorEl(null);
                          setConfirmRemoveOpen(true);
                        }}
                        sx={{
                          justifyContent: 'flex-start',
                          textTransform: 'none',
                          fontSize: '0.75rem',
                          color: 'hsl(var(--muted-foreground))',
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' },
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>
                </>
              );
            })()}
          </>
        )}
      </Popover>

      {/* Confirm remove dialog */}
      <Dialog
        open={confirmRemoveOpen}
        onClose={() => setConfirmRemoveOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            p: 3,
            minWidth: 320,
            maxWidth: 400,
          },
        }}
      >
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.5 }}>
          Remove {displayName}?
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', mb: 2 }}>
          This will hide the app from this diagram.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
            size="small"
            onClick={() => setConfirmRemoveOpen(false)}
            sx={{ textTransform: 'none', fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', px: 2, py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'hsl(var(--muted))' } }}
          >
            Cancel
          </Button>
          <Button
            size="small"
            onClick={() => {
              setConfirmRemoveOpen(false);
              onRemoveApp?.(app.name);
            }}
            sx={{ textTransform: 'none', fontSize: '0.78rem', color: 'white', bgcolor: 'hsl(var(--destructive))', px: 2, py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.85)' } }}
          >
            Remove
          </Button>
        </Box>
      </Dialog>
    </>
  );
}

// ── Shuffle Pipelines Banner ───────────────────────────────────────────────────

export function ShufflePipelinesBanner() {
  return (
    <Box
      component="a"
      href="/detection"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        mb: 2,
        borderRadius: 2.5,
        background: 'linear-gradient(135deg, hsla(25, 100%, 50%, 0.08) 0%, hsla(25, 100%, 50%, 0.03) 100%)',
        border: '1px solid hsla(25, 100%, 50%, 0.2)',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          border: '1px solid hsla(25, 100%, 50%, 0.4)',
          background: 'linear-gradient(135deg, hsla(25, 100%, 50%, 0.12) 0%, hsla(25, 100%, 50%, 0.05) 100%)',
        },
      }}
    >
      <Box
        component="img"
        src={shuffleIcon}
        alt="Shuffle"
        sx={{ width: 36, height: 36, borderRadius: '10px', flexShrink: 0 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
          Shuffle Pipelines
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
          Don't have a SIEM? Shuffle can ingest, parse, and correlate your logs and events directly — no external SIEM required.
        </Typography>
      </Box>
      <Chip
        label="Built-in"
        size="small"
        sx={{
          height: 22,
          fontSize: '0.65rem',
          fontWeight: 700,
          backgroundColor: 'hsl(var(--primary) / 0.15)',
          color: 'hsl(var(--primary))',
          border: '1px solid hsl(var(--primary) / 0.3)',
          flexShrink: 0,
        }}
      />
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UsecaseAlluvialDiagram({
  flowId,
  sourceCategory,
  targetCategory,
  highlightCategory,
  lockSource = false,
  omitSource = false,
  notificationWorkflow: propNotificationWorkflow,
  isFlowEnabled,
  usecaseLabel,
  isLoggedIn = false,
  onBubbleClick,
  onAddTool,
  workflows: initialWorkflows,
}: UsecaseAlluvialDiagramProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  // isLoggedIn comes from props (host injects); defaults to false.
  const appDetailCtx = useAppDetailOptional();
  const handleVisitApp = useCallback((appName: string) => {
    appDetailCtx?.openApp(appName);
  }, [appDetailCtx]);

  const shouldOmitSource = Boolean(
    omitSource ||
    flowId === 'case_management_communication_1' ||
    (sourceCategory === 'case_management' && targetCategory === 'communication')
  );
  const isNotificationFlow =
    flowId === 'case_management_communication_1' ||
    (sourceCategory === 'case_management' && targetCategory === 'communication');
  const isForwardTicketsFlow = flowId === 'case_management_cases_forward_1';

  const isVulnFlow =
    flowId === 'vulnerability_ingestion_1' ||
    Boolean(flowId?.includes('vuln')) ||
    sourceCategory === 'vulnerabilities' ||
    sourceCategory === 'asset_management';

  const findDiagramWebhookWorkflow = useCallback(
    (wfList: any[]) => {
      if (!Array.isArray(wfList)) return null;
      if (isVulnFlow) {
        return (
          wfList.find((w: any) => {
            const n = (w.name || '').toLowerCase().trim();
            const tags = Array.isArray(w.tags) ? w.tags.map((t: any) => String(t).toLowerCase().trim()) : [];
            return (
              n === 'vulnerabilities webhook' ||
              n === 'vulnerability webhook' ||
              n === 'vulnerability ingestion webhook' ||
              (n.includes('vulnerab') && n.includes('webhook')) ||
              tags.includes('vulnerabilities_webhook') ||
              tags.includes('vulnerability_webhook')
            );
          }) || null
        );
      }
      return (
        wfList.find((w: any) => {
          const n = (w.name || '').toLowerCase().trim();
          return n === 'ingestion webhook' || (n.includes('ingest') && n.includes('webhook') && !n.includes('vulnerab'));
        }) || null
      );
    },
    [isVulnFlow],
  );

  const { workflows: healthWorkflows, getWorkflowHealth } = useWorkflowHealth();
  const effectiveWorkflows = (initialWorkflows && initialWorkflows.length > 0) ? initialWorkflows : healthWorkflows;

  const ingestWorkflow = useMemo(() => {
    if (isVulnFlow) {
      return (effectiveWorkflows || []).find((w: any) => {
        const n = (w.name || '').toLowerCase();
        const tags = Array.isArray(w.tags) ? w.tags.map((t: any) => String(t).toLowerCase()) : [];
        return n.includes('vulnerabilit') || tags.some((t: string) => t.includes('vulnerabilit'));
      }) || null;
    }
    return findIngestTicketsWorkflow(effectiveWorkflows || []);
  }, [effectiveWorkflows, isVulnFlow]);

  const webhookWorkflow = useMemo(() => {
    return findDiagramWebhookWorkflow(effectiveWorkflows || []);
  }, [effectiveWorkflows, findDiagramWebhookWorkflow]);

  const forwardWorkflow = useMemo(() => {
    return findForwardTicketsWorkflow(effectiveWorkflows || []);
  }, [effectiveWorkflows]);

  const notifWorkflow = useMemo(() => {
    return propNotificationWorkflow || (effectiveWorkflows || []).find((w: any) => {
      const n = (w.name || '').toLowerCase();
      return n === 'notification workflow' || n.includes('notification');
    }) || null;
  }, [effectiveWorkflows, propNotificationWorkflow]);

  const ingestHealth = useMemo(() => ingestWorkflow ? getWorkflowHealth(ingestWorkflow) : null, [ingestWorkflow, getWorkflowHealth]);
  const webhookHealth = useMemo(() => webhookWorkflow ? getWorkflowHealth(webhookWorkflow) : null, [webhookWorkflow, getWorkflowHealth]);
  const forwardHealth = useMemo(() => forwardWorkflow ? getWorkflowHealth(forwardWorkflow) : null, [forwardWorkflow, getWorkflowHealth]);
  const notifHealth = useMemo(() => notifWorkflow ? getWorkflowHealth(notifWorkflow) : null, [notifWorkflow, getWorkflowHealth]);

  const cached = getAlluvialCache();
  const [allApps, setAllApps] = useState<AppNode[]>(() => cached?.allApps || []);
  const [ingestAppNames, setIngestAppNames] = useState<Set<string> | null>(() => cached?.ingestAppNames || null);
  const [forwardAppNames, setForwardAppNames] = useState<Set<string> | null>(() => cached?.forwardAppNames || null);
  const [notificationAppNames, setNotificationAppNames] = useState<Set<string> | null>(null);
  const [notificationWfEnabled, setNotificationWfEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(() => !cached);
  const [webhookInfo, setWebhookInfo] = useState<{ url: string | null; exists: boolean; enabled: boolean; workflowId: string | null }>(
    () => cached?.webhookInfo || { url: null, exists: false, enabled: false, workflowId: null }
  );
  const [searchOpen, setSearchOpen] = useState<'left' | 'right' | null>(null);
  // Track apps manually added to the destination via "+ Add" (bypasses category matching)
  const [manualDestApps, setManualDestApps] = useState<Set<string>>(new Set());
  const pendingTogglesRef = useRef<Map<string, boolean>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache Algolia icons for guest-added apps (name → icon URL)
  const [guestAppIcons, setGuestAppIcons] = useState<Record<string, string>>({});

  // Fetch icons from Algolia for guest apps loaded from URL params
  useEffect(() => {
    if (isLoggedIn) return;
    const allGuestNames = [
      ...(searchParams.get('source')?.split(',').filter(Boolean) || []),
      ...(searchParams.get('dest')?.split(',').filter(Boolean) || []),
    ];
    const missing = allGuestNames.filter(n => !guestAppIcons[n.toLowerCase()]);
    if (missing.length === 0) return;

    const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
    (async () => {
      const icons: Record<string, string> = {};
      for (const name of missing) {
        try {
          const res = await client.searchSingleIndex({
            indexName: 'appsearch',
            searchParams: { query: name.replace(/_/g, ' '), hitsPerPage: 1 },
          });
          const hit = res.hits[0] as any;
          if (hit?.image_url) {
            icons[name.toLowerCase()] = hit.image_url;
          }
        } catch { /* skip */ }
      }
      if (Object.keys(icons).length > 0) {
        setGuestAppIcons(prev => ({ ...prev, ...icons }));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  // Guest-selected apps from URL params
  const guestSourceNames = useMemo(() => {
    const raw = searchParams.get('source');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const guestDestNames = useMemo(() => {
    const raw = searchParams.get('dest');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const addGuestApp = (side: 'left' | 'right', app: { name: string; icon: string }) => {
    const paramKey = side === 'left' ? 'source' : 'dest';
    const current = searchParams.get(paramKey);
    const names = current ? current.split(',').filter(Boolean) : [];
    if (!names.some(n => n.toLowerCase() === app.name.toLowerCase())) {
      names.push(app.name);
    }
    const newParams = new URLSearchParams(searchParams);
    newParams.set(paramKey, names.join(','));
    setSearchParams(newParams, { replace: true });
    // Store the Algolia icon so we can render it
    if (app.icon) {
      setGuestAppIcons(prev => ({ ...prev, [app.name.toLowerCase()]: app.icon }));
    }
    // Clear from hiddenApps in case it was previously removed
    setHiddenApps(prev => {
      const next = new Set(prev);
      next.delete(app.name.toLowerCase());
      return next;
    });
  };

  // Locally disabled apps (hidden from the diagram)
  const [hiddenApps, setHiddenApps] = useState<Set<string>>(new Set());

  const handleRemoveApp = useCallback((appName: string) => {
    // For guests: also remove from URL params
    if (!isLoggedIn) {
      const newParams = new URLSearchParams(searchParams);
      for (const key of ['source', 'dest']) {
        const current = newParams.get(key);
        if (current) {
          const filtered = current.split(',').filter(n => n.toLowerCase() !== appName.toLowerCase());
          if (filtered.length > 0) {
            newParams.set(key, filtered.join(','));
          } else {
            newParams.delete(key);
          }
        }
      }
      setSearchParams(newParams, { replace: true });
    }
    setHiddenApps(prev => new Set(prev).add(appName.toLowerCase()));
  }, [isLoggedIn, searchParams, setSearchParams]);

  // Re-fetch webhook status after toggle
  const handleWebhookToggled = useCallback(async () => {
    try {
      const workflows = await fetchWorkflowsCached(
        getApiUrl('/api/v1/workflows'),
        { credentials: 'include', headers: { ...getAuthHeader() } },
        true,
      );
      const webhookWorkflow = findDiagramWebhookWorkflow(workflows);
      if (webhookWorkflow) {
        const webhookTrigger = (webhookWorkflow.triggers || []).find((t: any) => {
          const type = (t.trigger_type || '').toUpperCase();
          const app = (t.app_name || '').toLowerCase();
          const name = (t.name || '').toLowerCase();
          return type === 'WEBHOOK' || app === 'webhook' || name === 'webhook';
        });
        let webhookUrl: string | null = null;
        if (webhookTrigger) {
          const webhookId = webhookTrigger.id || webhookTrigger.trigger_id;
          if (webhookId) webhookUrl = getApiUrl(`/api/v1/hooks/webhook_${webhookId}`);
        }
        const triggerStopped = !webhookTrigger || (webhookTrigger.status || '').toLowerCase() === 'stopped';
        setWebhookInfo({ url: webhookUrl, exists: true, enabled: !triggerStopped, workflowId: webhookWorkflow.id });
      } else {
        setWebhookInfo({ url: null, exists: false, enabled: false, workflowId: null });
      }
    } catch {}
  }, [findDiagramWebhookWorkflow]);

  // Toggle sync: same debounced approach as /incidents page
  const handleToggleSync = useCallback((appName: string, enabled: boolean) => {
    // Optimistic update: toggle the app in ingestAppNames
    setIngestAppNames(prev => {
      if (!prev) return prev;
      const next = new Set(prev);
      const normalized = normalizeAppName(appName);
      if (enabled) {
        next.add(normalized);
      } else {
        next.delete(normalized);
      }
      return next;
    });
    updateAlluvialIngest(appName, enabled, normalizeAppName);

    pendingTogglesRef.current.set(appName, enabled);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const toggles = new Map(pendingTogglesRef.current);
      pendingTogglesRef.current.clear();

      // Build active app names from current source apps + toggles
      const currentIngest = ingestAppNames || new Set<string>();
      const activeNames: string[] = [];
      // Include currently enabled apps (minus any toggled off)
      allApps.filter(a => a.hasValidAuth && !isShuffleInternalApp(a.name)).forEach(a => {
        const norm = normalizeAppName(a.name);
        const isCurrentlyIn = currentIngest.has(norm);
        const toggled = toggles.get(a.name);
        const shouldBeEnabled = toggled !== undefined ? toggled : isCurrentlyIn;
        if (shouldBeEnabled) activeNames.push(a.name);
      });

      try {
        const { toast } = await import('sonner');
        await fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: 'Ingest Tickets',
            app_name: activeNames.join(','),
            category: 'cases',
          }),
        });
        toast.success('Ingestion sources updated');
      } catch (error) {
        console.error('Failed to update ingestion sources:', error);
        const { toast } = await import('sonner');
        toast.error('Failed to update ingestion sources');
      }
    }, 3000);
  }, [allApps, ingestAppNames]);

  /**
   * Re-fetch the Forward Tickets workflow and sync `forwardAppNames` from
   * the backend (workflow is the source of truth, mirroring AutomationConfig
   * on /onboarding/automate). Returns the freshly-extracted Set, or null if
   * the workflow could not be fetched / parsed.
   */
  const refreshForwardWorkflow = useCallback(async (): Promise<Set<string> | null> => {
    try {
      const workflows = await fetchWorkflowsCached(
        getApiUrl('/api/v1/workflows'),
        { credentials: 'include', headers: { ...getAuthHeader() } },
        true,
      );
      const forwardWf = findForwardTicketsWorkflow(workflows);
      if (!forwardWf) {
        setForwardAppNames(new Set());
        return new Set();
      }
      const fresh = extractWorkflowAppNames(forwardWf);
      setForwardAppNames(fresh);
      return fresh;
    } catch (err) {
      console.warn('[AlluvialDiagram] refreshForwardWorkflow failed:', err);
      return null;
    }
  }, []);

  /**
   * Push the desired full Forward Tickets app set to the backend (single
   * source-of-truth pattern used by /onboarding/automate AutomationConfig).
   * Sends every active app on every change, then re-fetches the workflow to
   * verify the new state landed. Reverts optimistic UI on mismatch.
   */
  const pushForwardWorkflow = useCallback(async (
    desiredAppNames: string[],
    intent: { action: 'add' | 'remove' | 'sync'; appName?: string },
  ): Promise<boolean> => {
    const { toast } = await import('sonner');
    try {
      const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Forward Tickets',
          app_name: desiredAppNames.join(','),
          category: 'cases',
        }),
      });
      if (!res.ok) {
        throw new Error(`generate failed: HTTP ${res.status}`);
      }

      // Verify the workflow now matches the desired state
      const verified = await refreshForwardWorkflow();
      const target = intent.appName ? normalizeAppName(intent.appName) : null;
      const verb = intent.action === 'remove' ? 'removed from' : 'added to';
      const label = intent.appName ? intent.appName.replace(/_/g, ' ') : 'Forwarding';

      if (verified && target) {
        const present = verified.has(target);
        const expectedPresent = intent.action !== 'remove';
        if (present !== expectedPresent) {
          toast.warning(
            `${label} not yet ${verb} forwarding`,
            { description: 'The Forward Tickets workflow did not pick up the change. Check the workflow.' },
          );
          return false;
        }
      }
      if (intent.action !== 'sync') {
        toast.success(`${label} ${verb} forwarding`);
      }
      return true;
    } catch (error) {
      console.error('Failed to update Forward Tickets workflow:', error);
      toast.error('Failed to update forwarding');
      // Revert optimistic state from the workflow (real source of truth)
      await refreshForwardWorkflow();
      return false;
    }
  }, [refreshForwardWorkflow]);

  // Toggle forwarding: add/remove app from Forward Tickets workflow.
  // Mirrors the /onboarding/automate "Forward" pattern: send the FULL list
  // of currently-forwarded apps every time, then verify by re-fetching.
  const handleToggleForward = useCallback((appName: string, enabled: boolean) => {
    const normalized = normalizeAppName(appName);

    // Optimistic UI update
    setForwardAppNames(prev => {
      const next = new Set(prev || []);
      if (enabled) next.add(normalized); else next.delete(normalized);
      return next;
    });

    // Build the desired full list (current ± this toggle), de-normalized to
    // the app names the backend expects.
    const currentSet = new Set(forwardAppNames || []);
    if (enabled) currentSet.add(normalized); else currentSet.delete(normalized);

    // Resolve normalized names back to display names
    const desiredAppNames: string[] = [];
    currentSet.forEach(norm => {
      const match = allApps.find(a => normalizeAppName(a.name) === norm);
      if (match) desiredAppNames.push(match.name);
      else if (norm === normalized) desiredAppNames.push(appName);
    });

    updateAlluvialForward(desiredAppNames, normalizeAppName);
    pushForwardWorkflow(desiredAppNames, {
      action: enabled ? 'add' : 'remove',
      appName,
    });
  }, [forwardAppNames, allApps, pushForwardWorkflow]);

  /**
   * Re-fetch the Notification Workflow and extract active app names.
   */
  const refreshNotificationWorkflow = useCallback(async (): Promise<Set<string> | null> => {
    try {
      const workflows = await fetchWorkflowsCached(
        getApiUrl('/api/v1/workflows'),
        { credentials: 'include', headers: { ...getAuthHeader() } },
        true,
      );
      const notifWf = propNotificationWorkflow || findNotificationWorkflow(workflows);
      if (!notifWf) {
        setNotificationAppNames(new Set());
        setNotificationWfEnabled(false);
        return new Set();
      }
      const allStopped = Array.isArray(notifWf.triggers) && notifWf.triggers.length > 0 && notifWf.triggers.every((t: any) => t.status === 'stopped' || t.status === 'disabled');
      const active = (isFlowEnabled !== undefined ? isFlowEnabled : true) && !allStopped;
      setNotificationWfEnabled(active);
      const fresh = active ? extractNotificationWorkflowAppNames(notifWf) : new Set<string>();
      setNotificationAppNames(fresh);
      return fresh;
    } catch (err) {
      console.warn('[AlluvialDiagram] refreshNotificationWorkflow failed:', err);
      return null;
    }
  }, [propNotificationWorkflow, isFlowEnabled]);

  /**
   * Push the desired full Notification app set to the backend.
   */
  const pushNotificationWorkflow = useCallback(async (
    desiredAppNames: string[],
    intent: { action: 'add' | 'remove'; appName: string },
  ): Promise<boolean> => {
    const { toast } = await import('sonner');
    try {
      const body: Record<string, string> = { label: 'Notifications' };
      if (desiredAppNames.length > 0) {
        body.app_name = desiredAppNames.join(',');
      } else {
        body.action_name = 'remove';
      }
      const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`generate failed: HTTP ${res.status}`);
      }

      await refreshNotificationWorkflow();
      const verb = intent.action === 'remove' ? 'disabled for' : 'enabled for';
      toast.success(`${intent.appName.replace(/_/g, ' ')} ${verb} Notifications`);
      return true;
    } catch (error) {
      console.error('Failed to update Notifications workflow:', error);
      toast.error('Failed to update notifications');
      await refreshNotificationWorkflow();
      return false;
    }
  }, [refreshNotificationWorkflow]);

  const handleToggleNotification = useCallback((appName: string, enabled: boolean) => {
    const normalized = normalizeAppName(appName);

    setNotificationAppNames(prev => {
      const next = new Set(prev || []);
      if (enabled) next.add(normalized); else next.delete(normalized);
      return next;
    });

    const currentSet = new Set(notificationAppNames || []);
    if (enabled) currentSet.add(normalized); else currentSet.delete(normalized);

    const desiredAppNames: string[] = [];
    currentSet.forEach(norm => {
      const match = allApps.find(a => normalizeAppName(a.name) === norm);
      if (match) desiredAppNames.push(match.name);
      else if (norm === normalized) desiredAppNames.push(appName);
    });

    pushNotificationWorkflow(desiredAppNames, {
      action: enabled ? 'add' : 'remove',
      appName,
    });
  }, [notificationAppNames, allApps, pushNotificationWorkflow]);

  const handleToggleDestinationApp = useCallback((appName: string, enabled: boolean) => {
    if (isNotificationFlow) {
      handleToggleNotification(appName, enabled);
    } else {
      handleToggleForward(appName, enabled);
    }
  }, [isNotificationFlow, handleToggleNotification, handleToggleForward]);

  useEffect(() => {
    if (!isLoggedIn) { setLoading(false); return; }

    let cancelled = false;

    const runFetch = async () => {
      try {
        const mem = getAlluvialCache();
        // If we don't have any cached data at all, indicate loading
        if (!mem) {
          setLoading(true);
        } else if (Date.now() - mem.ts < 60_000) {
          // Fresh in-memory cache hit — skip duplicate fetch on drawer open
          setLoading(false);
          return;
        }

        // Parallel fetch: auth apps and active apps using request-coalescing cached fetcher
        const [authRes, appsRes] = await Promise.all([
          fetchAppsCached(getApiUrl('/api/v1/apps/authentication'), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          }),
          fetchAppsCached(getApiUrl('/api/v1/apps'), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          }),
        ]);

        const authNameSet = new Set<string>();
        let nodes: AppNode[] = [];

        if (authRes.ok) {
          const result = await authRes.json();
          const authData: AuthAppEntry[] = result.data || result;
          if (Array.isArray(authData)) {
            const deduped = deduplicateAuthApps(authData);
            await backfillAppImages(deduped);
            nodes = deduped.map(({ app, hasValidAuth, bestImage }) => {
              authNameSet.add(app.name.toLowerCase());
              return {
                id: app.id,
                name: app.name,
                icon: bestImage || app.large_image || '',
                hasValidAuth,
                isActiveOnly: false,
              };
            });
          }
        }

        // Fill with active apps
        if (appsRes.ok) {
          try {
            const appsData = await appsRes.json();
            if (Array.isArray(appsData)) {
              for (const app of appsData.filter((a: any) => a.activated)) {
                if (!authNameSet.has((app.name || '').toLowerCase())) {
                  authNameSet.add((app.name || '').toLowerCase());
                  nodes.push({
                    id: app.id || app.name,
                    name: app.name,
                    icon: app.large_image || '',
                    hasValidAuth: false,
                    isActiveOnly: true,
                  });
                }
              }
            }
          } catch (_) {}
        }

        // Workflows: use initialWorkflows prop if provided, else read from workflows cache or fetch
        let workflowsData = initialWorkflows;
        if (!workflowsData || !workflowsData.length) {
          try {
            workflowsData = await fetchWorkflowsCached(getApiUrl('/api/v1/workflows'), {
              credentials: 'include',
              headers: { ...getAuthHeader() },
            });
          } catch (_) {}
        }

        let nextIngest = new Set<string>();
        let nextForward = new Set<string>();
        let nextNotification = new Set<string>();
        let isNotifWfActive = false;
        let nextWebhook = { url: null as string | null, exists: false, enabled: false, workflowId: null as string | null };

        if (Array.isArray(workflowsData)) {
          const ingestWf = findIngestTicketsWorkflow(workflowsData);
          if (ingestWf) {
            nextIngest = extractWorkflowAppNames(ingestWf);
          }
          const vulnWf = workflowsData.find((w: any) => {
            const n = (w.name || '').toLowerCase();
            const tags = Array.isArray(w.tags) ? w.tags.map((t: any) => String(t).toLowerCase()) : [];
            return n.includes('vulnerabilit') || tags.some((t: string) => t.includes('vulnerabilit'));
          });
          if (vulnWf) {
            const vulnApps = extractWorkflowAppNames(vulnWf);
            vulnApps.forEach(a => nextIngest.add(a));
          }

          const forwardWf = findForwardTicketsWorkflow(workflowsData);
          if (forwardWf) {
            nextForward = extractWorkflowAppNames(forwardWf);
          }

          const notifWf = propNotificationWorkflow || findNotificationWorkflow(workflowsData);
          if (notifWf) {
            const allStopped = Array.isArray(notifWf.triggers) && notifWf.triggers.length > 0 && notifWf.triggers.every((t: any) => t.status === 'stopped' || t.status === 'disabled');
            isNotifWfActive = (isFlowEnabled !== undefined ? isFlowEnabled : true) && !allStopped;
            if (isNotifWfActive) {
              nextNotification = extractNotificationWorkflowAppNames(notifWf);
            }
          }

          const webhookWorkflow = findDiagramWebhookWorkflow(workflowsData);
          if (webhookWorkflow) {
            const webhookTrigger = (webhookWorkflow.triggers || []).find((t: any) => {
              const type = (t.trigger_type || '').toUpperCase();
              const app = (t.app_name || '').toLowerCase();
              const name = (t.name || '').toLowerCase();
              return type === 'WEBHOOK' || app === 'webhook' || name === 'webhook';
            });
            let webhookUrl: string | null = null;
            if (webhookTrigger) {
              const webhookId = webhookTrigger.id || webhookTrigger.trigger_id;
              if (webhookId) {
                webhookUrl = getApiUrl(`/api/v1/hooks/webhook_${webhookId}`);
              }
            }
            const triggerStopped = !webhookTrigger || (webhookTrigger.status || '').toLowerCase() === 'stopped';
            nextWebhook = { url: webhookUrl, exists: true, enabled: !triggerStopped, workflowId: webhookWorkflow.id };
          }
        }

        if (!cancelled) {
          setAllApps(nodes);
          setIngestAppNames(nextIngest);
          setForwardAppNames(nextForward);
          setNotificationAppNames(nextNotification);
          setNotificationWfEnabled(isNotifWfActive);
          setWebhookInfo(nextWebhook);
          setAlluvialCache({
            allApps: nodes,
            ingestAppNames: nextIngest,
            forwardAppNames: nextForward,
            webhookInfo: nextWebhook,
            ts: Date.now(),
          });
        }
      } catch (err) {
        console.error('[AlluvialDiagram] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runFetch();

    const handleInvalidate = () => {
      runFetch();
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
  }, [isLoggedIn, initialWorkflows, propNotificationWorkflow, isFlowEnabled]);

  // Permanent webhook node shown at the top of source column when applicable
  const webhookNode: AppNode = useMemo(() => ({
    id: 'webhook-ingestion',
    name: 'Webhook',
    icon: '',
    hasValidAuth: webhookInfo.enabled,
    isActiveOnly: false,
    isHighlighted: true,
    isEnabled: !isLoggedIn || webhookInfo.enabled || webhookInfo.exists,
    isBlocked: Boolean(webhookInfo.enabled && webhookHealth?.hasProblem),
    blockReason: webhookHealth?.primaryProblem?.description,
    actionUrl: webhookHealth?.primaryProblem?.actionUrl,
  }), [webhookInfo, isLoggedIn, webhookHealth]);

  // Source apps:
  // If shouldOmitSource is true (e.g. Notifications), omit the left column entirely.
  // If lockSource is true, Shuffle/Cases is fixed as the only source node (cannot be changed).
  // Otherwise if highlightCategory is set, show ingest workflow apps with highlighting.
  const sourceApps = useMemo(() => {
    if (shouldOmitSource) {
      return [];
    }

    if (lockSource) {
      const defaultCasesNode: AppNode = {
        id: 'shuffle-cases',
        name: isForwardTicketsFlow && usecaseLabel ? usecaseLabel.replace('Forward ', '') : 'Cases',
        icon: shuffleIcon,
        hasValidAuth: true,
        isActiveOnly: false,
        isHighlighted: true,
        isEnabled: true,
        isBlocked: Boolean(isForwardTicketsFlow && forwardHealth?.hasProblem),
        blockReason: forwardHealth?.primaryProblem?.description,
        actionUrl: forwardHealth?.primaryProblem?.actionUrl,
      };
      if (!isLoggedIn) {
        return [defaultCasesNode];
      }
      const caseApps = allApps.filter(
        a => !isShuffleInternalApp(a.name) && matchesCategory(a.name, 'case_management')
      );
      if (caseApps.length > 0) {
        return caseApps.map(a => ({
          ...a,
          isHighlighted: true,
          isEnabled: true,
          isBlocked: Boolean(isForwardTicketsFlow && forwardHealth?.hasProblem),
          blockReason: forwardHealth?.primaryProblem?.description,
          actionUrl: forwardHealth?.primaryProblem?.actionUrl,
        }));
      }
      return [defaultCasesNode];
    }

    const prependWebhook = (apps: AppNode[]) => [webhookNode, ...apps];

    if (!isLoggedIn) {
      const samples = highlightCategory ? getSampleApps(highlightCategory) : getSampleApps(sourceCategory);
      // Add guest-selected apps from URL
      const guestNodes: AppNode[] = guestSourceNames
        .filter(name => !samples.some(s => s.name.toLowerCase() === name.toLowerCase()))
        .map(name => ({
          id: `guest-${name}`,
          name,
          icon: guestAppIcons[name.toLowerCase()] || `https://storage.googleapis.com/shuffle_public/app_images/${name.replace(/\s+/g, '_')}.png`,
          hasValidAuth: false,
          isActiveOnly: false,
          isHighlighted: true,
          isEnabled: true,
        }));
      return prependWebhook(
        [...samples.map(a => ({ ...a, isHighlighted: true, isEnabled: true })), ...guestNodes]
          .filter(a => !hiddenApps.has(a.name.toLowerCase()))
      );
    }

    const isSourceBlocked = Boolean(ingestHealth?.hasProblem);
    const sourceBlockReason = ingestHealth?.primaryProblem?.description;
    const sourceActionUrl = ingestHealth?.primaryProblem?.actionUrl;

    if (highlightCategory && ingestAppNames) {
      // Only show apps that match the usecase's source category from the user's apps
      const categoryApps = allApps.filter(a =>
        !isShuffleInternalApp(a.name) && matchesCategory(a.name, highlightCategory)
      );

      const enabledNodes = categoryApps
        .filter(a => ingestAppNames.has(normalizeAppName(a.name)))
        .map(a => ({
          ...a,
          isHighlighted: true,
          isEnabled: true,
          isBlocked: isSourceBlocked,
          blockReason: sourceBlockReason,
          actionUrl: sourceActionUrl,
        }));

      const disabledNodes = categoryApps
        .filter(a => !ingestAppNames.has(normalizeAppName(a.name)))
        .map(a => ({
          ...a,
          isHighlighted: false,
          isEnabled: false,
        }));

      // If user has no apps matching this category, fall back to samples
      const filtered = [...enabledNodes, ...disabledNodes].filter(a => !hiddenApps.has(a.name.toLowerCase()));
      if (filtered.length === 0) {
        const samples = getSampleApps(highlightCategory);
        return prependWebhook(samples.map(a => ({ ...a, isHighlighted: true, isEnabled: true })));
      }

      return prependWebhook(filtered);
    }
    return prependWebhook(
      allApps.filter(a => matchesCategory(a.name, sourceCategory) && !hiddenApps.has(a.name.toLowerCase())).map(a => ({
        ...a,
        isEnabled: true,
        isBlocked: isSourceBlocked,
        blockReason: sourceBlockReason,
        actionUrl: sourceActionUrl,
      }))
    );
  }, [allApps, sourceCategory, highlightCategory, ingestAppNames, isLoggedIn, guestSourceNames, guestAppIcons, hiddenApps, webhookNode, lockSource, shouldOmitSource, isForwardTicketsFlow, usecaseLabel, ingestHealth, forwardHealth]);

  // Target/destination apps: user-selectable
  const targetApps = useMemo(() => {
    if (!isLoggedIn) {
      const samples = getSampleApps(targetCategory);
      // Add guest-selected apps from URL
      const guestNodes: AppNode[] = guestDestNames
        .filter(name => !samples.some(s => s.name.toLowerCase() === name.toLowerCase()))
        .map(name => ({
          id: `guest-${name}`,
          name,
          icon: guestAppIcons[name.toLowerCase()] || `https://storage.googleapis.com/shuffle_public/app_images/${name.replace(/\s+/g, '_')}.png`,
          hasValidAuth: false,
          isActiveOnly: false,
        }));
      return [...samples, ...guestNodes].filter(a => !hiddenApps.has(a.name.toLowerCase()));
    }

    const isMultiCategory = isForwardTicketsFlow || isNotificationFlow;
    const matched = allApps.filter(a =>
      !isShuffleInternalApp(a.name) &&
      (matchesCategory(a.name, targetCategory) ||
        (isMultiCategory && (matchesCategory(a.name, 'communication') || matchesCategory(a.name, 'case_management'))) ||
        manualDestApps.has(normalizeAppName(a.name))) &&
      !hiddenApps.has(a.name.toLowerCase())
    );

    // If user has no matching apps, fall back to samples
    if (matched.length === 0) {
      const samples = getSampleApps(targetCategory);
      return samples.filter(a => !hiddenApps.has(a.name.toLowerCase()));
    }

    if (isNotificationFlow) {
      const isEnabled = (appName: string) => {
        if (!notificationWfEnabled) return false;
        const norm = normalizeAppName(appName);
        return Boolean(notificationAppNames && (notificationAppNames.has(norm) || notificationAppNames.has(appName.toLowerCase().trim())));
      };
      const isNotifBlocked = Boolean(notifHealth?.hasProblem);
      const notifBlockReason = notifHealth?.primaryProblem?.description;
      const notifActionUrl = notifHealth?.primaryProblem?.actionUrl;

      const enabledApps = matched
        .filter(a => isEnabled(a.name))
        .map(a => ({
          ...a,
          isEnabled: true,
          isBlocked: isNotifBlocked,
          blockReason: notifBlockReason,
          actionUrl: notifActionUrl,
        }));
      const disabledApps = matched
        .filter(a => !isEnabled(a.name))
        .map(a => ({ ...a, isEnabled: false }));
      return [...enabledApps, ...disabledApps];
    }

    if (isForwardTicketsFlow) {
      const isEnabled = (appName: string) => {
        const norm = normalizeAppName(appName);
        return Boolean(forwardAppNames && forwardAppNames.size > 0 && (forwardAppNames.has(norm) || forwardAppNames.has(appName.toLowerCase().trim())));
      };
      const isForwardBlocked = Boolean(forwardHealth?.hasProblem);
      const forwardBlockReason = forwardHealth?.primaryProblem?.description;
      const forwardActionUrl = forwardHealth?.primaryProblem?.actionUrl;

      const enabledApps = matched
        .filter(a => isEnabled(a.name))
        .map(a => ({
          ...a,
          isEnabled: true,
          isBlocked: isForwardBlocked,
          blockReason: forwardBlockReason,
          actionUrl: forwardActionUrl,
        }));
      const disabledApps = matched
        .filter(a => !isEnabled(a.name))
        .map(a => ({ ...a, isEnabled: false }));
      return [...enabledApps, ...disabledApps];
    }

    if (forwardAppNames && forwardAppNames.size > 0) {
      const isForwardBlocked = Boolean(forwardHealth?.hasProblem);
      const forwardBlockReason = forwardHealth?.primaryProblem?.description;
      const forwardActionUrl = forwardHealth?.primaryProblem?.actionUrl;

      const enabledApps = matched
        .filter(a => forwardAppNames.has(normalizeAppName(a.name)))
        .map(a => ({
          ...a,
          isEnabled: true,
          isBlocked: isForwardBlocked,
          blockReason: forwardBlockReason,
          actionUrl: forwardActionUrl,
        }));
      const disabledApps = matched
        .filter(a => !forwardAppNames.has(normalizeAppName(a.name)))
        .map(a => ({ ...a, isEnabled: false }));
      return [...enabledApps, ...disabledApps];
    }
    return matched;
  }, [allApps, targetCategory, forwardAppNames, notificationAppNames, notificationWfEnabled, isNotificationFlow, isForwardTicketsFlow, isLoggedIn, guestDestNames, guestAppIcons, hiddenApps, manualDestApps, notifHealth, forwardHealth]);

  const sourceMeta = TOOL_CATEGORIES.find(c => c.id === sourceCategory);
  const targetMeta = TOOL_CATEGORIES.find(c => c.id === targetCategory);

  // Source label: when showing ingest apps, label as "Ingestion Sources"
  const sourceLabel = shouldOmitSource
    ? ''
    : lockSource && sourceCategory === 'case_management'
      ? (isForwardTicketsFlow && usecaseLabel ? usecaseLabel.replace('Forward ', '') : 'Cases')
      : (sourceCategory === 'asset_management' || sourceCategory === 'vulnerabilities')
        ? 'Vulnerability Scanners'
        : highlightCategory
          ? 'Ingestion Sources'
          : (sourceMeta?.label || sourceCategory);

  const targetLabel = isNotificationFlow
    ? 'Notifications'
    : isForwardTicketsFlow
      ? 'Destination'
      : targetCategory === 'communication'
        ? 'Notifications'
        : targetCategory === 'case_management'
          ? 'Cases (optional)'
          : (targetMeta?.label || targetCategory);

  // Maximum visible nodes per side when collapsed
  const MAX_COLLAPSED_NODES = 6;
  const [expandedLeft, setExpandedLeft] = useState(false);
  const [expandedRight, setExpandedRight] = useState(false);

  const hasMoreLeft = !shouldOmitSource && sourceApps.length > MAX_COLLAPSED_NODES;
  const hasMoreRight = targetApps.length > MAX_COLLAPSED_NODES;

  const visibleSourceApps = shouldOmitSource
    ? []
    : (expandedLeft || !hasMoreLeft ? sourceApps : sourceApps.slice(0, MAX_COLLAPSED_NODES));

  const visibleTargetApps = expandedRight || !hasMoreRight
    ? targetApps
    : targetApps.slice(0, MAX_COLLAPSED_NODES);

  // SVG dimensions
  const nodeSize = 40;
  const colWidth = 80;
  const svgPadding = 20;
  const rowGap = 16;
  const addButtonSpace = 48; // space for the + button below apps
  const showMoreSpace = (hasMoreLeft || hasMoreRight) ? 36 : 0;

  const maxNodes = shouldOmitSource
    ? Math.max(visibleTargetApps.length, 1)
    : Math.max(visibleSourceApps.length, visibleTargetApps.length, 1);
  const colHeight = maxNodes * (nodeSize + rowGap) - rowGap;
  const svgHeight = colHeight + svgPadding * 2 + 40 + addButtonSpace + showMoreSpace;
  const svgWidth = shouldOmitSource ? 420 : (colWidth * 3 + 300);

  const leftX = svgPadding + nodeSize / 2;
  const shuffleX = shouldOmitSource ? (svgPadding + 44) : (svgWidth / 2);
  const centerX = shouldOmitSource ? shuffleX : (svgWidth / 2);
  const rightX = svgWidth - svgPadding - nodeSize / 2;

  const centerY = (svgHeight - 30 - showMoreSpace) / 2;
  const fromX = shouldOmitSource ? (shuffleX + 28) : (centerX + 28);

  const getY = (idx: number, total: number) => {
    const totalHeight = total * (nodeSize + rowGap) - rowGap;
    const startY = centerY - totalHeight / 2 + nodeSize / 2;
    return startY + idx * (nodeSize + rowGap);
  };

  const getShowMoreY = (appCount: number) => {
    if (appCount === 0) return centerY;
    const lastY = getY(appCount - 1, appCount);
    return lastY + nodeSize / 2 + 10;
  };

  // Y position for the add button (below the last app or show-more button, or at center if no apps)
  const getAddButtonY = (appCount: number, hasShowMore = false) => {
    if (appCount === 0) return centerY;
    const lastY = getY(appCount - 1, appCount);
    if (hasShowMore) {
      return lastY + nodeSize / 2 + 10 + 32;
    }
    return lastY + nodeSize / 2 + rowGap + 16;
  };

  const makePath = (fromX: number, fromY: number, toX: number, toY: number) => {
    const cx1 = fromX + (toX - fromX) * 0.45;
    const cx2 = fromX + (toX - fromX) * 0.55;
    // When fromY ≈ toY the bezier is flat/invisible — add a slight arc
    const yDiff = Math.abs(fromY - toY);
    if (yDiff < 8) {
      const bulge = 20; // vertical offset to create visible curvature
      return `M ${fromX} ${fromY} C ${cx1} ${fromY - bulge}, ${cx2} ${toY - bulge}, ${toX} ${toY}`;
    }
    return `M ${fromX} ${fromY} C ${cx1} ${fromY}, ${cx2} ${toY}, ${toX} ${toY}`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 4, py: 4, px: 2, alignItems: 'center' }}>
        {/* Left column shimmer */}
        {!shouldOmitSource && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{
                  height: 48,
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                  '@keyframes shimmer': {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' },
                  },
                }}
              />
            ))}
          </Box>
        )}
        {/* Center lines shimmer */}
        <Box sx={{ width: 60, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          {[1, 2, 3].map((i) => (
            <Box
              key={i}
              sx={{
                height: 2,
                width: '100%',
                borderRadius: 1,
                background: 'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </Box>
        {/* Right column shimmer */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Box
              key={i}
              sx={{
                height: 48,
                borderRadius: 2,
                background: 'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </Box>
      </Box>
    );
  }

  const hasApps = sourceApps.length > 0 || targetApps.length > 0;

  const isSiemSource = sourceCategory === 'siem' || highlightCategory === 'siem';

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>


      <Box sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <svg
          width={svgWidth}
          height={svgHeight + 30}
          viewBox={`0 0 ${svgWidth} ${svgHeight + 30}`}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="flow-gradient-left" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="flow-gradient-right" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Flow paths: source → center (only for enabled apps, skipped when shouldOmitSource) */}
          {!shouldOmitSource && visibleSourceApps.map((app, i) => {
            if (app.isEnabled === false) return null;
            const fromY = getY(i, visibleSourceApps.length);
            const isBlocked = Boolean(app.isBlocked);
            return (
              <path
                key={`sl-${i}`}
                d={makePath(leftX + nodeSize / 2 + 4, fromY, centerX - 28, centerY)}
                fill="none"
                stroke={isBlocked ? "hsl(var(--destructive))" : "url(#flow-gradient-left)"}
                strokeDasharray={isBlocked ? "5 4" : undefined}
                strokeWidth={2.5}
                opacity={isBlocked ? 0.9 : 0.7}
              />
            );
          })}

          {/* Flow paths: center → target (only for enabled/forwarding apps) */}
          {visibleTargetApps.map((app, i) => {
            if (isLoggedIn && app.isEnabled === false) return null;
            const toY = getY(i, visibleTargetApps.length);
            const isBlocked = Boolean(app.isBlocked);
            return (
              <path
                key={`sr-${i}`}
                d={makePath(fromX, centerY, rightX - nodeSize / 2 - 4, toY)}
                fill="none"
                stroke={isBlocked ? "hsl(var(--destructive))" : "url(#flow-gradient-right)"}
                strokeDasharray={isBlocked ? "5 4" : undefined}
                strokeWidth={2.5}
                opacity={app.isEnabled === false ? 0.2 : (isBlocked ? 0.9 : 0.7)}
              />
            );
          })}

          {/* Inbetween error markers on blocked flow paths */}
          {!shouldOmitSource && visibleSourceApps.map((app, i) => {
            if (app.isEnabled === false || !app.isBlocked) return null;
            const fromY = getY(i, visibleSourceApps.length);
            const startX = leftX + nodeSize / 2 + 4;
            const endX = centerX - 28;
            const midX = (startX + endX) / 2;
            const yDiff = Math.abs(fromY - centerY);
            const bulge = yDiff < 8 ? 20 : 0;
            const midY = (fromY + centerY) / 2 - (bulge ? bulge * 0.75 : 0);

            return (
              <g
                key={`err-l-${i}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (app.actionUrl) {
                    window.location.href = app.actionUrl;
                  }
                }}
              >
                <circle
                  cx={midX}
                  cy={midY}
                  r={10}
                  fill="hsl(var(--destructive))"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="900"
                  fontFamily="sans-serif"
                >
                  !
                </text>
                <title>{`${app.name}: ${app.blockReason || 'Workflow execution blocked by offline runtime location'}. Click to fix.`}</title>
              </g>
            );
          })}

          {visibleTargetApps.map((app, i) => {
            if (app.isEnabled === false || !app.isBlocked) return null;
            const toY = getY(i, visibleTargetApps.length);
            const startX = fromX;
            const endX = rightX - nodeSize / 2 - 4;
            const midX = (startX + endX) / 2;
            const yDiff = Math.abs(centerY - toY);
            const bulge = yDiff < 8 ? 20 : 0;
            const midY = (centerY + toY) / 2 - (bulge ? bulge * 0.75 : 0);

            return (
              <g
                key={`err-r-${i}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (app.actionUrl) {
                    window.location.href = app.actionUrl;
                  }
                }}
              >
                <circle
                  cx={midX}
                  cy={midY}
                  r={10}
                  fill="hsl(var(--destructive))"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="900"
                  fontFamily="sans-serif"
                >
                  !
                </text>
                <title>{`${app.name}: ${app.blockReason || 'Workflow execution blocked by offline runtime location'}. Click to fix.`}</title>
              </g>
            );
          })}

          {/* Animated particles — for authenticated and non-blocked source apps */}
          {!shouldOmitSource && visibleSourceApps.map((app, i) => {
            if (app.isEnabled === false || app.isBlocked) return null;
            if (isLoggedIn && !app.hasValidAuth) return null;
            const fromY = getY(i, visibleSourceApps.length);
            const pathD = makePath(leftX + nodeSize / 2 + 4, fromY, centerX - 28, centerY);
            return (
              <g key={`pl-${i}`}>
                <circle r="3" fill="hsl(var(--primary))" opacity="0.6" filter="url(#glow)">
                  <animateMotion dur={`${2.5 + i * 0.4}s`} repeatCount="indefinite" path={pathD} />
                </circle>
              </g>
            );
          })}
          {(shouldOmitSource || (isLoggedIn ? visibleSourceApps.some(app => app.hasValidAuth && app.isEnabled !== false && !app.isBlocked) : visibleSourceApps.length > 0)) && visibleTargetApps.map((app, i) => {
            if (isLoggedIn && (!app.hasValidAuth || app.isEnabled === false || app.isBlocked)) return null;
            const toY = getY(i, visibleTargetApps.length);
            const pathD = makePath(fromX, centerY, rightX - nodeSize / 2 - 4, toY);
            return (
              <g key={`pr-${i}`}>
                <circle r="3" fill="hsl(var(--primary))" opacity="0.6" filter="url(#glow)">
                  <animateMotion dur={`${2.5 + i * 0.4}s`} repeatCount="indefinite" path={pathD} />
                </circle>
              </g>
            );
          })}

          {/* Column labels */}
          {!shouldOmitSource && (
            <text x={leftX} y={svgHeight + 16} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="11" fontWeight="600">
              {sourceLabel}
            </text>
          )}
          <text x={shuffleX} y={svgHeight + 16} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="11" fontWeight="600">
            Shuffle
          </text>
          <text x={rightX} y={svgHeight + 16} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="11" fontWeight="600">
            {targetLabel}
          </text>
        </svg>

        {/* Overlay HTML app bubbles */}
        <Box sx={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: svgWidth, height: svgHeight + 30, pointerEvents: 'none' }}>
          {!shouldOmitSource && visibleSourceApps.map((app, i) => {
            const y = getY(i, visibleSourceApps.length);
            return (
              <Box
                key={app.id}
                sx={{
                  position: 'absolute',
                  left: leftX - nodeSize / 2,
                  top: y - nodeSize / 2,
                  pointerEvents: 'auto',
                }}
              >
                <AppBubble
                  app={app}
                  size={nodeSize}
                  highlighted={!!app.isHighlighted}
                  isSample={!isLoggedIn}
                  disabled={app.isEnabled === false}
                  usecaseLabel={usecaseLabel}
                  onRemoveApp={lockSource ? undefined : handleRemoveApp}
                  onToggleSync={isLoggedIn && highlightCategory ? handleToggleSync : undefined}
                  onVisitApp={handleVisitApp}
                  onPrimaryClick={onBubbleClick ? (name, el, s) => !!onBubbleClick({ appName: name, side: s, anchorEl: el }) : undefined}
                  webhookInfo={app.id === 'webhook-ingestion' ? webhookInfo : undefined}
                  onWebhookToggled={handleWebhookToggled}
                  isVuln={isVulnFlow}
                />
              </Box>
            );
          })}

          {/* Center / Origin: Shuffle logo */}
          <Box
            sx={{
              position: 'absolute',
              left: shuffleX - 24,
              top: centerY - 24,
              pointerEvents: 'auto',
            }}
          >
            <Tooltip
              placement="bottom"
              arrow
              slotProps={{
                popper: { sx: { zIndex: 10050 } },
                tooltip: {
                  sx: {
                    bgcolor: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    border: '1px solid hsl(var(--border))',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
                    borderRadius: '8px',
                    p: 1,
                  },
                },
                arrow: {
                  sx: {
                    color: 'hsl(var(--popover))',
                    '&::before': {
                      border: '1px solid hsl(var(--border))',
                      boxSizing: 'border-box',
                    },
                  },
                },
              }}
              title={
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
                  {['OCSF translation', 'Enrichment', 'Task creation', 'Agentic response'].map((step) => (
                    <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CheckIcon size={13} color={'hsl(var(--severity-low))'} />
                      <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
                        {step}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              }
            >
              <Box
                component="img"
                src={singulAgentIcon}
                alt="Shuffle Security Agent"
                sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: '6px' }}
              />
            </Tooltip>
          </Box>

          {visibleTargetApps.map((app, i) => {
            const y = getY(i, visibleTargetApps.length);
            return (
              <Box
                key={app.id}
                sx={{
                  position: 'absolute',
                  left: rightX - nodeSize / 2,
                  top: y - nodeSize / 2,
                  pointerEvents: 'auto',
                }}
              >
                <AppBubble
                  app={app}
                  size={nodeSize}
                  isSample={!isLoggedIn}
                  side="right"
                  disabled={app.isEnabled === false}
                  usecaseLabel={usecaseLabel}
                  onRemoveApp={handleRemoveApp}
                  onToggleSync={isLoggedIn ? handleToggleDestinationApp : undefined}
                  onVisitApp={handleVisitApp}
                  onPrimaryClick={onBubbleClick ? (name, el, s) => !!onBubbleClick({ appName: name, side: s, anchorEl: el }) : undefined}
                  isNotification={isNotificationFlow}
                />
              </Box>
            );
          })}

          {/* Show more / less source tools button */}
          {!shouldOmitSource && hasMoreLeft && (
            <Box
              sx={{
                position: 'absolute',
                left: leftX,
                top: getShowMoreY(visibleSourceApps.length),
                transform: 'translateX(-50%)',
                pointerEvents: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              <Button
                size="small"
                onClick={() => setExpandedLeft(prev => !prev)}
                startIcon={expandedLeft ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 0.25,
                  px: 1,
                  minHeight: 24,
                  borderRadius: '12px',
                  bgcolor: 'hsla(var(--muted) / 0.8)',
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px solid hsla(var(--border) / 0.6)',
                  backdropFilter: 'blur(4px)',
                  lineHeight: 1.4,
                  '&:hover': {
                    bgcolor: 'hsla(var(--primary) / 0.12)',
                    color: 'hsl(var(--primary))',
                    borderColor: 'hsla(var(--primary) / 0.4)',
                  },
                }}
              >
                {expandedLeft ? 'Show less' : `Show more (+${sourceApps.length - MAX_COLLAPSED_NODES})`}
              </Button>
            </Box>
          )}

          {/* Show source tools button */}
          {!shouldOmitSource && !lockSource && (
            <Box
              sx={{
                position: 'absolute',
                left: visibleSourceApps.length === 0 ? leftX - 20 : leftX - 16,
                top: getAddButtonY(visibleSourceApps.length, hasMoreLeft),
                pointerEvents: 'auto',
              }}
            >
              {visibleSourceApps.length === 0 ? (
                <Tooltip title="Browse and add source tools" placement="bottom" arrow>
                  <Box
                    onClick={() => { if (onAddTool && onAddTool('left')) return; setSearchOpen('left'); }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.5,
                      borderRadius: '8px',
                      border: '1px dashed hsla(var(--muted-foreground) / 0.3)',
                      color: 'hsl(var(--muted-foreground))',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary))',
                        bgcolor: 'hsla(var(--primary) / 0.08)',
                      },
                    }}
                  >
                    <Plus size={12} />
                    Show source tools
                  </Box>
                </Tooltip>
              ) : (
                <Tooltip title="Add source tools" placement="bottom" arrow>
                  <IconButton
                    onClick={() => { if (onAddTool && onAddTool('left')) return; setSearchOpen('left'); }}
                    sx={{
                      width: 32,
                      height: 32,
                      border: '2px dashed hsla(var(--muted-foreground) / 0.3)',
                      color: 'hsl(var(--muted-foreground))',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary))',
                        bgcolor: 'hsla(var(--primary) / 0.08)',
                      },
                    }}
                  >
                    <Plus size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}

          {/* Show more / less destination tools button */}
          {hasMoreRight && (
            <Box
              sx={{
                position: 'absolute',
                left: rightX,
                top: getShowMoreY(visibleTargetApps.length),
                transform: 'translateX(-50%)',
                pointerEvents: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              <Button
                size="small"
                onClick={() => setExpandedRight(prev => !prev)}
                startIcon={expandedRight ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 0.25,
                  px: 1,
                  minHeight: 24,
                  borderRadius: '12px',
                  bgcolor: 'hsla(var(--muted) / 0.8)',
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px solid hsla(var(--border) / 0.6)',
                  backdropFilter: 'blur(4px)',
                  lineHeight: 1.4,
                  '&:hover': {
                    bgcolor: 'hsla(var(--primary) / 0.12)',
                    color: 'hsl(var(--primary))',
                    borderColor: 'hsla(var(--primary) / 0.4)',
                  },
                }}
              >
                {expandedRight ? 'Show less' : `Show more (+${targetApps.length - MAX_COLLAPSED_NODES})`}
              </Button>
            </Box>
          )}

          {/* Add destination tool button */}
          <Box
            sx={{
              position: 'absolute',
              left: rightX - 16,
              top: getAddButtonY(visibleTargetApps.length, hasMoreRight),
              pointerEvents: 'auto',
            }}
          >
            <Tooltip title="Add destination tools" placement="bottom" arrow>
              <IconButton
                onClick={() => { if (onAddTool && onAddTool('right')) return; setSearchOpen('right'); }}
                sx={{
                  width: 32,
                  height: 32,
                  border: '2px dashed hsla(var(--muted-foreground) / 0.3)',
                  color: 'hsl(var(--muted-foreground))',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary))',
                    bgcolor: 'hsla(var(--primary) / 0.08)',
                  },
                }}
              >
                <Plus size={16} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* App search drawer — shared component */}
      <AppSearchDrawer
        open={searchOpen !== null}
        onClose={() => setSearchOpen(null)}
        initialQuery={(() => {
          const raw = searchOpen === 'left'
            ? (sourceMeta?.label || highlightCategory || sourceCategory)
            : (targetMeta?.label || targetCategory);
          if (raw?.toLowerCase() === 'email') return 'Communication';
          if (raw?.toLowerCase() === 'case management') return 'Cases';
          return raw;
        })()}
        title={`Add ${searchOpen === 'left' ? (sourceLabel) : (targetMeta?.label || targetCategory)} Tool`}
        subtitle="Search and authenticate an integration"
        
        priorityCategory={searchOpen === 'left' ? (highlightCategory || sourceCategory) : targetCategory}
        connectionPathApps={(() => {
          const apps = searchOpen === 'left' ? sourceApps : targetApps;
          return apps
            .filter(a => a.id !== 'webhook-ingestion' && a.name !== 'Webhook')
            .map(a => ({ name: a.name, icon: a.icon, hasValidAuth: a.hasValidAuth, isActiveOnly: a.isActiveOnly }));
        })()}
        onAddToCanvas={isLoggedIn ? ({ name: addedAppName, icon: addedIcon, algoliaId }: { name: string; icon?: string; algoliaId?: string }) => {
          const side = searchOpen || 'right';

          // Ensure app exists in allApps so it renders on the canvas
          setAllApps(prev => {
            const exists = prev.some(a => normalizeAppName(a.name) === normalizeAppName(addedAppName));
            if (exists) {
              return prev.map(a =>
                normalizeAppName(a.name) === normalizeAppName(addedAppName)
                  ? { ...a, hasValidAuth: true, icon: addedIcon || a.icon }
                  : a
              );
            }
            return [...prev, { id: algoliaId || addedAppName, name: addedAppName, icon: addedIcon || '', hasValidAuth: true, isActiveOnly: false }];
          });

          // Activate app in background
          if (algoliaId) {
            (async () => {
              try {
                const configRes = await fetch(getApiUrl(`/api/v1/apps/${encodeURIComponent(algoliaId)}/config`), {
                  credentials: 'include', headers: { ...getAuthHeader() },
                });
                if (configRes.ok) {
                  const data = await configRes.json();
                  if (data.id) {
                    await fetch(getApiUrl(`/api/v1/apps/${data.id}/activate`), {
                      method: 'POST', credentials: 'include', headers: { ...getAuthHeader() },
                    });
                  }
                }
              } catch {}
            })();
          }

          if (side === 'left' && highlightCategory) {
            handleToggleSync(addedAppName, true);
            setHiddenApps(prev => { const next = new Set(prev); next.delete(addedAppName.toLowerCase()); return next; });
            import('sonner').then(({ toast }) => toast.success(`${addedAppName.replace(/_/g, ' ')} added to ingestion sources`));
          } else {
            // Optimistic UI: show immediately on the destination column,
            // then push the FULL desired destination app list to the backend
            // and verify the workflow picked it up.
            setManualDestApps(prev => { const next = new Set(prev); next.add(normalizeAppName(addedAppName)); return next; });
            setHiddenApps(prev => { const next = new Set(prev); next.delete(addedAppName.toLowerCase()); return next; });
            handleToggleDestinationApp(addedAppName, true);
          }
          setSearchOpen(null);
        } : undefined}
        onQuickSelect={!isLoggedIn ? (app: any) => {
          if (searchOpen) addGuestApp(searchOpen, app);
        } : undefined}
        onSelectOverride={isLoggedIn ? (app: any) => {
          // Check if this app is already authenticated
          const matchedApp = allApps.find(a => 
            normalizeAppName(a.name) === normalizeAppName(app.name) && a.hasValidAuth
          );
          if (!matchedApp) return false; // Not authenticated — open detail drawer

          // Backfill icon from Algolia if the API didn't provide one
          if (!matchedApp.icon && app.icon) {
            matchedApp.icon = app.icon;
          }

          // Already authenticated: add to the workflow directly
          if (searchOpen === 'left' && highlightCategory) {
            // Add to ingestion sources
            handleToggleSync(matchedApp.name, true);
            // Also unhide if it was hidden
            setHiddenApps(prev => {
              const next = new Set(prev);
              next.delete(matchedApp.name.toLowerCase());
              return next;
            });
            import('sonner').then(({ toast }) => toast.success(`${matchedApp.name.replace(/_/g, ' ')} added to ingestion sources`));
          } else if (searchOpen === 'right') {
            setHiddenApps(prev => {
              const next = new Set(prev);
              next.delete(matchedApp.name.toLowerCase());
              return next;
            });
            // Activate the app in the tenant first (no-op if already active),
            // then push the FULL desired destination app list and verify.
            (async () => {
              try {
                if (matchedApp.id) {
                  await fetch(getApiUrl(`/api/v1/apps/${matchedApp.id}/activate`), {
                    method: 'POST', credentials: 'include', headers: { ...getAuthHeader() },
                  });
                }
              } catch {}
              handleToggleDestinationApp(matchedApp.name, true);
            })();
          }
          setSearchOpen(null);
          return true; // Handled — don't open detail drawer
        } : undefined}
        onDetailClose={isLoggedIn ? async (appName: string) => {
          // After authenticating, re-check if app is now valid and auto-add
          try {
            const res = await fetchAppsCached(getApiUrl('/api/v1/apps/authentication'), {
              credentials: 'include',
              headers: getAuthHeader(),
            });
            if (!res.ok) return;
            const result = await res.json();
            const authData: AuthAppEntry[] = result.data || result;
            const deduped = deduplicateAuthApps(authData);
            const match = deduped.find(d => normalizeAppName(d.app.name) === normalizeAppName(appName));
            if (!match?.hasValidAuth) return;

            // Update allApps with the new/updated app
            const newNode: AppNode = {
              id: match.app.id,
              name: match.app.name,
              icon: match.bestImage || match.app.large_image || '',
              hasValidAuth: true,
              isActiveOnly: false,
            };
            setAllApps(prev => {
              const exists = prev.some(a => normalizeAppName(a.name) === normalizeAppName(appName));
              if (exists) {
                return prev.map(a => normalizeAppName(a.name) === normalizeAppName(appName) ? { ...a, ...newNode } : a);
              }
              return [...prev, newNode];
            });

            // Auto-add to the correct side
            const side = searchOpen || 'right';
            if (side === 'left' && highlightCategory) {
              handleToggleSync(match.app.name, true);
              setHiddenApps(prev => { const n = new Set(prev); n.delete(match.app.name.toLowerCase()); return n; });
              const { toast } = await import('sonner');
              toast.success(`${match.app.name.replace(/_/g, ' ')} authenticated & added to ingestion`);
            } else {
              handleToggleDestinationApp(match.app.name, true);
              setHiddenApps(prev => { const n = new Set(prev); n.delete(match.app.name.toLowerCase()); return n; });
              const { toast } = await import('sonner');
              toast.success(`${match.app.name.replace(/_/g, ' ')} authenticated & added to destination`);
            }
          } catch (err) {
            console.error('[AlluvialDiagram] post-auth check failed:', err);
          }
        } : undefined}
      />


      {!hasApps && (
        <Typography sx={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem', mt: 2 }}>
          No {sourceMeta?.label} or {targetMeta?.label} tools connected yet.{' '}
          <Box component={Link} to="/onboarding/sources" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
            Connect tools
          </Box>
        </Typography>
      )}
    </Box>
  );
}
