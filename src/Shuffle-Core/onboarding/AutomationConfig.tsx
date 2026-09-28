import { ChevronDown as ExpandMoreIcon, Shield as SecurityIcon, Mail as EmailIcon, MessageSquare as ChatIcon, Globe as TravelExploreIcon, ArrowLeftRight as SyncAltIcon, Download as DownloadIcon, ClipboardCheck as AssignmentIndIcon, Fingerprint as FingerprintIcon, CheckCircle2 as CheckCircleIcon, Plus as AddIcon, Trash2 as DeleteIcon, Pencil as EditIcon, Link as LinkIcon, RotateCcw as RestoreIcon, Bug as BugReportIcon } from 'lucide-react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link as RouterLink } from '@/lib/router-compat';
import {
  IntegrationStatus,
  fetchAppsViaApiConfig,
  AppAuthCard,
} from '@shuffleio/shuffle-mcps';
import type {
  AppAuthState,
  ApiAuthEntry as AppAuthApiEntry,
  AlgoliaSearchApp,
  ShuffleHostProps,
} from '@shuffleio/shuffle-mcps';
import {
  Box,
  Typography,
  Switch,
  Card,
  CardContent,
  Chip,
  Collapse,
  TextField,
  Avatar,
  Tooltip,
  IconButton,
  Button,
} from '@mui/material';
import { motion } from 'framer-motion';
import { OnCallScheduleManager } from '@/Shuffle-Core/components/users/OnCallScheduleManager';
import { useUsers } from '@/Shuffle-Core/hooks/useUsers';
import { deduplicateAuthApps, type AuthAppEntry } from '@/Shuffle-Core/lib/utils';
import {
  EMAIL_APP_PATTERNS, CASES_PATTERNS, EDR_PATTERNS, SIEM_PATTERNS,
  THREAT_INTEL_PATTERNS, COMMUNICATION_PATTERNS_NAMES,
  isEmailApp, isThreatIntelApp, getIngestionCategory,
  normalizeAppName, extractValidatedIngestionApps,
  API_CONFIG, getApiUrl, getAuthHeader,
} from '@shuffleio/shuffle-mcps';
import type { IngestionCategory } from '@shuffleio/shuffle-mcps';
import shuffleLogo from '@/assets/shuffle-logo.png';
import { useThreatFeeds, DEFAULT_THREAT_FEEDS, ThreatFeed } from '@/Shuffle-Core/hooks/useThreatFeeds';
import { getAutomationLabels } from '@/Shuffle-Core/config/usecases';
import { useEnrichmentStatus } from '@/Shuffle-Core/hooks/useEnrichmentStatus';

/** Convert internal app names (e.g. "google_sheets") to readable form ("Google Sheets") */
const readableAppName = (name: string): string =>
  name.replace(/[_\-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Workflow labels for each automation area — derived from shared usecase registry
const AUTOMATION_WORKFLOW_LABELS: Record<string, string[]> = {
  automatic_ingestion: getAutomationLabels('automatic_ingestion'),
  forward_updates: getAutomationLabels('forward_updates'),
  assign_escalate: getAutomationLabels('assign_escalate'),
  threat_intel: getAutomationLabels('threat_intel'),
  notifications: getAutomationLabels('notifications'),
};

// Workflow generation now lives in the shared canonical helper so the
// onboarding flow and demo-mode bootstrap stay in lockstep.
import { generateWorkflow } from '@/Shuffle-Core/lib/workflowGenerate';

interface EnrichmentOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: 'enrichment' | 'response';
  configFields?: { label: string; placeholder: string; type?: string }[];
  connectedApps?: ConnectedApp[];
  ingestionSources?: IngestionSource[];
  notificationSources?: NotificationSource[];
  threatIntelSources?: ThreatIntelSource[];
  disabled?: boolean;
}

interface ConnectedApp {
  id: string;
  name: string;
  image?: string;
  isValidated?: boolean;
  isSelected?: boolean;
  hasAuthConfig?: boolean;
}

const isValidConnectedApp = (app: ConnectedApp | null | undefined): app is ConnectedApp =>
  !!app?.id && !!app?.name;

const safeConnectedApps = (apps?: Array<ConnectedApp | null | undefined>): ConnectedApp[] =>
  (apps || []).filter(isValidConnectedApp);

// Base static options - automatic_ingestion will be built dynamically
const baseEnrichmentOptions: (Omit<EnrichmentOption, 'connectedApps'> & { isDynamic?: boolean })[] = [
  {
    id: 'automatic_ingestion',
    name: 'Automatic Ingestion',
    description: 'Pull alerts and tickets from SIEMs, EDRs, and case tools into a single normalized queue automatically.',
    icon: <DownloadIcon />,
    color: '#22c55e',
    category: 'enrichment',
    isDynamic: true,
  },
  {
    id: 'threat_intel',
    name: 'Automatic Enrichment',
    description: 'Enrich every new incident with IOC lookups, threat feed matches, and contextual intelligence — no manual steps.',
    icon: <FingerprintIcon />,
    color: '#ef4444',
    category: 'enrichment',
    isDynamic: true,
  },
  {
    id: 'forward_updates',
    name: 'Forward Incidents',
    description: 'Push incident updates and status changes to external ticketing systems like Jira, ServiceNow, or TheHive.',
    icon: <SyncAltIcon />,
    color: '#f59e0b',
    category: 'enrichment',
    isDynamic: true,
  },
  {
    id: 'assign_escalate',
    name: 'Assign & Escalate',
    description: 'Route incidents to the right analyst based on on-call schedules and escalate if unacknowledged.',
    icon: <AssignmentIndIcon />,
    color: '#6366f1',
    category: 'response',
  },
  {
    id: 'vulnerability_correlation',
    name: 'Vulnerability Automation',
    description: 'Runs the Vulnerability Correlation workflow in the background to compare scanner results across runs and surface new findings. Automated remediation comes later.',
    icon: <BugReportIcon />,
    color: '#f97316',
    category: 'response',
    disabled: true,
  },
  {
    id: 'integration_search',
    name: 'Integration Search',
    description: 'Search across all connected tools simultaneously for IOCs and context (coming soon).',
    icon: <TravelExploreIcon />,
    color: '#3b82f6',
    category: 'response',
    disabled: true,
  },
];

export interface AutomationState {
  [key: string]: {
    enabled: boolean;
    config: Record<string, string>;
    tools?: Record<string, boolean>;
  };
}

/** @deprecated Use AutomationState instead */
export type EnrichmentState = AutomationState;

interface SelectedApp {
  objectID: string;
  name: string;
  image_url?: string;
  categories?: string[];
}

const isValidSelectedApp = (app: SelectedApp | null | undefined): app is SelectedApp =>
  !!app?.objectID && !!app?.name;

interface AutomationConfigProps extends ShuffleHostProps {
  enrichmentState: EnrichmentState;
  onEnrichmentChange: (state: EnrichmentState) => void;
  onSave?: (state: EnrichmentState) => void;
  authenticatedApps?: AuthAppEntry[];
  selectedApps?: SelectedApp[];
  /** Normalized app names extracted from the 'Ingest Tickets' workflow (source of truth) */
  workflowAppNames?: Set<string>;
  /** Normalized app names extracted from the 'Forward Tickets' workflow (source of truth) */
  forwardWorkflowAppNames?: Set<string>;
  // Auth callbacks for inline configuration of pending apps
  authStates?: Record<string, AppAuthState>;
  apiAuthEntries?: AppAuthApiEntry[];
  onAuthChange?: (appId: string, credentials: Record<string, string>) => void;
  onTestConnection?: (appId: string, authenticationId?: string) => void;
  onSaveAuth?: (appId: string, credentials: Record<string, string>) => Promise<boolean>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// Communication app detection
const COMMUNICATION_CATEGORIES = ['COMMUNICATION', 'communication', 'Communication'];
const isCommunicationApp = (app: AuthAppEntry) => {
  const categories = app.app.categories || [];
  return categories.some(cat => COMMUNICATION_CATEGORIES.includes(cat)) ||
    COMMUNICATION_PATTERNS_NAMES.some(
      pattern => app.app.name.toLowerCase().includes(pattern)
    );
};

type NotificationCategory = 'chat' | 'email';
type ThreatIntelCategory = 'threat_intel';

interface IngestionSource {
  category: IngestionCategory | 'other';
  label: string;
  apps: ConnectedApp[];
  isOther?: boolean;
}

interface NotificationSource {
  category: NotificationCategory | 'other';
  label: string;
  apps: ConnectedApp[];
  isOther?: boolean;
}

interface ThreatIntelSource {
  category: ThreatIntelCategory | 'other';
  label: string;
  apps: ConnectedApp[];
  isOther?: boolean;
}

type AutomationSource = IngestionSource | NotificationSource | ThreatIntelSource;

const safeSources = (sources?: Array<AutomationSource | null | undefined>): AutomationSource[] =>
  (sources || []).filter((source): source is AutomationSource => !!source).map(source => ({
    ...source,
    apps: safeConnectedApps(source.apps),
  }));

// Helper component for rendering source category chips
interface SourceChipProps {
  label: string;
  apps: ConnectedApp[];
  activeCount: number;
  totalCount: number;
  hasAnyActive: boolean;
  optionId: string;
  isToolEnabled: (optionId: string, appId: string) => boolean;
}

const SourceChip = ({ label, apps, activeCount, totalCount, hasAnyActive, optionId, isToolEnabled }: SourceChipProps) => {
  const safeApps = safeConnectedApps(apps);
  const hasAny = safeApps.length > 0;
  const activeApps = safeApps.filter(app => isToolEnabled(optionId, app.id));
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, borderRadius: 2,
      background: hasAnyActive ? 'hsl(var(--severity-low) / 0.1)' : 'hsl(var(--muted))',
      border: '1px solid', borderColor: hasAnyActive ? 'hsl(var(--severity-low) / 0.3)' : 'hsl(var(--border))',
    }}>
      <Typography variant="caption" sx={{ color: hasAnyActive ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
        {label}{hasAny && <Box component="span" sx={{ ml: 0.5, opacity: 0.8 }}>({activeCount}/{totalCount})</Box>}
      </Typography>
      {activeApps.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {activeApps.slice(0, 2).map((app) => (
            <Tooltip key={app.id} title={<Box><Typography variant="caption" sx={{ fontWeight: 600 }}>{readableAppName(app.name)}</Typography><Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>Active{app.isSelected ? ' • This setup' : ' • Pre-existing'}</Typography></Box>} arrow placement="top">
              <Box sx={{ position: 'relative' }}>
                <Avatar src={app.image} alt={readableAppName(app.name)} sx={{ width: 16, height: 16, fontSize: '0.5rem', border: '1px solid', borderColor: 'hsl(var(--severity-low) / 0.5)' }}>{app.name[0]}</Avatar>
              </Box>
            </Tooltip>
          ))}
          {activeApps.length > 2 && <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.6rem', ml: 0.25 }}>+{activeApps.length - 2}</Typography>}
        </Box>
      )}
    </Box>
  );
};

export const AutomationConfig = ({
  enrichmentState, 
  onEnrichmentChange,
  onSave,
  authenticatedApps = [],
  selectedApps = [],
  workflowAppNames,
  forwardWorkflowAppNames,
  authStates = {},
  apiAuthEntries = [],
  onAuthChange,
  onTestConnection,
  onSaveAuth,
  globalUrl,
  theme,
  colorMode,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: AutomationConfigProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configuringAppId, setConfiguringAppId] = useState<string | null>(null);
  const [otherExpanded, setOtherExpanded] = useState<Record<string, boolean>>({});
  // Optimistic overrides for workflow app names (toggled locally before server confirms)
  const [localWorkflowOverrides, setLocalWorkflowOverrides] = useState<Record<string, boolean>>({});
  
  // Threat feeds management
  const { threatFeeds, saveFeed, deleteFeed, toggleFeed, initializeDefaults: initThreatFeeds } = useThreatFeeds();
  const enrichmentStatus = useEnrichmentStatus();
  // Users powering the on-call schedule editor inside the Assign & Escalate card
  const { users: scheduleUsers, loading: scheduleUsersLoading } = useUsers();
  const [editingFeed, setEditingFeed] = useState<ThreatFeed | null>(null);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');

  // Activated apps from /api/v1/apps — mirrors the source set used by the
  // Integrations bar so the per-section app lists below stay in sync with
  // what the user actually sees there.
  const [activatedApps, setActivatedApps] = useState<Array<{ id: string; name: string; image: string; categories: string[] }>>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const apps = await fetchAppsViaApiConfig();
        if (cancelled || !Array.isArray(apps)) return;
        setActivatedApps(
          apps
            .filter((a: any) => a?.activated && a?.name)
            .map((a: any) => ({
              id: a.id || a.name,
              name: a.name,
              image: a.large_image || a.image_url || '',
              categories: Array.isArray(a.categories) ? a.categories : [],
            })),
        );
      } catch {
        // non-critical
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('integrations-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('integrations-changed', handler);
    };
  }, []);

  const safeSelectedApps = useMemo(() => (selectedApps || []).filter(isValidSelectedApp), [selectedApps]);

  // Create a set of selected app names (normalized) for quick lookup
  const selectedAppNames = useMemo(() => {
    const names = new Set<string>();
    safeSelectedApps.forEach(app => {
      names.add(normalizeAppName(app.name));
    });
    return names;
  }, [safeSelectedApps]);

  const isAppSelected = (appName: string) => {
    const normalized = normalizeAppName(appName);
    return selectedAppNames.has(normalized);
  };

  // Build dynamic options based on connected apps
  const enrichmentOptions = useMemo(() => {
    const dedupedApps = deduplicateAuthApps(
      authenticatedApps.filter(auth => auth.active || auth.validation?.valid)
    );
    const appValidationMap = new Map<string, boolean>();
    dedupedApps.forEach(({ app, hasValidAuth }) => {
      appValidationMap.set(normalizeAppName(app.name), hasValidAuth);
    });

    // Use the same shared function as IncidentsPage for consistent ingestion app detection
    const validatedApps = extractValidatedIngestionApps(
      authenticatedApps.filter(auth => auth.active || auth.validation?.valid),
      workflowAppNames,
    );

    // Group validated apps by category into ConnectedApp format
    const ingestionByCategory: Record<IngestionCategory | 'other', ConnectedApp[]> = {
      email: [], cases: [], edr: [], siem: [], other: [],
    };

    for (const vApp of validatedApps) {
      ingestionByCategory[vApp.category].push({
        id: vApp.id,
        name: vApp.name,
        image: vApp.image,
        isValidated: vApp.validated,
        isSelected: isAppSelected(vApp.name),
        hasAuthConfig: true,
      });
    }

    // Also include selected (pending) apps not yet authenticated.
    // Apps without a known ingestion category fall into "Other" so the
    // section matches what is shown in the Integrations bar above.
    const validatedNames = new Set(validatedApps.map(a => normalizeAppName(a.name)));
    const seenIngestion = new Set<string>(validatedApps.map(a => normalizeAppName(a.name)));
    safeSelectedApps.forEach(app => {
      const norm = normalizeAppName(app.name);
      if (validatedNames.has(norm)) return;
      const category = getIngestionCategory(app.name, app.categories) || 'other';
      ingestionByCategory[category].push({
        id: app.objectID,
        name: app.name,
        image: app.image_url,
        isValidated: false,
        isSelected: true,
        hasAuthConfig: false,
      });
      seenIngestion.add(norm);
    });

    // Merge in activated apps from /api/v1/apps so the per-section app list
    // matches the Integrations bar (which also pulls from this source).
    activatedApps.forEach(app => {
      const norm = normalizeAppName(app.name);
      if (seenIngestion.has(norm)) return;
      const category = getIngestionCategory(app.name, app.categories) || 'other';
      ingestionByCategory[category].push({
        id: app.id,
        name: app.name,
        image: app.image,
        isValidated: false,
        isSelected: false,
        hasAuthConfig: false,
      });
      seenIngestion.add(norm);
    });

    // Build a separate category map for Forward Tickets using forwardWorkflowAppNames
    const forwardValidatedApps = extractValidatedIngestionApps(
      authenticatedApps.filter(auth => auth.active || auth.validation?.valid),
      forwardWorkflowAppNames,
    );
    const forwardByCategory: Record<IngestionCategory | 'other', ConnectedApp[]> = {
      email: [], cases: [], edr: [], siem: [], other: [],
    };
    for (const vApp of forwardValidatedApps) {
      forwardByCategory[vApp.category].push({
        id: vApp.id,
        name: vApp.name,
        image: vApp.image,
        isValidated: vApp.validated,
        isSelected: isAppSelected(vApp.name),
        hasAuthConfig: true,
      });
    }
    const fwdValidatedNames = new Set(forwardValidatedApps.map(a => normalizeAppName(a.name)));
    const seenForward = new Set<string>(forwardValidatedApps.map(a => normalizeAppName(a.name)));
    safeSelectedApps.forEach(app => {
      const norm = normalizeAppName(app.name);
      if (fwdValidatedNames.has(norm)) return;
      const category = getIngestionCategory(app.name, app.categories) || 'other';
      forwardByCategory[category].push({
        id: app.objectID,
        name: app.name,
        image: app.image_url,
        isValidated: false,
        isSelected: true,
        hasAuthConfig: false,
      });
      seenForward.add(norm);
    });
    activatedApps.forEach(app => {
      const norm = normalizeAppName(app.name);
      if (seenForward.has(norm)) return;
      const category = getIngestionCategory(app.name, app.categories) || 'other';
      forwardByCategory[category].push({
        id: app.id,
        name: app.name,
        image: app.image,
        isValidated: false,
        isSelected: false,
        hasAuthConfig: false,
      });
      seenForward.add(norm);
    });

    const sortApps = (apps: ConnectedApp[]): ConnectedApp[] => {
      return [...apps].sort((a, b) => {
        const scoreA = (a.isSelected ? 2 : 0) + (a.isValidated ? 1 : 0);
        const scoreB = (b.isSelected ? 2 : 0) + (b.isValidated ? 1 : 0);
        return scoreB - scoreA;
      });
    };
    
    const ingestionSources: IngestionSource[] = [
      { category: 'email', label: 'Email', apps: sortApps(ingestionByCategory.email) },
      { category: 'cases', label: 'Cases', apps: sortApps(ingestionByCategory.cases) },
      { category: 'edr', label: 'EDR', apps: sortApps(ingestionByCategory.edr) },
      { category: 'siem', label: 'SIEM', apps: sortApps(ingestionByCategory.siem) },
    ];
    
    if (ingestionByCategory.other.length > 0) {
      ingestionSources.push({ category: 'other', label: 'Other', apps: sortApps(ingestionByCategory.other), isOther: true });
    }
    
    const validatedCount = Object.values(ingestionByCategory).flat().filter(a => a.isValidated).length;
    const totalCount = Object.values(ingestionByCategory).flat().length;
    
    const options: EnrichmentOption[] = baseEnrichmentOptions.map(opt => {
      if (opt.id === 'automatic_ingestion') {
        return {
          ...opt,
          description: totalCount > 0
            ? `${validatedCount} validated${totalCount > validatedCount ? `, ${totalCount - validatedCount} pending` : ''}`
            : 'Connect Email, Cases, EDR, or SIEM tools to enable automatic ingestion',
          ingestionSources,
        };
      }
      if (opt.id === 'forward_updates') {
        // Use the same categorized ingestionSources UI as automatic_ingestion
        const forwardSources: IngestionSource[] = [
          { category: 'cases', label: 'Cases', apps: sortApps(forwardByCategory.cases) },
        ];
        const otherForwardApps = [
          ...sortApps(forwardByCategory.email),
          ...sortApps(forwardByCategory.edr),
          ...sortApps(forwardByCategory.siem),
          ...sortApps(forwardByCategory.other),
        ];
        if (otherForwardApps.length > 0) {
          forwardSources.push({ category: 'other', label: 'Other', apps: otherForwardApps, isOther: true });
        }
        const fwdTotal = forwardSources.flatMap(s => s.apps).length;
        const fwdValidated = forwardSources.flatMap(s => s.apps).filter(a => a.isValidated).length;
        return {
          ...opt,
          description: fwdTotal > 0
            ? `${fwdValidated} validated${fwdTotal > fwdValidated ? `, ${fwdTotal - fwdValidated} pending` : ''}`
            : 'Connect tools to forward incident updates',
          ingestionSources: forwardSources,
        };
      }
      if (opt.id === 'threat_intel') {
        const threatIntelApps: ConnectedApp[] = [];
        
        threatIntelApps.push({
          id: 'shuffle_threat_lists',
          name: 'Shuffle Threat Lists',
          image: shuffleLogo,
          isValidated: true,
          isSelected: true,
          hasAuthConfig: true,
        });
        
        dedupedApps.forEach(({ app, bestImage, hasValidAuth }) => {
          if (isThreatIntelApp(app.name)) {
            threatIntelApps.push({
              id: app.id,
              name: app.name,
              image: bestImage || app.large_image,
              isValidated: hasValidAuth,
              isSelected: isAppSelected(app.name),
              hasAuthConfig: true,
            });
          }
        });
        safeSelectedApps.forEach(selApp => {
          const normalizedName = normalizeAppName(selApp.name);
          if (!appValidationMap.has(normalizedName) && isThreatIntelApp(selApp.name)) {
            threatIntelApps.push({
              id: selApp.objectID,
              name: selApp.name,
              image: selApp.image_url,
              isValidated: false,
              isSelected: true,
              hasAuthConfig: false,
            });
          }
        });
        
        const threatIntelSources: ThreatIntelSource[] = [
          { category: 'threat_intel', label: 'Threat Intel', apps: sortApps(threatIntelApps) },
        ];
        const tiValidatedCount = threatIntelApps.filter(a => a.isValidated).length;
        const tiTotalCount = threatIntelApps.length;
        
        return {
          ...opt,
          description: `${tiValidatedCount} validated${tiTotalCount > tiValidatedCount ? `, ${tiTotalCount - tiValidatedCount} pending` : ''}`,
          threatIntelSources,
        };
      }
      return opt;
    });
    
    const emailNotifyApps: ConnectedApp[] = dedupedApps
      .filter(({ app, hasValidAuth }) => hasValidAuth && isEmailApp(app.name))
      .map(({ app, bestImage, hasValidAuth }) => ({
        id: app.id,
        name: app.name,
        image: bestImage || app.large_image,
        isValidated: hasValidAuth,
        isSelected: isAppSelected(app.name),
        hasAuthConfig: true,
      }));
    
    const chatNotifyApps: ConnectedApp[] = dedupedApps
      .filter(({ app, hasValidAuth }) => hasValidAuth && isCommunicationApp({ app, active: true, validation: { valid: true } }))
      .map(({ app, bestImage, hasValidAuth }) => ({
        id: app.id,
        name: app.name,
        image: bestImage || app.large_image,
        isValidated: hasValidAuth,
        isSelected: isAppSelected(app.name),
        hasAuthConfig: true,
      }));
    
    const notificationSources: NotificationSource[] = [
      { category: 'chat', label: 'Chat', apps: sortApps(chatNotifyApps) },
      { category: 'email', label: 'Email', apps: sortApps(emailNotifyApps) },
    ];
    
    const notifyTotal = emailNotifyApps.length + chatNotifyApps.length;
    
    options.push({
      id: 'notifications',
      name: 'Notifications',
      description: 'Send alerts via Chat & Email (coming soon)',
      icon: <ChatIcon />,
      color: '#8b5cf6',
      category: 'response',
      disabled: true,
    });
    
    return options;
  }, [authenticatedApps, activatedApps, safeSelectedApps, workflowAppNames, forwardWorkflowAppNames]);

  const toggleOption = (id: string) => {
    const current = enrichmentState[id] || { enabled: false, config: {} };
    const isEnabling = !current.enabled;
    const newState = {
      ...enrichmentState,
      [id]: { ...current, enabled: isEnabling },
    };
    onEnrichmentChange(newState);
    onSave?.(newState);
    
    // Track automation toggle
    import('@/Shuffle-Core/lib/analytics').then(({ trackPredefinedEvent, GA_EVENTS }) => {
      trackPredefinedEvent(GA_EVENTS.ONBOARDING_AUTOMATION_TOGGLE, id, isEnabling ? 1 : 0);
    });
    
    debouncedTriggerWorkflow(id, isEnabling ? undefined : 'disable');
  };

  const updateConfig = (id: string, field: string, value: string) => {
    const current = enrichmentState[id] || { enabled: false, config: {} };
    const newState = {
      ...enrichmentState,
      [id]: {
        ...current,
        config: { ...current.config, [field]: value },
      },
    };
    onEnrichmentChange(newState);
    onSave?.(newState);
  };

  const getAllToolsForOption = (option: EnrichmentOption): ConnectedApp[] => {
    if (option.ingestionSources) {
      return option.ingestionSources.flatMap(s => safeConnectedApps(s.apps));
    }
    if (option.notificationSources) {
      return option.notificationSources.flatMap(s => safeConnectedApps(s.apps));
    }
    if (option.threatIntelSources) {
      return option.threatIntelSources.flatMap(s => safeConnectedApps(s.apps));
    }
    if (option.connectedApps) {
      return safeConnectedApps(option.connectedApps);
    }
    return [];
  };

  const getAppInfo = (optionId: string, appId: string): ConnectedApp | undefined => {
    const option = enrichmentOptions.find(o => o.id === optionId);
    if (!option) return undefined;
    if (option.ingestionSources) {
      return option.ingestionSources.flatMap(s => safeConnectedApps(s.apps)).find(a => a.id === appId);
    }
    if (option.notificationSources) {
      return option.notificationSources.flatMap(s => safeConnectedApps(s.apps)).find(a => a.id === appId);
    }
    if (option.threatIntelSources) {
      return option.threatIntelSources.flatMap(s => safeConnectedApps(s.apps)).find(a => a.id === appId);
    }
    if (option.connectedApps) {
      return safeConnectedApps(option.connectedApps).find(a => a.id === appId);
    }
    return undefined;
  };

  const isToolEnabled = (optionId: string, appId: string): boolean => {
    const current = enrichmentState[optionId];
    const appInfo = getAppInfo(optionId, appId);

    if (!appInfo?.isValidated) return false;

    const normalized = normalizeAppName(appInfo.name);

    // For automatic_ingestion, workflows are the source of truth + local optimistic overrides
    if (optionId === 'automatic_ingestion') {
      if (normalized in localWorkflowOverrides) {
        return localWorkflowOverrides[normalized];
      }
      if (workflowAppNames) {
        return workflowAppNames.has(normalized);
      }
    }

    // For forward_updates, use the Forward Tickets workflow as source of truth
    if (optionId === 'forward_updates') {
      if (normalized in localWorkflowOverrides) {
        return localWorkflowOverrides[normalized];
      }
      if (forwardWorkflowAppNames) {
        return forwardWorkflowAppNames.has(normalized);
      }
    }

    // Check explicit toggles in the enrichment state
    if (current?.tools) {
      for (const [toolId, value] of Object.entries(current.tools)) {
        const toolInfo = getAppInfo(optionId, toolId);
        if (!toolInfo?.name) continue;
        if (normalizeAppName(toolInfo.name) === normalized) {
          return value === true;
        }
      }
    }

    // Fallback: enabled if selected in onboarding
    return !!appInfo.isSelected;
  };

  // Pending overrides accumulated across rapid toggles (read at debounce fire time)
  const pendingOverridesRef = useRef<Record<string, boolean>>({});
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireWorkflowGeneration = useCallback((optionId: string, actionName?: string) => {
    const option = enrichmentOptions.find(o => o.id === optionId);
    if (!option) return;

    const allTools = getAllToolsForOption(option);
    const overrides = pendingOverridesRef.current;

    let enabledTools: typeof allTools;
    if (actionName === 'disable') {
      enabledTools = allTools;
    } else {
      enabledTools = allTools.filter(tool => {
        const norm = normalizeAppName(tool.name);
        if (norm in overrides) return overrides[norm];
        return isToolEnabled(optionId, tool.id);
      });
    }

    const enabledAppNames = enabledTools.map(tool => tool.name);
    const labels = AUTOMATION_WORKFLOW_LABELS[optionId] || [];
    // Allow firing with an empty app list — Assign & Escalate is schedule-based,
    // and Automatic Ingestion / Forward Updates need to provision the workflow
    // (and webhook trigger) even before any apps are wired in.
    const allowEmpty = true;
    labels.forEach(label => {
      generateWorkflow({ label, enabledAppNames, category: 'cases', actionName, allowEmpty });
    });

    // Clear pending overrides after firing
    pendingOverridesRef.current = {};
  }, [enrichmentOptions]);

  /** Debounced workflow generation — waits 1.2s after the last toggle before sending */
  const debouncedTriggerWorkflow = useCallback((optionId: string, actionName?: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fireWorkflowGeneration(optionId, actionName);
    }, 1200);
  }, [fireWorkflowGeneration]);

  const toggleTool = (optionId: string, appId: string, appName: string) => {
    const current = enrichmentState[optionId] || { enabled: false, config: {}, tools: {} };
    const currentTools = current.tools || {};
    const normalized = normalizeAppName(appName);

    // For automatic_ingestion and forward_updates, use workflow-aware check
    const wasEnabled = (optionId === 'automatic_ingestion' || optionId === 'forward_updates')
      ? isToolEnabled(optionId, appId)
      : currentTools[appId] !== false;
    const newToolState = !wasEnabled;

    // Optimistic local override for workflow-based options
    if (optionId === 'automatic_ingestion' || optionId === 'forward_updates') {
      setLocalWorkflowOverrides(prev => ({ ...prev, [normalized]: newToolState }));
    }

    // Accumulate override for the debounced request
    pendingOverridesRef.current[normalized] = newToolState;
    
    const newState = {
      ...enrichmentState,
      [optionId]: {
        ...current,
        tools: { ...currentTools, [appId]: newToolState },
      },
    };
    onEnrichmentChange(newState);
    onSave?.(newState);
    
    debouncedTriggerWorkflow(optionId);
  };

  const enrichmentItems = enrichmentOptions.filter((o) => o.category === 'enrichment');
  const responseItems = enrichmentOptions.filter((o) => o.category === 'response');

  // Helper to render inline auth card for a pending app
  const renderInlineAuth = (app: ConnectedApp) => {
    if (!onAuthChange || !onTestConnection || !onSaveAuth) return null;
    
    const algoliaApp = {
      objectID: app.id,
      name: app.name,
      image_url: app.image || '',
      description: '',
      categories: [],
    } as unknown as AlgoliaSearchApp;
    const curAuthState = authStates[app.id] || {
      systemId: app.id,
      status: 'pending' as const,
      credentials: {},
    };
    const matchingEntries = apiAuthEntries.filter(
      auth => auth.app?.name?.toLowerCase() === app.name.toLowerCase()
    );
    return (
      <Box sx={{ mt: 1 }}>
        <AppAuthCard
          globalUrl={globalUrl}
          theme={theme}
          colorMode={colorMode}
          userdata={userdata}
          isLoaded={isLoaded}
          isLoggedIn={isLoggedIn}
          serverside={serverside}
          app={algoliaApp}
          authState={curAuthState}
          isExpanded={true}
          onToggle={() => setConfiguringAppId(null)}
          onAuthChange={onAuthChange}
          onTestConnection={onTestConnection}
          onSaveAuth={onSaveAuth}
          apiAuthEntries={matchingEntries}
        />
      </Box>
    );
  };

  // Render a single tool row with optional inline auth
  const renderToolRow = (app: ConnectedApp, optionId: string, optionColor: string) => {
    const enabled = isToolEnabled(optionId, app.id);
    const isConfiguring = configuringAppId === app.id;
    
    return (
      <Box key={app.id} sx={{ mb: 0.5 }}>
        <Box
          onClick={!app.isValidated && onAuthChange && onTestConnection && onSaveAuth ? () => setConfiguringAppId(isConfiguring ? null : app.id) : undefined}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.75,
            px: 1.5,
            borderRadius: 1.5,
            cursor: !app.isValidated && onAuthChange ? 'pointer' : 'default',
            background: enabled 
              ? 'hsl(var(--severity-low) / 0.06)' 
              : isConfiguring
                ? 'hsl(var(--primary) / 0.06)'
                : !app.isValidated
                  ? 'hsl(var(--severity-medium) / 0.04)'
                  : 'hsl(var(--muted))',
            border: '1px solid',
            borderColor: enabled 
              ? 'hsl(var(--severity-low) / 0.4)' 
              : isConfiguring
                ? 'hsl(var(--primary) / 0.4)'
                : !app.isValidated
                  ? 'hsl(var(--severity-medium) / 0.2)'
                  : 'transparent',
            opacity: enabled ? 1 : app.isValidated ? 0.7 : 0.85,
            transition: 'all 0.2s ease',
            '&:hover': {
              background: enabled 
                ? 'hsl(var(--severity-low) / 0.1)' 
                : !app.isValidated
                  ? 'hsl(var(--severity-medium) / 0.1)'
                  : 'hsl(var(--background))',
              borderColor: !app.isValidated && !enabled
                ? 'hsl(var(--severity-medium) / 0.4)'
                : undefined,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ position: 'relative' }}>
              <Avatar
                src={app.image}
                alt={app.name}
                sx={{
                  width: 24,
                  height: 24,
                  fontSize: '0.7rem',
                  border: '2px solid',
                  borderColor: app.isValidated 
                    ? 'hsl(var(--severity-low) / 0.6)' 
                    : app.hasAuthConfig
                      ? 'hsl(var(--severity-medium) / 0.6)'
                      : 'hsl(var(--destructive) / 0.6)',
                  opacity: app.isValidated ? 1 : 0.8,
                }}
              >
                {app.name[0]}
              </Avatar>
              <Box
                sx={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: app.isValidated 
                    ? 'hsl(var(--severity-low))' 
                    : app.hasAuthConfig
                      ? 'hsl(var(--severity-medium))'
                      : 'hsl(var(--destructive))',
                  border: '2px solid hsl(var(--card))',
                }}
              />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))' }}>
                  {readableAppName(app.name)}
                </Typography>
                {app.isSelected && (
                  <Chip
                    label="This setup"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.55rem',
                      fontWeight: 600,
                      background: 'hsl(var(--primary) / 0.15)',
                      color: 'hsl(var(--primary))',
                      border: '1px solid hsl(var(--primary) / 0.3)',
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                )}
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: app.isValidated 
                    ? 'hsl(var(--severity-low))' 
                    : app.hasAuthConfig 
                      ? 'hsl(var(--severity-medium))' 
                      : 'hsl(var(--destructive))',
                  fontSize: '0.65rem',
                }}
              >
                {app.isValidated 
                  ? 'Validated' 
                  : app.hasAuthConfig 
                    ? 'Pending validation' 
                    : 'Pending auth'}
                {!app.isSelected && (
                  <Box component="span" sx={{ color: 'hsl(var(--muted-foreground))', ml: 0.5 }}>
                    • Pre-existing
                  </Box>
                )}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {!app.isValidated && onAuthChange && onTestConnection && onSaveAuth && (
              <Chip
                label={isConfiguring ? 'Close' : 'Click to configure'}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  background: isConfiguring ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--severity-medium) / 0.12)',
                  color: isConfiguring ? 'hsl(var(--primary))' : 'hsl(var(--severity-medium))',
                  border: '1px solid',
                  borderColor: isConfiguring ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--severity-medium) / 0.3)',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
            <Switch
              size="small"
              checked={isToolEnabled(optionId, app.id)}
              onChange={() => toggleTool(optionId, app.id, app.name)}
              disabled={!app.isValidated}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: optionColor,
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: optionColor,
                },
                '&.Mui-disabled': {
                  opacity: 0.4,
                },
              }}
            />
          </Box>
        </Box>
        {isConfiguring && renderInlineAuth(app)}
      </Box>
    );
  };

  const renderSection = (_title: string, items: EnrichmentOption[]) => (
    <Box sx={{ mb: 4 }}>
      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((option) => {
            const state = enrichmentState[option.id] || { enabled: false, config: {} };
            const isExpanded = expandedId === option.id;
            const hasConfig = option.configFields && option.configFields.length > 0;
            const connectedApps = safeConnectedApps(option.connectedApps);
            const optionSources = safeSources(option.ingestionSources || option.notificationSources || option.threatIntelSources);
            const hasConnectedApps = connectedApps.length > 0;
            const hasIngestionSources = safeSources(option.ingestionSources).some(s => s.apps.length > 0);
            const hasNotificationSources = safeSources(option.notificationSources).some(s => s.apps.length > 0);
            const hasThreatIntelSources = safeSources(option.threatIntelSources).some(s => s.apps.length > 0);
            const isDisabled = option.disabled || (option.id === 'notifications' && !hasNotificationSources);
            const allTools = getAllToolsForOption(option);
            const hasExpandableTools = allTools.length > 0 && !isDisabled;
            const isAssignEscalate = option.id === 'assign_escalate' && !isDisabled;
            const isExpandable = hasExpandableTools || (hasConfig && state.enabled) || isAssignEscalate;

            return (
              <motion.div key={option.id} variants={itemVariants}>
                <Card
                  onClick={() => {
                    if (!isExpanded && isExpandable) {
                      setExpandedId(option.id);
                    }
                  }}
                  sx={{
                    background: 'transparent',
                    border: '1px solid',
                    borderColor: state.enabled && !isDisabled ? `${option.color}50` : 'hsl(var(--border))',
                    borderRadius: 3,
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    opacity: isDisabled ? 0.5 : 1,
                    cursor: (!isExpanded && isExpandable) ? 'pointer' : 'default',
                    '&:hover': {
                      borderColor: isDisabled ? 'hsl(var(--border))' : (state.enabled ? option.color : 'hsl(var(--primary) / 0.3)'),
                      transform: isDisabled ? 'none' : 'translateY(-2px)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 44,
                          height: 44,
                          borderRadius: 2,
                          background: `${option.color}15`,
                          color: option.color,
                          flexShrink: 0,
                          mt: 0.5,
                        }}
                      >
                        {option.icon}
                      </Box>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                          <Typography
                            variant="subtitle1"
                            sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                          >
                            {option.name}
                          </Typography>
                          {hasConnectedApps && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {connectedApps.slice(0, 3).map((app) => (
                                <Avatar
                                  key={app.id}
                                  src={app.image}
                                  alt={app.name}
                                  sx={{
                                    width: 20,
                                    height: 20,
                                    fontSize: '0.6rem',
                                    border: '1px solid hsl(var(--border))',
                                  }}
                                >
                                  {app.name[0]}
                                </Avatar>
                              ))}
                              {connectedApps.length > 3 && (
                                <Chip
                                  label={`+${connectedApps.length - 3}`}
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.6rem' }}
                                />
                              )}
                              <CheckCircleIcon size={14} style={{ color: 'hsl(var(--severity-low))', marginLeft: '4px' }} />
                            </Box>
                          )}
                          {hasIngestionSources && (
                            <CheckCircleIcon size={14} style={{ color: 'hsl(var(--severity-low))' }} />
                          )}
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{ 
                            color: 'hsl(var(--muted-foreground))', 
                            lineHeight: 1.4, 
                          }}
                        >
                          {option.description}
                        </Typography>
                      </Box>
                      
                      {/* Source chips on the right side */}
                      {optionSources.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, flexShrink: 0, maxWidth: '45%', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {optionSources.map((source) => {
                            const sourceApps = safeConnectedApps(source.apps);
                            const activeCount = sourceApps.filter(a => isToolEnabled(option.id, a.id)).length;
                            const totalCount = sourceApps.length;
                            return (
                              <SourceChip key={source.category} label={source.label} apps={sourceApps} activeCount={activeCount} totalCount={totalCount} hasAnyActive={activeCount > 0} optionId={option.id} isToolEnabled={isToolEnabled} />
                            );
                          })}
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 0.5 }}>
                        {isExpandable && (
                          <Box
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : option.id);
                            }}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              p: 0.5,
                              borderRadius: 1,
                              '&:hover': {
                                background: 'hsl(var(--border))',
                              },
                            }}
                          >
                            <ExpandMoreIcon
                              size={20} style={{ color: 'hsl(var(--muted-foreground))', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}
                            />
                          </Box>
                        )}
                        <Switch
                          checked={option.id === 'threat_intel' ? enrichmentStatus.active : (state.enabled && !isDisabled)}
                          onChange={() => {
                            if (option.id === 'threat_intel') {
                               const run = !enrichmentStatus.active
                                 ? enrichmentStatus.enable()
                                 : enrichmentStatus.disable();
                               void Promise.resolve(run).catch((err) => {
                                 console.error('[enrichment] toggle failed', err);
                               });
                            } else {
                              toggleOption(option.id);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isDisabled || (option.id === 'threat_intel' && enrichmentStatus.isEnabling)}
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: option.color,
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: option.color,
                            },
                          }}
                        />
                      </Box>
                    </Box>

                    {/* Expandable tools list */}
                    {hasExpandableTools && (
                      <Collapse in={isExpanded}>
                        <Box sx={{ mt: 2, pl: 7 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: 'hsl(var(--muted-foreground))', mb: 1.5, display: 'block' }}
                          >
                            Toggle individual tools:
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {optionSources.length > 0 ? (
                              optionSources.filter(s => s.apps.length > 0).map((source) => (
                                <Box key={source.category}>
                                  {source.isOther ? (
                                    // "Other" section: collapsed by default with icon preview
                                    <Box>
                                      <Box
                                        onClick={() => setOtherExpanded(prev => ({ ...prev, [option.id]: !prev[option.id] }))}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 1,
                                          cursor: 'pointer',
                                          py: 0.75,
                                          px: 1,
                                          borderRadius: 1.5,
                                          border: '1px dashed hsl(var(--border))',
                                          background: 'hsl(var(--background-surface))',
                                          transition: 'all 0.2s ease',
                                          '&:hover': {
                                            background: 'hsl(var(--muted))',
                                            borderColor: 'hsl(var(--border))',
                                          },
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          sx={{ 
                                            color: 'hsl(var(--muted-foreground))', 
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.5,
                                            fontSize: '0.65rem',
                                          }}
                                        >
                                          Other
                                        </Typography>
                                        {/* App icon preview when collapsed */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5, flex: 1 }}>
                                          {safeConnectedApps(source.apps).slice(0, 6).map((app, idx) => (
                                            <Tooltip key={app.id} title={readableAppName(app.name)} arrow placement="top">
                                              <Avatar
                                                src={app.image}
                                                alt={app.name}
                                                sx={{
                                                  width: 20,
                                                  height: 20,
                                                  fontSize: '0.5rem',
                                                  border: '2px solid',
                                                  borderColor: app.isValidated 
                                                    ? 'hsl(var(--severity-low) / 0.4)' 
                                                    : 'hsl(var(--severity-medium) / 0.4)',
                                                  backgroundColor: 'transparent',
                                                  ml: idx > 0 ? -0.5 : 0,
                                                }}
                                              >
                                                {app.name[0]}
                                              </Avatar>
                                            </Tooltip>
                                          ))}
                                          {safeConnectedApps(source.apps).length > 6 && (
                                            <Typography
                                              variant="caption"
                                              sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.6rem', ml: 0.5 }}
                                            >
                                              +{safeConnectedApps(source.apps).length - 6}
                                            </Typography>
                                          )}
                                        </Box>
                                        <ExpandMoreIcon
                                          size={16} style={{ color: 'hsl(var(--muted-foreground))', transform: otherExpanded[option.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                                        />
                                      </Box>
                                      <Collapse in={otherExpanded[option.id] || false}>
                                        <Box sx={{ mt: 0.5 }}>
                                          {safeConnectedApps(source.apps).map((app) => renderToolRow(app, option.id, option.color))}
                                        </Box>
                                      </Collapse>
                                    </Box>
                                  ) : (
                                    // Standard categorized section
                                    <>
                                      <Typography
                                        variant="caption"
                                        sx={{ 
                                          color: 'hsl(var(--muted-foreground))', 
                                          fontWeight: 600,
                                          textTransform: 'uppercase',
                                          letterSpacing: 0.5,
                                          fontSize: '0.65rem',
                                          mb: 0.5,
                                          display: 'block',
                                        }}
                                      >
                                        {source.label}
                                      </Typography>
                                      {safeConnectedApps(source.apps).map((app) => renderToolRow(app, option.id, option.color))}
                                    </>
                                  )}
                                </Box>
                              ))
                            ) : option.connectedApps ? (
                              allTools.map((app) => (
                                <Box
                                  key={app.id}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    py: 0.75,
                                    px: 1.5,
                                    borderRadius: 1.5,
                                    background: 'hsl(var(--muted))',
                                    '&:hover': {
                                      background: 'hsl(var(--background))',
                                    },
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Avatar
                                      src={app.image}
                                      alt={app.name}
                                      sx={{
                                        width: 24,
                                        height: 24,
                                        fontSize: '0.7rem',
                                        border: '1px solid hsl(var(--border))',
                                      }}
                                    >
                                      {app.name[0]}
                                    </Avatar>
                                    <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))' }}>
                                      {readableAppName(app.name)}
                                    </Typography>
                                  </Box>
                                  <Switch
                                    size="small"
                                    checked={isToolEnabled(option.id, app.id)}
                                    onChange={() => toggleTool(option.id, app.id, app.name)}
                                    sx={{
                                      '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: option.color,
                                      },
                                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: option.color,
                                      },
                                    }}
                                  />
                                </Box>
                              ))
                            ) : null}
                          </Box>
                        </Box>
                      </Collapse>
                    )}

                    {/* On-call schedule editor - only for assign_escalate */}
                    {isAssignEscalate && (
                      <Collapse in={isExpanded}>
                        <Box sx={{ mt: 2, pl: 7 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'hsl(var(--muted-foreground))',
                              mb: 1.5,
                              display: 'block',
                            }}
                          >
                            Configure on-call schedules. Incoming incidents are auto-assigned to whoever is on-call at their tier; if not acknowledged in time, they escalate to the next tier.
                          </Typography>
                          <OnCallScheduleManager users={scheduleUsers} loading={scheduleUsersLoading} compact />
                        </Box>
                      </Collapse>
                    )}

                    {/* Threat Feed URLs section - only for threat_intel */}
                    {option.id === 'threat_intel' && (
                      <Collapse in={isExpanded}>
                        <Box sx={{ mt: 2, pl: 7 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography
                              variant="caption"
                              sx={{ 
                                color: 'hsl(var(--muted-foreground))', 
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                fontSize: '0.65rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                              }}
                            >
                              <LinkIcon size={14} />
                              Threat Feed URLs
                            </Typography>
                            <Tooltip title="Reset to default feeds" arrow>
                              <IconButton
                                size="small"
                                onClick={() => initThreatFeeds()}
                                sx={{ 
                                  color: 'hsl(var(--muted-foreground))',
                                  '&:hover': { color: 'hsl(var(--primary))' },
                                }}
                              >
                                <RestoreIcon size={16} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          
                          {/* Existing feeds */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5 }}>
                            {threatFeeds.filter((feed): feed is ThreatFeed => !!feed?.id).map((feed) => (
                              <Box
                                key={feed.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  py: 0.75,
                                  px: 1.5,
                                  borderRadius: 1.5,
                                  background: feed.enabled 
                                    ? 'hsl(var(--destructive) / 0.08)' 
                                    : 'hsl(var(--muted))',
                                  border: '1px solid',
                                  borderColor: feed.enabled 
                                    ? 'hsl(var(--destructive) / 0.25)' 
                                    : 'transparent',
                                  opacity: feed.enabled ? 1 : 0.6,
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {editingFeed && editingFeed.id === feed.id ? (
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, mr: 1 }}>
                                    <TextField
                                      size="small"
                                      placeholder="Feed name"
                                      value={editingFeed?.name || ''}
                                      onChange={(e) => setEditingFeed((current) => current?.id === feed.id ? { ...current, name: e.target.value } : current)}
                                      sx={{
                                        '& .MuiOutlinedInput-root': {
                                          bgcolor: 'hsl(var(--muted))',
                                          fontSize: '0.85rem',
                                        },
                                      }}
                                    />
                                    <TextField
                                      size="small"
                                      placeholder="Feed URL"
                                      value={editingFeed?.url || ''}
                                      onChange={(e) => setEditingFeed((current) => current?.id === feed.id ? { ...current, url: e.target.value } : current)}
                                      sx={{
                                        '& .MuiOutlinedInput-root': {
                                          bgcolor: 'hsl(var(--muted))',
                                          fontFamily: 'monospace',
                                          fontSize: '0.75rem',
                                        },
                                      }}
                                    />
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={async () => {
                                          if (editingFeed) {
                                            await saveFeed(editingFeed);
                                            setEditingFeed(null);
                                          }
                                        }}
                                        sx={{ fontSize: '0.7rem', py: 0.25, bgcolor: option.color }}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => setEditingFeed(null)}
                                        sx={{ fontSize: '0.7rem', py: 0.25 }}
                                      >
                                        Cancel
                                      </Button>
                                    </Box>
                                  </Box>
                                ) : (
                                  <>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                      <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}>
                                        {feed.name}
                                      </Typography>
                                      <Typography 
                                        variant="caption" 
                                        sx={{ 
                                          color: 'hsl(var(--muted-foreground))', 
                                          fontFamily: 'monospace',
                                          fontSize: '0.65rem',
                                          display: 'block',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {feed.url}
                                      </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <Tooltip title="Edit feed" arrow>
                                        <IconButton
                                          size="small"
                                          onClick={() => setEditingFeed(feed)}
                                          sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
                                        >
                                          <EditIcon size={16} />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete feed" arrow>
                                        <IconButton
                                          size="small"
                                          onClick={() => deleteFeed(feed.id)}
                                          sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: '#ef4444' } }}
                                        >
                                          <DeleteIcon size={16} />
                                        </IconButton>
                                      </Tooltip>
                                      <Switch
                                        size="small"
                                        checked={feed.enabled}
                                        onChange={() => toggleFeed(feed.id)}
                                        sx={{
                                          '& .MuiSwitch-switchBase.Mui-checked': {
                                            color: option.color,
                                          },
                                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                            backgroundColor: option.color,
                                          },
                                        }}
                                      />
                                    </Box>
                                  </>
                                )}
                              </Box>
                            ))}
                          </Box>
                          
                          {/* Add new feed */}
                          <Box 
                            sx={{ 
                              p: 1.5, 
                              borderRadius: 1.5, 
                              border: '1px dashed hsl(var(--border))',
                              background: 'hsl(var(--muted))',
                            }}
                          >
                            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1, display: 'block' }}>
                              Add new threat feed URL
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              <TextField
                                size="small"
                                placeholder="Feed name"
                                value={newFeedName}
                                onChange={(e) => setNewFeedName(e.target.value)}
                                sx={{
                                  minWidth: 150,
                                  '& .MuiOutlinedInput-root': {
                                    bgcolor: 'hsl(var(--muted))',
                                    fontSize: '0.85rem',
                                  },
                                }}
                              />
                              <TextField
                                size="small"
                                placeholder="https://..."
                                value={newFeedUrl}
                                onChange={(e) => setNewFeedUrl(e.target.value)}
                                sx={{
                                  flex: 1,
                                  minWidth: 200,
                                  '& .MuiOutlinedInput-root': {
                                    bgcolor: 'hsl(var(--muted))',
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                  },
                                }}
                              />
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddIcon size={16} />}
                                disabled={!newFeedUrl.trim() || !newFeedName.trim()}
                                onClick={async () => {
                                  if (newFeedUrl.trim() && newFeedName.trim()) {
                                    const newFeed: ThreatFeed = {
                                      id: `custom_${Date.now()}`,
                                      url: newFeedUrl.trim(),
                                      name: newFeedName.trim(),
                                      enabled: true,
                                    };
                                    await saveFeed(newFeed);
                                    setNewFeedUrl('');
                                    setNewFeedName('');
                                  }
                                }}
                                sx={{ 
                                  borderColor: 'hsl(var(--border))',
                                  color: 'hsl(var(--foreground))',
                                  '&:hover': {
                                    borderColor: option.color,
                                    color: option.color,
                                  },
                                }}
                              >
                                Add
                              </Button>
                            </Box>
                          </Box>
                        </Box>
                      </Collapse>
                    )}

                    {hasConfig && !hasExpandableTools && (
                      <Collapse in={isExpanded && state.enabled}>
                        <Box sx={{ mt: 3, pl: 7, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {option.configFields!.map((field) => (
                            <TextField
                              key={field.label}
                              label={field.label}
                              placeholder={field.placeholder}
                              type={field.type || 'text'}
                              size="small"
                              value={state.config[field.label] || ''}
                              onChange={(e) => updateConfig(option.id, field.label, e.target.value)}
                              fullWidth
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  backgroundColor: 'hsl(var(--background))',
                                  borderRadius: 2,
                                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                                  '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                                  '&.Mui-focused fieldset': { borderColor: option.color },
                                },
                                '& .MuiInputBase-input': { color: 'hsl(var(--foreground))' },
                                '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
                              }}
                            />
                          ))}
                        </Box>
                      </Collapse>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </Box>
      </motion.div>
    </Box>
  );

  const enabledCount = Object.values(enrichmentState).filter((s) => s.enabled).length;

  return (
    <Box>
      {/* Connected Apps — reuse sidebar component */}
      <Box sx={{ mb: 3, ml: -2 }}>
        <IntegrationStatus globalUrl={globalUrl} theme={theme} colorMode={colorMode} userdata={userdata} isLoaded={isLoaded} isLoggedIn={isLoggedIn} serverside={serverside} collapsed={false} iconSize={30} showAll hideAddButton />
      </Box>

      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{
            color: 'hsl(var(--foreground))',
            fontWeight: 700,
            mb: 0.5,
          }}
        >
          Automate & Finish
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'hsl(var(--muted-foreground))' }}
        >
          Review your connected tools, configure automation, and you are all set.
        </Typography>
      </Box>

      {/* Automation Sections */}
      {renderSection('Data Enrichment', enrichmentItems)}
      {renderSection('Automated Response', responseItems)}
    </Box>
  );
};
