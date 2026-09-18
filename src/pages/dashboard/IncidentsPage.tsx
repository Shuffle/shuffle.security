import { readTenantStamp, isTenantGhost, type TenantStamp } from '@/utils/tenantAuthority';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Search as SearchIcon, X as CloseIcon, Plus as AddIcon, RefreshCw as RefreshIcon, Play as PlayArrowIcon, Rocket as RocketLaunchIcon, EyeOff as VisibilityOffIcon, AlertTriangle as WarningAmberIcon, Download as DownloadIcon, Calendar as CalendarTodayIcon, MoreVertical as MoreVerticalIcon, Users as UsersIcon } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore, useDeferredValue } from 'react';
import { useSearchParams, useNavigate } from '@/lib/router-compat';
import { useEntityLabel, useShowAutomation, useEntityText } from '@/hooks/useEntityLabel';
import { AppSearchDrawer } from '@/Shuffle-MCPs';
import { useTheme } from '@/context/ThemeContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  CircularProgress,
  Tooltip,
  Checkbox,
  Autocomplete,
  Alert,
  Dialog,
  DialogContent,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  Skeleton,
} from '@mui/material';
import { motion } from 'framer-motion';
import { normalizeStatus } from '@/config/incidentConfig';
import { useDatastore } from '@/hooks/useDatastore';
import { useAuth } from '@/context/AuthContext';
import { useDemo, TOUR_STEPS } from '@/context/DemoContext';
import { useSubOrgs } from '@/hooks/useSubOrgs';
import { useUsers } from '@/hooks/useUsers';
import { DATASTORE_CATEGORIES, getDatastoreByCategory, getDatastoreItem, setDatastoreItem, setDatastoreItems, CategoryAutomation, deleteDatastoreItem, deleteDatastoreItems } from '@/Shuffle-MCPs/datastore';
import { sweepOrphanDemoIncidents } from '@/services/demoMode';
import { enforceMergedStatusInvariant, writeIncidentSafe } from '@/lib/incidentRelations';
import { extractThreadId } from '@/hooks/useThreadCorrelatedIncidents';

import { CreateIncidentDialog, ActivityItem } from '@/components/incidents/CreateIncidentDialog';
import { OCSFIncidentFinding, Observable, TLP_LABELS, convertLegacyTlp, mapOCSFSeverity, mapOCSFStatus } from '@/config/ocsfIncidentSchema';
import { deduplicateTasks, decodeHtmlEntities, isAIAssignee } from '@/lib/utils';
import { autoCorrectTranslatedString } from '@/lib/translationFallback';
import { ResolveIncidentDialog, ResolutionData, RESOLUTION_REASONS } from '@/components/incidents/ResolveIncidentDialog';
import { CategoryAutomationsDialog } from '@shuffleio/shuffle-core';
import { extractValidatedIngestionApps, ValidatedIngestionApp, findIngestTicketsWorkflow, findForwardTicketsWorkflow, extractWorkflowAppNames, normalizeAppName, isWorkflowScheduleStopped } from '@/Shuffle-MCPs/ingestionDetection';
import { fetchAuthenticatedApps } from '@/Shuffle-MCPs/authenticatedApps';
import { API_CONFIG, getApiUrl, getAuthHeader, isDevEnvironment, mapCloudRegionUrl } from '@/Shuffle-MCPs/api';
import { IncidentCardView } from '@/components/incidents/IncidentCardView';
import { useBackgroundThreadContinuation } from '@/hooks/useBackgroundThreadContinuation';
import { IncidentStatsCards } from '@/components/incidents/IncidentStatsCards';
import { ScheduleHealthBanner } from '@/components/users/ScheduleHealthBanner';
import { IncidentsEmptyState } from '@/components/incidents/IncidentsEmptyState';
import { IngestionSourceButton } from '@/components/incidents/IngestionSourceButton';
import { HighlightSpotlight } from '@/components/incidents/HighlightSpotlight';
import { AutomationReadinessBanner } from '@/components/incidents/AutomationReadinessBanner';
import { RuntimeQueueProblemBar } from '@/components/incidents/RuntimeQueueProblemBar';
import { WebhookIngestionButton, WebhookIngestionInfo } from '@/components/incidents/WebhookIngestionButton';
import { useWebhookStatus } from '@/hooks/useWebhookStatus';
import { IncidentTrendChart } from '@/components/incidents/IncidentTrendChart';
import { OrgTrendChart } from '@/components/incidents/OrgTrendChart';
import { SourceTrendChart } from '@/components/incidents/ToolTrendChart';

import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover as RadixPopover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/lib/toast';
import { resyncState } from '@/lib/resyncState';
import { trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { ensureDefaultsInitialized } from '@/lib/initDefaults';
import {
  matchIncidentSearchText,
  queryIncidentCorrelations,
  fetchMissingCorrelatedIncidents,
  toRawIncidentKey,
} from '@/lib/incidentSearch';

// Legacy categories for migration
const LEGACY_ALERTS_CATEGORY = 'shuffle-alerts';
const LEGACY_SECURITY_ALERTS_CATEGORY = 'shuffle-security_alerts';
const MIGRATION_KEY = 'shuffle_incidents_migrated_v1';
const DEFAULT_STATUS_FILTER = ['new', 'in_progress'];
const INCIDENT_FILTERS_STORAGE_KEY_BASE = 'shuffle_incidents_filters_v1';
const INCIDENT_FILTERS_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Filters are scoped per org so switching tenants doesn't leak the previous
 * tenant's filter selection (especially the `org` tenant multi-select).
 */
const incidentFiltersKey = (orgId: string | null | undefined) =>
  `${INCIDENT_FILTERS_STORAGE_KEY_BASE}::${orgId || 'anon'}`;

const migrateToIncidents = async (): Promise<number> => {
  if (localStorage.getItem(MIGRATION_KEY)) return 0;

  try {
    let allItems: { key: string; value: string }[] = [];

    const oldAlerts = await getDatastoreByCategory(LEGACY_ALERTS_CATEGORY);
    if (oldAlerts.success && oldAlerts.data?.length) {
      allItems = [...allItems, ...oldAlerts.data.map(item => ({ key: item.key, value: item.value }))];
    }

    const securityAlerts = await getDatastoreByCategory(LEGACY_SECURITY_ALERTS_CATEGORY);
    if (securityAlerts.success && securityAlerts.data?.length) {
      allItems = [...allItems, ...securityAlerts.data.map(item => ({ key: item.key, value: item.value }))];
    }

    if (allItems.length === 0) {
      localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
      return 0;
    }

    const result = await setDatastoreItems(allItems, DATASTORE_CATEGORIES.INCIDENTS);
    if (result.success) {
      localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
      return allItems.length;
    }
    return 0;
  } catch (err) {
    console.error('Migration failed:', err);
    return 0;
  }
};

interface TaskItem {
  id: string;
  assignee?: string;
  completed?: boolean;
}

interface DisplayIncident {
  id: string;
  title?: string;
  source?: string;
  severity: string;
  status: string;
  assignee: string | null;
  created: string;
  createdTs: number;
  originCreatedTs?: number;
  edited?: string;
  editedTs?: number;
  tlp?: string;
  pap?: string;
  references?: string[];
  observables?: Observable[];
  relatedFindings?: string[];
  rawOCSF?: OCSFIncidentFinding;
  taskCount?: number;
  tasks?: TaskItem[];
  labels?: string[];
  correlationCount?: number;
  orgId?: string;
  orgName?: string;
  orgImage?: string;
  sharedOrgs?: Array<{ orgId: string; orgName: string; orgImage?: string }>;
}

type SortDirection = 'asc' | 'desc';
type SortKey = 'title' | 'severity' | 'status' | 'assignee' | 'created' | 'edited';

// Status and severity colors now imported from shared config
import { statusConfig, severityColors, severityOrder } from '@/config/incidentConfig';
import { usePageMeta } from '@/hooks/usePageMeta';

/**
 * Normalize any timestamp (Unix seconds, ms, µs, ns, ISO string, numeric string) to ms epoch.
 */
const normalizeToMs = (timestamp: number | string | undefined): number => {
  if (!timestamp) return 0;

  // ISO / date string (contains non-digit chars like '-', 'T', ':')
  if (typeof timestamp === 'string' && /[^0-9.]/.test(timestamp)) {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // Numeric (or numeric string)
  const ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  if (isNaN(ts) || ts <= 0) return 0;

  // Distinguish by magnitude:
  //   seconds:      < 1e12   (up to ~33658 AD)
  //   milliseconds: < 1e15   (up to ~33658 AD)
  //   microseconds: < 1e18
  //   nanoseconds:  >= 1e18
  if (ts < 1e12) return ts * 1000;       // seconds → ms
  if (ts < 1e15) return ts;              // already ms
  if (ts < 1e18) return ts / 1000;       // microseconds → ms
  return ts / 1e6;                        // nanoseconds → ms
};

const formatTimestamp = (timestamp: number | string | undefined): string => {
  const ms = normalizeToMs(timestamp);
  if (!ms) return 'Unknown';
  const date = new Date(ms);
  if (isNaN(date.getTime())) return 'Unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const parseTimestamp = (timestamp: number | string | undefined): number => {
  return normalizeToMs(timestamp);
};


// Strict check: only return string if it has meaningful non-whitespace content
const meaningfulString = (val: unknown): string | undefined => {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed === 'undefined' || trimmed === 'null') return undefined;
  return decodeHtmlEntities(trimmed);
};

// A title looks "bad" when the OCSF translator failed and left an unresolved
// JSONPath expression or dumped a raw header array into the field. Detect the
// common shapes so we can auto-correct via the translation fallback.
const looksLikeBadTitle = (val: unknown): boolean => {
  if (Array.isArray(val)) return true;
  if (typeof val !== 'string') return false;
  const t = val.trim();
  if (!t) return false;
  // Unresolved translation expression: e.g. `$payload.headers[?(@.name=="Subject")].value`
  if (t.startsWith('$') && /[.\[]/.test(t)) return true;
  // Serialized header array (with or without appended filter suffix).
  if (t.startsWith('[{') && /"name"\s*:/.test(t)) return true;
  // Hybrid failure suffix leaked in without a leading `[{`.
  if (/\[\?\(\s*@\./.test(t)) return true;
  return false;
};

// Resolve a title from OCSF data, auto-correcting when the translator left
// behind a broken JSONPath expression or a raw header array (see
// looksLikeBadTitle). The auto-correction pulls the intended header value
// from the raw payload container (unmapped_original / payload).
const resolveTitle = (rawTitle: unknown, container: any, ...fallbacks: unknown[]): string | undefined => {
  if (looksLikeBadTitle(rawTitle)) {
    const fixed = autoCorrectTranslatedString(rawTitle, container, 'Subject');
    if (fixed && !looksLikeBadTitle(fixed)) return meaningfulString(fixed);
  }
  const primary = meaningfulString(rawTitle);
  if (primary && !looksLikeBadTitle(primary)) return primary;
  for (const fb of fallbacks) {
    const s = meaningfulString(fb);
    if (s && !looksLikeBadTitle(s)) return s;
  }
  return undefined;
};

// Normalize source labels so equivalent values render consistently in filters/charts.
// e.g. legacy payloads use "Manual Entry" while the modern create flow uses "Manual".
const normalizeSourceLabel = (val: string | undefined): string | undefined => {
  if (!val) return val;
  if (val.trim().toLowerCase() === 'manual entry') return 'Manual';
  return val;
};

/**
 * Resolve the "created" timestamp for an incident.
 * Priority: value.created_time → item.created (datastore envelope).
 */
const resolveCreatedTs = (data: any, itemCreated?: number): number => {
  // Prefer created_time from the incident value (OCSF field)
  if (data?.created_time) {
    const ct = typeof data.created_time === 'string' && /^\d+$/.test(data.created_time)
      ? Number(data.created_time) : data.created_time;
    const ms = normalizeToMs(ct);
    if (ms > 0) return ms;
  }
  // Fallback to datastore envelope created
  return normalizeToMs(itemCreated);
};

const MAX_INCIDENT_VALUE_LENGTH = 5_000_000; // 5MB safety limit per item

const parseIncidentFromDatastore = (item: { key: string; value: string; created?: number; edited?: number }): DisplayIncident | null => {
  try {
    // Skip items with excessively large values to prevent JSON parse hangs/crashes
    if (item.value && item.value.length > MAX_INCIDENT_VALUE_LENGTH) {
      console.warn(`[Incidents] Skipping oversized incident ${item.key} (${(item.value.length / 1024 / 1024).toFixed(1)}MB)`);
      // Return a minimal stub so the incident is still visible in the list
      return {
        id: item.key,
        title: `[Large incident – ${(item.value.length / 1024 / 1024).toFixed(1)}MB]`,
        source: 'unknown',
        severity: 'medium',
        status: 'new',
        assignee: null,
        created: item.created ? formatTimestamp(item.created) : 'Unknown',
        createdTs: item.created ? parseTimestamp(item.created) : 0,
        originCreatedTs: item.created ? parseTimestamp(item.created) : 0,
        taskCount: 0,
        tasks: [],
        labels: [],
      };
    }

    const data = enforceMergedStatusInvariant(JSON.parse(item.value));
    
    // Check if this is new OCSF format (has finding_uid at root)
    const isNewFormat = 'finding_uid' in data && 'title' in data;
    // Check if legacy OCSF format (has finding_info_list or finding_info)
    const isLegacyOCSF = data.finding_info_list || data.finding_info || data.severity_id !== undefined;
    
    // Extract tasks from various possible locations
    const getTasks = (ocsf: any): TaskItem[] => {
      const tasks = ocsf?.tasks || 
        ocsf?.metadata?.extensions?.custom_attributes?.tasks ||
        [];
      return Array.isArray(tasks) ? tasks : [];
    };
    
    if (isNewFormat) {
      // New OCSF format
      const ocsf = data as OCSFIncidentFinding;
      const customAttrs = ocsf.metadata?.extensions?.custom_attributes;
      const tlpValue = customAttrs?.tlp;
      const tlpLabel = typeof tlpValue === 'number' ? TLP_LABELS[tlpValue]?.label : undefined;
      const tasks = getTasks(data);
      
      // Get raw assignee
      const rawAssignee = customAttrs?.assignee || null;
      
      return {
        id: item.key, // Always use datastore key as the canonical ID
        title: resolveTitle(ocsf.title, data, ocsf.supporting_data, ocsf.desc),
        source: normalizeSourceLabel(meaningfulString(ocsf.product?.name) || meaningfulString(ocsf.types?.[0])),
        severity: mapOCSFSeverity(ocsf.severity_id || 3),
        status: normalizeStatus(ocsf.status || mapOCSFStatus(ocsf.status_id || 1)),
        assignee: rawAssignee,
        created: formatTimestamp(resolveCreatedTs(data, item.created)),
        createdTs: resolveCreatedTs(data, item.created),
        originCreatedTs: resolveCreatedTs(data, item.created),
        edited: item.edited ? formatTimestamp(item.edited) : undefined,
        editedTs: item.edited ? parseTimestamp(item.edited) : undefined,
        tlp: tlpLabel,
        references: ocsf.references,
        observables: customAttrs?.observables,
        relatedFindings: ocsf.related_events,
        rawOCSF: ocsf,
        taskCount: deduplicateTasks(tasks).length,
        tasks,
        labels: Array.isArray(ocsf.types) ? ocsf.types : [],
      };
    } else if (isLegacyOCSF) {
      // Legacy OCSF format with finding_info_list
      const legacyData = data as any;
      const findingInfo = legacyData.finding_info_list?.[0] || legacyData.finding_info;
      const customAttrs = legacyData.metadata?.extensions?.custom_attributes;
      const tlp = customAttrs?.tlp || legacyData.tlp;
      const pap = customAttrs?.pap || legacyData.pap;
      const tasks = getTasks(legacyData);
      
      return {
        id: item.key, // Always use datastore key as the canonical ID
        title: resolveTitle(findingInfo?.title, legacyData, legacyData.supporting_data, legacyData.desc, legacyData.message),
        source: normalizeSourceLabel(meaningfulString(legacyData.metadata?.product?.name) || meaningfulString(findingInfo?.types?.[0])),
        severity: mapOCSFSeverity(legacyData.severity_id),
        status: normalizeStatus(legacyData.status || mapOCSFStatus(legacyData.status_id)),
        assignee: legacyData.assignee || null,
        created: formatTimestamp(resolveCreatedTs(legacyData, item.created)),
        createdTs: resolveCreatedTs(legacyData, item.created),
        originCreatedTs: resolveCreatedTs(legacyData, item.created),
        edited: item.edited ? formatTimestamp(item.edited) : undefined,
        editedTs: item.edited ? parseTimestamp(item.edited) : undefined,
        tlp: typeof tlp === 'string' ? tlp : (tlp ? TLP_LABELS[tlp]?.label : undefined),
        pap,
        references: findingInfo?.references,
        observables: legacyData.observables,
        relatedFindings: legacyData.related_findings,
        rawOCSF: legacyData,
        taskCount: deduplicateTasks(tasks).length,
        tasks,
      };
    } else {
      // Non-OCSF format
      const tasks = data.tasks || [];
      return {
        id: item.key, // Always use datastore key as the canonical ID
        title: resolveTitle(data.title, data, data.supporting_data, data.desc, data.message),
        source: normalizeSourceLabel(meaningfulString(data.source)),
        severity: (data.severity || 'medium').toLowerCase(),
        status: normalizeStatus(data.status),
        assignee: data.assignee || null,
        created: formatTimestamp(resolveCreatedTs(data, item.created)),
        createdTs: resolveCreatedTs(data, item.created),
        originCreatedTs: resolveCreatedTs(data, item.created),
        edited: item.edited ? formatTimestamp(item.edited) : undefined,
        editedTs: item.edited ? parseTimestamp(item.edited) : undefined,
        tlp: data.tlp,
        pap: data.pap,
        references: data.references,
        observables: data.observables,
        rawOCSF: undefined,
        taskCount: Array.isArray(tasks) ? deduplicateTasks(tasks).length : 0,
        tasks: Array.isArray(tasks) ? tasks : [],
      };
    }
  } catch {
    return null;
  }
};

interface Filters {
  severity: string | string[] | null;
  status: string | string[] | null;
  tlp: string | null;
  assignee: string | null;
  source: string | null;
  tag: string | null;
  org: string[] | null;
}

interface PersistedIncidentFilters {
  filters: Filters;
  negatedFilters: string[];
  dateFrom?: string;
  dateTo?: string;
  savedAt: number;
}

const hasActiveFilterParams = (params: URLSearchParams): boolean => {
  const keys = ['severity', 'status', 'tlp', 'assignee', 'source', 'tag', 'not'];
  return keys.some(k => params.has(k));
};

const loadPersistedFilters = (orgId: string | null | undefined): PersistedIncidentFilters | null => {
  try {
    const key = incidentFiltersKey(orgId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedIncidentFilters;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > INCIDENT_FILTERS_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const savePersistedFilters = (
  orgId: string | null | undefined,
  filters: Filters,
  negatedFilters: Set<string>,
  dateFrom?: Date,
  dateTo?: Date
) => {
  try {
    // A "to" date of today (or later) would silently become a stale past-date
    // filter tomorrow, so it is never persisted.
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const persistableDateTo = dateTo && dateTo.getTime() < endOfToday.getTime() ? dateTo : undefined;
    const payload: PersistedIncidentFilters = {
      filters,
      negatedFilters: Array.from(negatedFilters),
      dateFrom: dateFrom?.toISOString(),
      dateTo: persistableDateTo?.toISOString(),
      savedAt: Date.now(),
    };

    localStorage.setItem(incidentFiltersKey(orgId), JSON.stringify(payload));
  } catch {
    // ignore localStorage errors
  }
};

const IncidentsPage = () => {
  const { resolvedTheme } = useTheme();


  const { plural: entityPlural, singular: entitySingular, basePath: entityBasePath } = useEntityLabel();

  usePageMeta({
    title: entityPlural,
    description: `Manage, triage and automate ${entityPlural.toLowerCase()} in Shuffle Security. Track status, severity, observables and response actions in one place.`,
    url: entityBasePath,
  });

  const t = useEntityText();
  const showAutomation = useShowAutomation();
  const { userInfo } = useAuth();
  const currentUsername = userInfo?.username || '';
  const isSupport = userInfo?.support === true;
  const { users, loading: usersLoading } = useUsers();
  const currentOrgId = userInfo?.active_org?.id;
  const currentOrgName = userInfo?.active_org?.name || 'Current';
  const isChildOrg = !!userInfo?.active_org?.creator_org;
  const { subOrgs, parentOrg, isParentOrg: hasRelatedOrgs } = useSubOrgs(currentOrgId);
  // Only show multi-tenant view when we have sub-orgs to show (not just a parent)
  const isParentOrg = subOrgs.length > 0;
  // Automation readiness with nothing configured is hoisted to the top of the
  // stats column so it is the first thing seen.
  // Latched once per page session: the readiness panel picks its position on the
  // first resolved status and never moves again while the user stays on /incidents.
  const [readinessEmpty, setReadinessEmpty] = useState(false);
  const readinessLatchedRef = useRef(false);
  const handleReadinessEmptyChange = useCallback((empty: boolean) => {
    if (readinessLatchedRef.current) return;
    readinessLatchedRef.current = true;
    setReadinessEmpty(empty);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Default child orgs to showing only their own incidents immediately.
  // Persisted filters are ALWAYS loaded (per-org key) so tenant selection
  // and other non-URL fields survive reloads. URL params, when present,
  // override the persisted value for that specific key.
  const [filters, setFilters] = useState<Filters>(() => {
    const parseList = (v: string | null) => {
      if (!v) return null;
      const arr = v.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!arr.length) return null;
      return arr.length === 1 ? arr[0] : arr;
    };
    const persisted = loadPersistedFilters(currentOrgId);
    const persistedFilters = persisted?.filters;
    const urlHas = hasActiveFilterParams(searchParams);

    const sevParam = parseList(searchParams.get('severity'));
    const statusParam = parseList(searchParams.get('status'));
    const tlpParam = searchParams.get('tlp');
    const assigneeParam = searchParams.get('assignee');
    const sourceParam = searchParams.get('source');
    const tagParam = searchParams.get('tag');

    // Pick URL value when the URL provides it, otherwise fall back to the
    // persisted value, then the default. `org` is never in the URL, so it
    // comes purely from persisted state (or the child-org default).
    const pick = <T,>(urlVal: T | null, persistedVal: T | null | undefined, fallback: T | null): T | null => {
      if (urlHas && urlVal != null) return urlVal;
      if (persistedVal != null) return persistedVal;
      return fallback;
    };

    return {
      severity: pick(sevParam, persistedFilters?.severity, null),
      status:   pick(statusParam, persistedFilters?.status, DEFAULT_STATUS_FILTER),
      tlp:      pick(tlpParam || null, persistedFilters?.tlp, null),
      assignee: pick(assigneeParam || null, persistedFilters?.assignee, null),
      source:   pick(sourceParam || null, persistedFilters?.source, null),
      tag:      pick(tagParam || null, persistedFilters?.tag, null),
      org:      persistedFilters?.org ?? (isChildOrg && currentOrgId ? [currentOrgId] : null),
    };
  });
  const [negatedFilters, setNegatedFilters] = useState<Set<string>>(() => {
    const persisted = loadPersistedFilters(currentOrgId);
    const urlHas = hasActiveFilterParams(searchParams);
    if (!urlHas && persisted?.negatedFilters) {
      return new Set(persisted.negatedFilters);
    }
    const neg = searchParams.get('not');
    if (!neg) return persisted?.negatedFilters ? new Set(persisted.negatedFilters) : new Set();
    return new Set(neg.split(',').map(s => s.trim()).filter(Boolean));
  });

  // Sync filter state -> URL search params (excludes org which is controlled separately)
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string | null) => {
      if (value && value.length > 0) params.set(key, value);
      else params.delete(key);
    };
    const serialize = (v: string | string[] | null) => {
      if (!v) return null;
      return Array.isArray(v) ? v.join(',') : v;
    };
    setOrDelete('severity', serialize(filters.severity));
    setOrDelete('status', serialize(filters.status));
    setOrDelete('tlp', filters.tlp);
    setOrDelete('assignee', filters.assignee);
    setOrDelete('source', filters.source);
    setOrDelete('tag', filters.tag);
    setOrDelete('not', negatedFilters.size > 0 ? Array.from(negatedFilters).join(',') : null);
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.severity, filters.status, filters.tlp, filters.assignee, filters.source, filters.tag, negatedFilters]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const persisted = loadPersistedFilters(currentOrgId);
    if (persisted?.dateFrom) {
      const d = new Date(persisted.dateFrom);
      if (!isNaN(d.getTime())) return d;
    }
    return undefined;
  });
  const [dateTo, setDateTo] = useState<Date | undefined>(() => {
    const persisted = loadPersistedFilters(currentOrgId);
    if (persisted?.dateTo) {
      const d = new Date(persisted.dateTo);
      if (!isNaN(d.getTime())) return d;
    }
    return undefined;
  });

  // Tracks which org the current in-memory filter state belongs to. When the
  // active org changes (tenant switch), the previous tenant's `org` selection
  // must NOT be written under the new org's key — otherwise switching from a
  // child tenant back to the parent leaves the parent filtered to that child.
  const hydratedOrgRef = useRef<string | null>(currentOrgId || null);
  useEffect(() => {
    if (!currentOrgId) return;
    if (hydratedOrgRef.current === currentOrgId) return;
    hydratedOrgRef.current = currentOrgId;
    const persistedOrg = loadPersistedFilters(currentOrgId)?.filters?.org;
    orgFilterValidatedRef.current = false;
    setFilters(prev => ({
      ...prev,
      org: persistedOrg ?? (isChildOrg ? [currentOrgId] : null),
    }));
  }, [currentOrgId, isChildOrg]);

  // Persist incident filters to localStorage for up to 24 hours so reloads
  // and sidebar navigation restore the last active filter set. Keyed per
  // org so switching tenants doesn't leak the previous tenant's selection.
  useEffect(() => {
    if (!currentOrgId) return; // wait until we know which org to key under
    if (hydratedOrgRef.current !== currentOrgId) return; // stale filters from previous tenant
    savePersistedFilters(currentOrgId, filters, negatedFilters, dateFrom, dateTo);
  }, [currentOrgId, filters, negatedFilters, dateFrom, dateTo]);


  const orgFilterValidatedRef = useRef(false);
  useEffect(() => {
    if (!currentOrgId || orgFilterValidatedRef.current) return;
    if (!isChildOrg && subOrgs.length === 0) return;
    orgFilterValidatedRef.current = true;
    const validIds = new Set([currentOrgId, ...subOrgs.map(o => o.id)]);
    setFilters(prev => {
      if (!prev.org) return prev;
      const nextOrg = prev.org.filter(id => validIds.has(id));
      if (nextOrg.length === prev.org.length) return prev;
      if (nextOrg.length === 0) {
        return { ...prev, org: isChildOrg ? [currentOrgId] : null };
      }
      return { ...prev, org: nextOrg };
    });
  }, [currentOrgId, subOrgs, isChildOrg]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<HTMLElement | null>(null);
  const [mobileTenantsOpen, setMobileTenantsOpen] = useState(false);
  const isMobileView = useMediaQuery('(max-width:899px)');
  const [automationsDialogOpen, setAutomationsDialogOpen] = useState(false);
  const [categoryAutomations, setCategoryAutomations] = useState<CategoryAutomation[]>([]);
  // Ref mirror so callbacks can read the latest value without being recreated
  const categoryAutomationsRef = useRef<CategoryAutomation[]>([]);
  useEffect(() => { categoryAutomationsRef.current = categoryAutomations; }, [categoryAutomations]);
  const [ingestionApps, setIngestionApps] = useState<ValidatedIngestionApp[]>([]);
  const [forwardApps, setForwardApps] = useState<ValidatedIngestionApp[]>([]);
  const [ingestWorkflowId, setIngestWorkflowId] = useState<string | null>(null);
  const [forwardWorkflowId, setForwardWorkflowId] = useState<string | null>(null);
  const [ingestScheduleStopped, setIngestScheduleStopped] = useState(false);
  const [webhookIngestion, setWebhookIngestion] = useState<WebhookIngestionInfo>({ url: null, exists: false, enabled: false, workflowId: null });
  // Keep the top-bar webhook button in sync with the shared webhook status used
  // by the Automation Readiness banner, so both never disagree.
  const sharedWebhook = useWebhookStatus();
  useEffect(() => {
    if (sharedWebhook.isLoading) return;
    setWebhookIngestion((prev) => {
      if (prev.exists === sharedWebhook.exists && prev.enabled === sharedWebhook.enabled && prev.url === (sharedWebhook.url ?? prev.url)) {
        return prev;
      }
      return {
        ...prev,
        exists: sharedWebhook.exists,
        enabled: sharedWebhook.enabled,
        url: sharedWebhook.url ?? prev.url,
      };
    });
  }, [sharedWebhook.isLoading, sharedWebhook.exists, sharedWebhook.enabled, sharedWebhook.url]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingApps, setIsUpdatingApps] = useState(false);
  const [isUpdatingForwardApps, setIsUpdatingForwardApps] = useState(false);
  const [ingestionLoading, setIngestionLoading] = useState(true);
  const ingestionLoadedOnceRef = useRef(false);
  const pendingTogglesRef = useRef<Map<string, boolean>>(new Map());
  const pendingForwardTogglesRef = useRef<Map<string, boolean>>(new Map());
   const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const forwardDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const [appSearchOpen, setAppSearchOpen] = useState(false);
   const [forwardAppSearchOpen, setForwardAppSearchOpen] = useState(false);
   // Fake auth experience for the demo "add-outlook" step. Holds the app
   // metadata while we show a brief "Connecting…" dialog before injecting
   // the app into the Ingest row.
   const [fakeAuth, setFakeAuth] = useState<{ name: string; image: string } | null>(null);
   // Optimistically-injected ingestion apps from the demo flow (e.g. Outlook
   // Office365 after fake auth). Persisted in localStorage so they survive
   // page reloads, route changes, and any component remount during the tour.
   // Cleared by the demo cleanup flow.
   const [demoInjectedApps, setDemoInjectedApps] = useState<ValidatedIngestionApp[]>(() => {
     try {
       const raw = localStorage.getItem('shuffle_demo_injected_apps');
       return raw ? JSON.parse(raw) : [];
     } catch { return []; }
   });
   useEffect(() => {
     try {
       localStorage.setItem('shuffle_demo_injected_apps', JSON.stringify(demoInjectedApps));
     } catch { /* ignore */ }
   }, [demoInjectedApps]);

   // ─── Demo tour gating ─────────────────────────────────────────────────────
   // While the demo tour is open and on the "add-outlook" step, we strip the
   // automation row down to the bare minimum: webhook + the highlighted "+"
   // button. Existing ingest icons, the arrow, and the entire Forward section
   // are hidden so the user can't be distracted from the one click we want.
   const { active: demoActive, drawerOpen: demoDrawerOpen, step: demoStep, completedSteps: demoCompletedSteps, markStepCompleted, setStepCompleted, hoveredGoalSelector } = useDemo();
   const demoStepId = TOUR_STEPS[demoStep]?.id;
   const isAddOutlookStep = demoActive && demoDrawerOpen && demoStepId === 'add-outlook';
   const shouldHighlightOutlook = isAddOutlookStep && !demoCompletedSteps['add-outlook:outlook'];
   // Realtime highlight while the user hovers the "Add Outlook Office365 or
   // Gmail" sub-goal row in the demo drawer — pulses both pinned cards.
   const isHoveringEmailGoal = hoveredGoalSelector === '[data-tour="demo-email-apps"]';

   // Reconcile sub-goal completion with whatever apps are already injected.
   // Otherwise, returning to the tour after a reload would leave the goals
   // locked even though both apps are visibly present in the Ingest bar.
   useEffect(() => {
     if (!demoActive) return;
     const hasEmail = demoInjectedApps.some(a => /outlook|office365|gmail/i.test(a.name));
     if (hasEmail) {
       markStepCompleted('add-outlook:open-picker');
       markStepCompleted('add-outlook:outlook');
     }
   }, [demoActive, demoInjectedApps, markStepCompleted]);

   // Mark the "Click Add ingestion source" sub-goal complete the moment the
   // picker drawer opens during the add-outlook step.
   useEffect(() => {
     if (!isAddOutlookStep) return;
     if (appSearchOpen) markStepCompleted('add-outlook:open-picker');
   }, [isAddOutlookStep, appSearchOpen, markStepCompleted]);

   // Demo step #3 ("ingest-webhook"): the "Enable the AI Agent automation"
   // sub-goal is satisfied iff the "Run AI Agent" automation is currently
   // enabled in this org. We mirror the live state both ways so toggling the
   // automation off in the dialog re-locks the step.
   useEffect(() => {
     if (!demoActive) return;
     const aiAgentEnabled = categoryAutomations.some(
       a => a.enabled && (a.type === 'ai_agent' || a.name === 'Run AI Agent'),
     );
     setStepCompleted('ingest-webhook:automation', aiAgentEnabled);
   }, [demoActive, categoryAutomations, setStepCompleted]);

   // When demo mode is off, drop any stale injected apps so they don't keep
   // appearing in the Ingest bar after cleanup (or in fresh sessions where
   // localStorage still has leftovers from a prior demo run).
   useEffect(() => {
     if (!demoActive && demoInjectedApps.length > 0) {
       setDemoInjectedApps([]);
     }
   }, [demoActive, demoInjectedApps.length]);

   // When the demo lands on a step that depends on the seeded incidents being
   // visible, make sure the user's current filters are not silently hiding
   // the demo data we just wrote into their org. We clear narrowing filters
   // and ensure the current org is in the org filter so the seeded items
   // show up immediately.
   const incidentsVisibilityResetRef = useRef(false);
   useEffect(() => {
     if (!demoActive) {
       incidentsVisibilityResetRef.current = false;
       return;
     }
     if (incidentsVisibilityResetRef.current) return;
     const stepsThatNeedVisibleIncidents = new Set([
       'incidents-list', 'incident-detail', 'assets', 'vulnerabilities', 'agent', 'wrap',
     ]);
     if (!stepsThatNeedVisibleIncidents.has(demoStepId || '')) return;
     incidentsVisibilityResetRef.current = true;
     setFilters(prev => {
       const orgFilter = Array.isArray(prev.org) ? prev.org : prev.org ? [prev.org] : [];
       const includesCurrent = currentOrgId ? orgFilter.includes(currentOrgId) : true;
       return {
         ...prev,
         severity: null,
          status: DEFAULT_STATUS_FILTER,
         source: null,
         tag: null,
         assignee: null,
         tlp: null,
         org: includesCurrent ? prev.org : (currentOrgId ? [...orgFilter, currentOrgId] : prev.org),
       };
     });
     setNegatedFilters(new Set());
   }, [demoActive, demoStepId, currentOrgId]);

   // Whenever the demo tour drawer is open, hide the arrow and the entire
   // Forward section so users stay focused on the ingestion flow.
   const isDemoTourActive = demoActive && demoDrawerOpen;

   // Hover state for automation sections (state-based to survive popover portals)
   const [ingestHovered, setIngestHovered] = useState(false);
   const [forwardHovered, setForwardHovered] = useState(false);
   const ingestHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const forwardHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

   const handleIngestEnter = useCallback(() => {
     if (ingestHoverTimer.current) clearTimeout(ingestHoverTimer.current);
     setIngestHovered(true);
   }, []);
   const handleIngestLeave = useCallback(() => {
     ingestHoverTimer.current = setTimeout(() => setIngestHovered(false), 300);
   }, []);
   const handleForwardEnter = useCallback(() => {
     if (forwardHoverTimer.current) clearTimeout(forwardHoverTimer.current);
     setForwardHovered(true);
   }, []);
   const handleForwardLeave = useCallback(() => {
     forwardHoverTimer.current = setTimeout(() => setForwardHovered(false), 300);
   }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  const [correlatedIncidentIds, setCorrelatedIncidentIds] = useState<Set<string>>(new Set());
  const [extraCorrelatedIncidents, setExtraCorrelatedIncidents] = useState<DisplayIncident[]>([]);
  const correlationAbortControllerRef = useRef<AbortController | null>(null);
  const incidentsRef = useRef<DisplayIncident[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResolveDialogOpen, setBulkResolveDialogOpen] = useState(false);
  const [isBulkResolving, setIsBulkResolving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Sorting
  const [sortBy, setSortBy] = useState<SortKey>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { items: datastoreItems, isLoading, isRefreshing, hasFetched, error, lastDiagnostics, fetchItems, addItem, hasMore, fetchNextPage, categoryConfig, totalAmount } = useDatastore({
    category: DATASTORE_CATEGORIES.INCIDENTS,
    orgId: currentOrgId,
  });

  const supportIncidentDebugRows = useMemo<Array<[string, string]>>(() => {
    if (!isSupport || !error) return [];

    const fallbackRequestUrl = currentOrgId
      ? getApiUrl(`/api/v1/orgs/${currentOrgId}/list_cache?category=${encodeURIComponent(DATASTORE_CATEGORIES.INCIDENTS)}&top=50`)
      : 'Unknown';

    return [
      ['Hook error', error],
      ['Org', currentOrgId ? `${currentOrgName} (${currentOrgId})` : currentOrgName],
      ['API base', API_CONFIG.baseUrl],
      ['Request URL', lastDiagnostics?.url || fallbackRequestUrl],
      ['HTTP', lastDiagnostics?.status != null ? `${lastDiagnostics.status}${lastDiagnostics.statusText ? ` ${lastDiagnostics.statusText}` : ''}` : 'No status captured'],
      ['Failure stage', lastDiagnostics?.errorStage || 'unknown'],
      ['Content-Type', lastDiagnostics?.contentType || 'unknown'],
      ['Response shape', lastDiagnostics?.responseShape || 'unknown'],
      ['Items parsed', lastDiagnostics?.itemCount != null ? String(lastDiagnostics.itemCount) : 'n/a'],
      ['Page state', `hasFetched=${hasFetched}, loading=${isLoading}, refreshing=${isRefreshing}, cachedItems=${datastoreItems.length}`],
    ];
  }, [isSupport, error, currentOrgId, currentOrgName, lastDiagnostics, hasFetched, isLoading, isRefreshing, datastoreItems.length]);

  useEffect(() => {
    if (!isSupport || !error) return;

    console.error('[IncidentsPage] Failed to load incidents', {
      error,
      orgId: currentOrgId ?? null,
      orgName: currentOrgName,
      apiBaseUrl: API_CONFIG.baseUrl,
      diagnostics: lastDiagnostics,
      pageState: {
        hasFetched,
        isLoading,
        isRefreshing,
        cachedItems: datastoreItems.length,
      },
    });
  }, [isSupport, error, currentOrgId, currentOrgName, lastDiagnostics, hasFetched, isLoading, isRefreshing, datastoreItems.length]);

  // Sub-org incident fetching for multi-tenant view
  const [subOrgItems, setSubOrgItems] = useState<Map<string, { orgName: string; orgImage?: string; items: typeof datastoreItems }>>(new Map());
  const [subOrgLoading, setSubOrgLoading] = useState<Set<string>>(new Set());
  const [subOrgFailed, setSubOrgFailed] = useState<Set<string>>(new Set());

  // Fetch incidents from all sub-orgs in parallel
  // Only fetch child orgs when we ARE a parent. Don't fetch parent org incidents
  // when we're in a child org — the parent API returns child incidents too, causing duplicates.
  const fetchSubOrgIncidents = useCallback(async () => {
    // Only fetch sub-orgs (children), never the parent org
    const orgsToFetch = subOrgs.filter(o => o.id !== currentOrgId);
    if (orgsToFetch.length === 0) return;

    const loadingIds = new Set(orgsToFetch.map(o => o.id));
    setSubOrgLoading(loadingIds);
    setSubOrgFailed(new Set());

    // Fetch each org independently so results stream in as they complete
    orgsToFetch.forEach(async (org) => {
      try {
        const mappedRegionUrl = org.region_url ? mapCloudRegionUrl(org.region_url) : null;
        const useRegionUrl = mappedRegionUrl && !isDevEnvironment();
        const baseUrl = useRegionUrl ? mappedRegionUrl!.replace(/\/+$/, '') : '';
        const url = baseUrl
          ? `${baseUrl}/api/v1/orgs/${org.id}/list_cache?category=${encodeURIComponent(DATASTORE_CATEGORIES.INCIDENTS)}&top=50`
          : getApiUrl(`/api/v1/orgs/${org.id}/list_cache?category=${encodeURIComponent(DATASTORE_CATEGORIES.INCIDENTS)}&top=50`);
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            'Org-Id': org.id,
          },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.keys || data.data || []);
        setSubOrgItems(prev => {
          const next = new Map(prev);
          next.set(org.id, { orgName: org.name, orgImage: org.image, items });
          return next;
        });
      } catch {
        setSubOrgFailed(prev => new Set(prev).add(org.id));
        setSubOrgItems(prev => {
          const next = new Map(prev);
          next.set(org.id, { orgName: org.name, orgImage: org.image, items: [] });
          return next;
        });
      } finally {
        setSubOrgLoading(prev => {
          const next = new Set(prev);
          next.delete(org.id);
          return next;
        });
      }
    });
  }, [subOrgs, parentOrg, currentOrgId]);

  // Fetch other org incidents when multi-tenant view is available
  useEffect(() => {
    if (isParentOrg) {
      fetchSubOrgIncidents();
    } else {
      setSubOrgItems(new Map());
    }
  }, [isParentOrg, currentOrgId, fetchSubOrgIncidents]);

  // Refetch when an incident is moved between tenants
  useEffect(() => {
    const handleIncidentMoved = () => {
      fetchItems();
      if (isParentOrg) {
        fetchSubOrgIncidents();
      }
    };
    window.addEventListener('shuffle:incident-moved', handleIncidentMoved);
    return () => window.removeEventListener('shuffle:incident-moved', handleIncidentMoved);
  }, [fetchItems, isParentOrg, fetchSubOrgIncidents]);

  // Auto-select all orgs when filter is empty and multi-tenant view is available
  useEffect(() => {
    if (isParentOrg && (!filters.org || (Array.isArray(filters.org) && filters.org.length === 0))) {
      const allIds = [
        currentOrgId || '',
        ...subOrgs.filter(o => o.id !== currentOrgId).map(o => o.id),
      ];
      setFilters(prev => ({ ...prev, org: allIds }));
    }
  }, [isParentOrg, filters.org, currentOrgId, subOrgs]);


  const validUsernames = useMemo(() => {
    return new Set(users.map(u => u.username.toLowerCase()));
  }, [users]);

  useEffect(() => {
    const init = async () => {
      // Ensure default Threat Feeds & IOC Types exist for this org
      ensureDefaultsInitialized();
      const migratedCount = await migrateToIncidents();
      if (migratedCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      // Demo incidents are now treated as real ones — they show up with a
      // "Demo" badge instead of being silently swept away. Explicit cleanup
      // still happens via "Clean up demo data" on the dashboard.
      await fetchItems();
    };
    init();
  }, [fetchItems]);

  // Initialize category automations once from categoryConfig — subsequent
  // side-loaded refreshes of the config would otherwise clobber in-flight
  // user edits in the dialog.
  const categoryAutomationsInitedRef = useRef(false);
  useEffect(() => {
    if (categoryAutomationsInitedRef.current) return;
    if (categoryConfig?.automations) {
      setCategoryAutomations(categoryConfig.automations);
      categoryAutomationsInitedRef.current = true;
    }
  }, [categoryConfig]);

  // Fetch ingestion apps — workflows are the source of truth for enabled state
  const fetchIngestionApps = useCallback(async () => {
    if (!ingestionLoadedOnceRef.current) {
      setIngestionLoading(true);
    }
    try {
      const [authApps, workflowsResponse] = await Promise.all([
        fetchAuthenticatedApps(currentOrgId).catch(() => []),
        fetch(getApiUrl('/api/v1/workflows'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
      ]);

      if (Array.isArray(authApps)) {

        // Derive enabled apps from the Ingest Tickets workflow actions
        let workflowAppNames: Set<string> | undefined;
        let forwardAppNames: Set<string> | undefined;
        if (workflowsResponse.ok) {
          const workflows = await workflowsResponse.json();
          const workflowList = Array.isArray(workflows) ? workflows : (workflows.workflows || []);
          const ingestWorkflow = findIngestTicketsWorkflow(workflowList);
          if (ingestWorkflow) {
            const scheduleStopped = isWorkflowScheduleStopped(ingestWorkflow);
            setIngestScheduleStopped(scheduleStopped);
            // If schedule is stopped, treat as no enabled sources
            if (!scheduleStopped) {
              workflowAppNames = extractWorkflowAppNames(ingestWorkflow);
            }
            // Only expose the workflow ID for execution when it is owned by
            // the active org. Workflows distributed from a parent tenant show
            // up in /api/v1/workflows but cannot be executed in the child
            // context (server returns "Workflow ID to execute is not valid").
            const wfOrgId = ingestWorkflow.org_id || ingestWorkflow.org || ingestWorkflow.execution_org;
            const ownedByActiveOrg = !wfOrgId || !currentOrgId || wfOrgId === currentOrgId;
            setIngestWorkflowId(ownedByActiveOrg ? ingestWorkflow.id : null);
          } else {
            setIngestScheduleStopped(false);
            setIngestWorkflowId(null);
          }

          // Detect "Forward Tickets" workflow
          const forwardWorkflow = findForwardTicketsWorkflow(workflowList);
          if (forwardWorkflow) {
            // Also check if the Forward Tickets workflow is referenced in category automations' "Run workflow"
            const workflowAuto = categoryAutomationsRef.current?.find(a => (a.type === 'workflow' || a.name === 'Run workflow') && a.enabled);
            const automationWorkflowIds = workflowAuto?.options?.find(o => o.key === 'workflow_id')?.value?.split(',').map(id => id.trim()).filter(Boolean) || [];
            const isReferencedInAutomations = automationWorkflowIds.includes(forwardWorkflow.id);

            if (isReferencedInAutomations) {
              forwardAppNames = extractWorkflowAppNames(forwardWorkflow);
              setForwardWorkflowId(forwardWorkflow.id);
            } else {
              // Workflow exists but not referenced in automations — treat as disabled
              setForwardWorkflowId(null);
            }
          } else {
            setForwardWorkflowId(null);
          }

          // Detect "Ingestion Webhook" workflow and extract webhook URL + status
          const webhookWorkflow = workflowList.find((w: any) => w.name === 'Ingestion Webhook');
          if (webhookWorkflow) {
            const webhookTrigger = (webhookWorkflow.triggers || []).find(
              (t: any) => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook'
            );
            let webhookUrl: string | null = null;
            if (webhookTrigger) {
              const webhookId = webhookTrigger.id || webhookTrigger.trigger_id;
              if (webhookId) {
                webhookUrl = getApiUrl(`/api/v1/hooks/webhook_${webhookId}`);
              }
            }
            // Enabled only if the trigger itself is not stopped
            const triggerStopped = !webhookTrigger || (webhookTrigger.status || '').toLowerCase() === 'stopped';
            const webhookEnabled = !triggerStopped;
            setWebhookIngestion({
              url: webhookUrl,
              exists: true,
              enabled: webhookEnabled,
              workflowId: webhookWorkflow.id,
            });
          } else {
            setWebhookIngestion({ url: null, exists: false, enabled: false, workflowId: null });
          }
        }

        const ingestionResults = extractValidatedIngestionApps(authApps, workflowAppNames);
        // Backfill missing images: 1) module cache + Algolia, 2) /api/v1/apps as last resort
        const { backfillAppImages, deduplicateAuthApps, seedImageCache } = await import('@/lib/utils');
        const deduped = deduplicateAuthApps(authApps.filter((a: any) => a.active || a.validation?.valid) as any);
        await backfillAppImages(deduped);
        const imgMap = new Map<string, string>();
        deduped.forEach(d => { if (d.bestImage) imgMap.set(normalizeAppName(d.app.name), d.bestImage); });
        ingestionResults.forEach(app => {
          if (!app.image) app.image = imgMap.get(normalizeAppName(app.name)) || '';
        });

        // Fallback: any app still without an image — look it up in /api/v1/apps by normalized name.
        // Both Algolia and the auth list can miss images for legitimate apps; /api/v1/apps usually has it.
        const stillMissing = ingestionResults.filter(a => !a.image);
        if (stillMissing.length > 0) {
          try {
            const appsRes = await fetch(getApiUrl('/api/v1/apps'), {
              credentials: 'include',
              headers: { ...getAuthHeader() },
            });
            if (appsRes.ok) {
              const apps = await appsRes.json();
              const list: any[] = Array.isArray(apps) ? apps : [];
              const byName = new Map<string, string>();
              list.forEach(a => {
                const img = a.large_image || a.image_url;
                if (img && a.name) byName.set(normalizeAppName(a.name), img);
              });
              stillMissing.forEach(app => {
                const img = byName.get(normalizeAppName(app.name));
                if (img) {
                  app.image = img;
                  seedImageCache(app.name, img);
                }
              });
            }
          } catch {}
        }
        setIngestionApps(ingestionResults);

        // Extract forward apps using same auth data but Forward Tickets workflow
        const forwardResults = extractValidatedIngestionApps(authApps, forwardAppNames);
        forwardResults.forEach(app => {
          if (!app.image) app.image = imgMap.get(normalizeAppName(app.name)) || '';
        });
        setForwardApps(forwardResults);
      }
    } catch (error) {
      console.error('Failed to fetch ingestion apps:', error);
    } finally {
      setIngestionLoading(false);
      ingestionLoadedOnceRef.current = true;
    }
  }, [currentOrgId]);

  useEffect(() => {
    fetchIngestionApps();
    // Re-runs when fetchIngestionApps identity changes (e.g. when currentOrgId resolves)
    const handleIntegrationsChanged = () => {
      fetchIngestionApps();
    };
    window.addEventListener('integrations-changed', handleIntegrationsChanged);
    return () => {
      window.removeEventListener('integrations-changed', handleIntegrationsChanged);
    };
  }, [fetchIngestionApps]);

  // Debounced handler: collects app toggles for 3s then fires one generate call
  const handleToggleApp = useCallback((appName: string, enabled: boolean) => {
    pendingTogglesRef.current.set(appName, enabled);
    trackPredefinedEvent(GA_EVENTS.INCIDENT_INGESTION_TOGGLE, appName, enabled ? 1 : 0);
    setIsUpdatingApps(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const toggles = new Map(pendingTogglesRef.current);
      pendingTogglesRef.current.clear();
      const activeNames = ingestionApps
        .filter(a => toggles.has(a.name) ? toggles.get(a.name) : a.enabled)
        .map(a => a.name);
      try {
        const body: Record<string, string> = {
          label: 'Ingest Tickets',
          category: 'cases',
        };
        if (activeNames.length > 0) {
          body.app_name = activeNames.join(',');
        } else {
          body.action_name = 'remove';
        }
        await fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Ingestion sources updated');
        await fetchIngestionApps();
        // Only trigger sync if we still have active sources (remove means nothing to execute)
        if (activeNames.length > 0) {
          // Fetch workflows to get the current Ingest Tickets workflow ID, then execute
          try {
            const wfResp = await fetch(getApiUrl('/api/v1/workflows'), {
              credentials: 'include',
              headers: getAuthHeader(),
            });
            const wfs = await wfResp.json();
            const ingestWf = Array.isArray(wfs) && wfs.find((w: any) => w.name === 'Ingest Tickets');
            if (ingestWf?.id) {
              triggerSync(ingestWf.id);
            }
          } catch { /* ignore */ }
        }
      } catch (error) {
        console.error('Failed to update ingestion sources:', error);
        toast.error('Failed to update ingestion sources');
        fetchIngestionApps();
      } finally {
        setIsUpdatingApps(false);
      }
    }, 3000);
  }, [ingestionApps, fetchIngestionApps]);

  // Debounced handler for forward app toggles
  const handleToggleForwardApp = useCallback((appName: string, enabled: boolean) => {
    pendingForwardTogglesRef.current.set(appName, enabled);
    setIsUpdatingForwardApps(true);
    if (forwardDebounceTimerRef.current) clearTimeout(forwardDebounceTimerRef.current);
    forwardDebounceTimerRef.current = setTimeout(async () => {
      const toggles = new Map(pendingForwardTogglesRef.current);
      pendingForwardTogglesRef.current.clear();
      const activeNames = forwardApps
        .filter(a => toggles.has(a.name) ? toggles.get(a.name) : a.enabled)
        .map(a => a.name);
      try {
        const body: Record<string, string> = {
          label: 'Forward Tickets',
          category: 'cases',
        };
        if (activeNames.length > 0) {
          body.app_name = activeNames.join(',');
        } else {
          body.action_name = 'remove';
        }
        await fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Forward destinations updated');
        // Re-fetch category config (which includes automations) so forward detection picks up the updated workflow reference
        await fetchItems();
        await fetchIngestionApps();
      } catch (error) {
        console.error('Failed to update forward destinations:', error);
        toast.error('Failed to update forward destinations');
        fetchIngestionApps();
      } finally {
        setIsUpdatingForwardApps(false);
      }
    }, 3000);
  }, [forwardApps, fetchIngestionApps, fetchItems]);

  const triggerSync = useCallback(async (overrideWorkflowId?: string) => {
    const wfId = overrideWorkflowId || ingestWorkflowId;
    if (!wfId || isSyncing) return;
    setIsSyncing(true);
    try {
      const resp = await fetch(getApiUrl(`/api/v1/workflows/${wfId}/execute`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ execution_source: 'manual', start: '' }),
      });
      if (resp.ok) {
        trackPredefinedEvent(GA_EVENTS.INCIDENT_SYNC);
        toast.success(t('Sync started — polling for new incidents…'));
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          await fetchItems();
          if (pollCount >= 6) {
            clearInterval(pollInterval);
            setIsSyncing(false);
          }
        }, 10000);
      } else {
        let errorMsg = 'Failed to trigger sync';
        try {
          const errorData = await resp.json();
          if (errorData?.reason) errorMsg = errorData.reason;
        } catch { /* ignore parse errors */ }
        toast.error(errorMsg);
        setIsSyncing(false);
      }
    } catch {
      toast.error('Failed to trigger sync');
      setIsSyncing(false);
    }
  }, [ingestWorkflowId, isSyncing, fetchItems]);

  // Auto-sync when arriving from onboarding with ?autoSync=1
  const autoSyncTriggered = useCallback(async () => {
    if (!searchParams.has('autoSync') || !ingestWorkflowId || isSyncing) return;
    setSearchParams((prev) => { prev.delete('autoSync'); return prev; }, { replace: true });
    await triggerSync();
  }, [searchParams, ingestWorkflowId, isSyncing, setSearchParams, triggerSync]);

  useEffect(() => {
    autoSyncTriggered();
  }, [autoSyncTriggered]);

  // Helper: check if an incident has meaningful content (title or description)
  const hasContent = (incident: DisplayIncident): boolean => {
    // If rawOCSF only has 'unmapped' as a meaningful top-level field, treat as irrelevant
    const raw = incident.rawOCSF as any;
    if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw).filter(k => k !== 'class_uid' && k !== 'class_name');
      if (keys.length === 1 && keys[0] === 'unmapped') return false;
    }
    const hasTitle = !!incident.title;
    const hasDesc = !!(raw?.desc || raw?.message || raw?.finding_info?.title || raw?.finding_info_list?.[0]?.title);
    return hasTitle || hasDesc;
  };

  // Derive incidents synchronously from datastoreItems to avoid flash of empty state
  // Also validate assignees - only show if they're a valid user or AI Agent
  // Merge in sub-org incidents when available
  const incidents = useMemo(() => {
    // Parse current org incidents
    const currentOrgIncidents = datastoreItems
      .map((item) => parseIncidentFromDatastore(item))
      .filter((a): a is DisplayIncident => a !== null)
      .map((incident) => {
        let updated = incident;
        if (updated.assignee) {
          if (isAIAssignee(updated.assignee)) {
            updated = { ...updated, assignee: 'AI Agent' };
          } else if (!validUsernames.has(updated.assignee.toLowerCase())) {
            updated = { ...updated, assignee: null };
          }
        }
        return { ...updated, orgId: currentOrgId || '', orgName: currentOrgName, orgImage: userInfo?.active_org?.image };
      });

    // Parse sub-org incidents and tag with org info
    const subOrgIncidents: DisplayIncident[] = [];
    subOrgItems.forEach(({ orgName, orgImage, items }, orgId) => {
      items.forEach((item: any) => {
        const parsed = parseIncidentFromDatastore(item);
        if (parsed) {
          const rawParsedId = toRawIncidentKey(parsed.id);
          subOrgIncidents.push({
            ...parsed,
            id: `${orgId}::${rawParsedId}`,
            orgId,
            orgName,
            orgImage,
          });
        }
      });
    });

    const allIncidents = [...currentOrgIncidents, ...subOrgIncidents];

    // Deduplicate cross-org incidents with the same key — keep the most
    // recently edited copy AND respect the authoritative tenant stamp so
    // ghost copies (auto-recovered by pipelines in tenants the incident was
    // explicitly moved out of) are hidden from the tenant count.
    const deduped: DisplayIncident[] = [];
    const keyMap = new Map<string, {
      best: DisplayIncident;
      copies: Array<{ orgId: string; orgName: string; orgImage?: string; inc: DisplayIncident }>;
    }>();

    for (const inc of allIncidents) {
      const rawKey = toRawIncidentKey(inc.id);
      const existing = keyMap.get(rawKey);
      const copyEntry = { orgId: inc.orgId || '', orgName: inc.orgName || '', orgImage: inc.orgImage, inc };

      if (!existing) {
        keyMap.set(rawKey, { best: inc, copies: [copyEntry] });
      } else {
        if (!existing.copies.some(o => o.orgId === copyEntry.orgId)) {
          existing.copies.push(copyEntry);
        }
        const existingTs = existing.best.editedTs || existing.best.createdTs || 0;
        const newTs = inc.editedTs || inc.createdTs || 0;
        if (newTs > existingTs) {
          existing.best = inc;
        }
      }
    }

    for (const { best, copies } of keyMap.values()) {
      // Pick the authoritative tenant stamp (newest _tenants_updated_at
      // across all copies). Any tenant in the stamp's `removed` list is a
      // ghost and gets filtered out of the presence set.
      let authStamp: TenantStamp | null = null;
      for (const c of copies) {
        const s = readTenantStamp((c.inc as any).rawOCSF);
        if (!s) continue;
        if (!authStamp || s.updatedAt > authStamp.updatedAt) authStamp = s;
      }
      const liveCopies = copies.filter(c => !isTenantGhost(c.orgId, authStamp));
      // If every remaining copy was a ghost (shouldn't happen — at least the
      // authoritative one lives somewhere) fall back to raw copies rather
      // than dropping the incident entirely.
      const effectiveCopies = liveCopies.length > 0 ? liveCopies : copies;
      const allOrgs = effectiveCopies.map(c => ({ orgId: c.orgId, orgName: c.orgName, orgImage: c.orgImage }));

      // If `best` came from a ghost tenant, promote the most-recent live copy
      // instead so we don't render a stale/duplicated tenant on the card.
      let bestInc = best;
      if (isTenantGhost(best.orgId || '', authStamp)) {
        const sortedLive = [...effectiveCopies].sort((a, b) => {
          const at = a.inc.editedTs || a.inc.createdTs || 0;
          const bt = b.inc.editedTs || b.inc.createdTs || 0;
          return bt - at;
        });
        if (sortedLive[0]) bestInc = sortedLive[0].inc;
      }

      deduped.push({
        ...bestInc,
        sharedOrgs: allOrgs.length > 1 ? allOrgs : undefined,
      });
    }

    return deduped;
    // currentOrgId/Name/Image must be deps — otherwise items parsed before
    // auth resolves stay tagged with orgId='' and the org filter drops them all.
  }, [datastoreItems, validUsernames, subOrgItems, currentOrgId, currentOrgName, userInfo?.active_org?.image]);

  // Keep incidentsRef synced with latest incidents for async correlation queries
  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);

  // Debounced correlations lookup when the user is done typing (400ms pause)
  useEffect(() => {
    const trimmed = searchQuery.trim();

    // Cancel in-flight correlation request
    if (correlationAbortControllerRef.current) {
      correlationAbortControllerRef.current.abort();
      correlationAbortControllerRef.current = null;
    }

    if (!trimmed || trimmed.length < 2) {
      setCorrelatedIncidentIds(new Set());
      setExtraCorrelatedIncidents([]);
      setCorrelationsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      const controller = new AbortController();
      correlationAbortControllerRef.current = controller;
      setCorrelationsLoading(true);

      try {
        const ids = await queryIncidentCorrelations(trimmed, currentOrgId, controller.signal);
        if (controller.signal.aborted) return;

        const idSet = new Set(ids);
        setCorrelatedIncidentIds(idSet);

        // If correlations returned IDs, check for missing records in the local dataset
        if (ids.length > 0) {
          const loadedIds = new Set(incidentsRef.current.map(i => toRawIncidentKey(i.id)));
          const missingIds = ids.filter(id => !loadedIds.has(toRawIncidentKey(id)));

          if (missingIds.length > 0) {
            const extra = await fetchMissingCorrelatedIncidents(missingIds, (item) => {
              const parsed = parseIncidentFromDatastore(item);
              if (!parsed) return null;
              return {
                ...parsed,
                orgId: currentOrgId || '',
                orgName: currentOrgName,
              };
            });

            if (!controller.signal.aborted && extra.length > 0) {
              setExtraCorrelatedIncidents(extra);
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[Incidents] Correlation search failed:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setCorrelationsLoading(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      if (correlationAbortControllerRef.current) {
        correlationAbortControllerRef.current.abort();
      }
    };
  }, [searchQuery, currentOrgId, currentOrgName]);

  // Count incidents per source for current org only (used by ingestion source buttons)
  const incidentCountsBySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of datastoreItems) {
      const parsed = parseIncidentFromDatastore(item);
      if (parsed?.source) {
        const normalizedSource = parsed.source.toLowerCase().trim().replace(/[\s_\-]+/g, '_');
        counts.set(normalizedSource, (counts.get(normalizedSource) || 0) + 1);
      }
    }
    return counts;
  }, [datastoreItems]);

  // Split into relevant and irrelevant
  const [relevantIncidents, irrelevantCount] = useMemo(() => {
    const relevant: DisplayIncident[] = [];
    let irrelevant = 0;
    for (const inc of incidents) {
      if (hasContent(inc)) {
        relevant.push(inc);
      } else {
        irrelevant++;
      }
    }
    return [relevant, irrelevant] as const;
  }, [incidents]);

  const [showIrrelevant, setShowIrrelevant] = useState(true);
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  const [resyncingSource, setResyncingSource] = useState<string>('');
  const autoResyncQueueRef = useRef<Set<string>>(new Set());

  // Subscribe to shared resync state (from detail page navigations)
  const sharedResyncIds = useSyncExternalStore(
    resyncState.subscribe,
    resyncState.getAll,
  );
  const allResyncingIds = useMemo(() => {
    const ids = new Set(sharedResyncIds);
    if (resyncingId) ids.add(resyncingId);
    return ids;
  }, [sharedResyncIds, resyncingId]);

  // Auto-resync untitled incidents (once per browser session, one at a time)
  useEffect(() => {
    if (!hasFetched || incidents.length === 0) {
      return;
    }
    
    const SESSION_KEY = 'shuffle_auto_resync_done';
    const alreadyResynced: Set<string> = new Set(
      JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
    );

    // Find incidents without a title that have a source and haven't been resynced this session
    const needsSync = (t?: string, id?: string) => !t || t === 'Untitled Incident' || t === 'Requires sync' || t === 'undefined' || (id && t === id);
    const untitled = incidents.filter(inc => {
      const sync = needsSync(inc.title, inc.id);
      if (!sync) return false;
      if (!inc.source) return false;
      if (alreadyResynced.has(inc.id)) return false;
      if (autoResyncQueueRef.current.has(inc.id)) return false;
      return true;
    });

    if (untitled.length === 0 || resyncingId) return;

    // Pick the first one
    const target = untitled[0];
    autoResyncQueueRef.current.add(target.id);
    setResyncingId(target.id);
    resyncState.add(target.id);
    setResyncingSource(target.source || '');

    const doResync = async () => {
      try {
        const response = await fetch(getApiUrl('/api/v1/apps/categories/run'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            action: 'get_ticket',
            category: 'cases',
            fields: [{ key: 'id', value: target.id }],
            app_name: target.source,
          }),
        });

        if (!response.ok) {
          console.warn(`[AutoResync] Failed for ${target.id}`);
        }

        // Poll the specific incident every 5s for up to 60s
        const POLL_INTERVAL = 5000;
        const MAX_POLLS = 12;
        let pollCount = 0;

        const poll = async () => {
          pollCount++;
          try {
            const item = await getDatastoreItem(target.id, DATASTORE_CATEGORIES.INCIDENTS);
            if (item.success && item.item) {
              // Check if it now has real content
              let parsed: any = null;
              try {
                parsed = typeof item.item.value === 'string' ? JSON.parse(item.item.value) : item.item.value;
              } catch { /* ignore */ }

              const title = parsed?.finding_info?.title || parsed?.title || '';
              if (title && title !== 'Untitled Incident' && title !== 'Requires sync' && title !== target.id) {
                console.log(`[AutoResync] Got content for ${target.id} after ${pollCount} polls`);
                alreadyResynced.add(target.id);
                sessionStorage.setItem(SESSION_KEY, JSON.stringify([...alreadyResynced]));
                await fetchItems();
                setResyncingId(null);
                resyncState.remove(target.id);
                setResyncingSource('');
                return;
              }
            }
          } catch { /* ignore poll errors */ }

          if (pollCount < MAX_POLLS) {
            setTimeout(poll, POLL_INTERVAL);
          } else {
            // Give up after max polls
            console.warn(`[AutoResync] Timed out for ${target.id}`);
            alreadyResynced.add(target.id);
            sessionStorage.setItem(SESSION_KEY, JSON.stringify([...alreadyResynced]));
            await fetchItems();
            setResyncingId(null);
            resyncState.remove(target.id);
            setResyncingSource('');
          }
        };

        // Start first poll after 5s
        setTimeout(poll, POLL_INTERVAL);
      } catch (err) {
        console.warn('[AutoResync] Error:', err);
        alreadyResynced.add(target.id);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify([...alreadyResynced]));
        setResyncingId(null);
        resyncState.remove(target.id);
        setResyncingSource('');
      }
    };

    doResync();
  }, [hasFetched, incidents, resyncingId, fetchItems]);

  // Active incident list based on irrelevant toggle.
  // Demo incidents are surfaced as if they were real ones — no demo-only
  // filtering — so the page state stays consistent whether or not Demo Mode
  // is active. The user can still distinguish them by the `demo-` id prefix
  // and remove them via "Clean up demo data" on the dashboard.
  const activeIncidents = useMemo(() => {
    return showIrrelevant ? incidents : relevantIncidents;
  }, [showIrrelevant, incidents, relevantIncidents]);

  // Number of child tenants that actually contribute incidents — gates the
  // "By Tenant" chart so it never renders for single-tenant setups.
  const childTenantsWithIncidents = useMemo(() => {
    if (subOrgs.length === 0) return 0;
    const childIds = new Set(subOrgs.filter(o => o.id !== currentOrgId).map(o => o.id));
    if (childIds.size === 0) return 0;
    const seen = new Set<string>();
    for (const inc of activeIncidents) {
      const orgId = (inc as any).orgId;
      if (orgId && childIds.has(orgId)) seen.add(orgId);
    }
    return seen.size;
  }, [subOrgs, currentOrgId, activeIncidents]);

  // Filter incidents
  const filteredByAssignee = useMemo(() => {
    if (filters.assignee === null || filters.assignee === 'all') {
      return activeIncidents;
    }
    if (filters.assignee === 'unassigned') {
      return activeIncidents.filter(i => !i.assignee);
    }
    // For specific user filter (e.g., "Yours"), also include incidents where a task is assigned to them
    return activeIncidents.filter(i => {
      // Check incident assignee
      if (i.assignee === filters.assignee) return true;
      // Check if any task is assigned to this user
      if (i.tasks && i.tasks.length > 0) {
        return i.tasks.some(task => 
          task.assignee?.toLowerCase() === filters.assignee?.toLowerCase()
        );
      }
      return false;
    });
  }, [activeIncidents, filters.assignee]);

  const filteredIncidents = useMemo(() => {
    let result = filteredByAssignee;

    if (filters.severity) {
      const neg = negatedFilters.has('severity');
      if (Array.isArray(filters.severity)) {
        const sevs = filters.severity;
        result = result.filter(i => {
          const match = sevs.includes(i.severity);
          return neg ? !match : match;
        });
      } else {
        result = result.filter(i => neg ? i.severity !== filters.severity : i.severity === filters.severity);
      }
    }
    if (filters.status) {
      const neg = negatedFilters.has('status');
      const knownStatuses = Object.keys(statusConfig);
      if (Array.isArray(filters.status)) {
        result = result.filter(i => {
          const isKnown = knownStatuses.includes(i.status);
          const matches = filters.status!.includes(i.status) || !isKnown;
          return neg ? !matches : matches;
        });
      } else {
        result = result.filter(i => {
          const isKnown = knownStatuses.includes(i.status);
          const matches = i.status === filters.status || !isKnown;
          return neg ? !matches : matches;
        });
      }
    }
    if (filters.tlp) {
      const neg = negatedFilters.has('tlp');
      result = result.filter(i => neg ? i.tlp !== filters.tlp : i.tlp === filters.tlp);
    }
    if (filters.source) {
      const neg = negatedFilters.has('source');
      result = result.filter(i => {
        const match = (i.source || '').toLowerCase() === filters.source!.toLowerCase();
        return neg ? !match : match;
      });
    }
    if (filters.tag) {
      const neg = negatedFilters.has('tag');
      result = result.filter(i => {
        const match = i.labels?.some(l => l.toLowerCase() === filters.tag!.toLowerCase());
        return neg ? !match : match;
      });
    }
    const orgFilter = Array.isArray(filters.org) ? filters.org : filters.org ? [filters.org] : [];
    if (orgFilter.length > 0) {
      result = result.filter(i => {
        if (orgFilter.includes(i.orgId || '')) return true;
        if (Array.isArray(i.sharedOrgs)) {
          return i.sharedOrgs.some((so: any) => orgFilter.includes(so.id || so.orgId || ''));
        }
        return false;
      });
    }

    // Merge any extra incidents loaded via remote correlations
    if (extraCorrelatedIncidents.length > 0) {
      const existingIds = new Set(result.map(i => toRawIncidentKey(i.id)));
      for (const extra of extraCorrelatedIncidents) {
        if (!existingIds.has(toRawIncidentKey(extra.id))) {
          result = [...result, extra];
          existingIds.add(toRawIncidentKey(extra.id));
        }
      }
    }

    if (deferredSearchQuery.trim()) {
      const tokens = deferredSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      result = result.filter(i => {
        // Fast path: multi-token check across the memoized search blob
        if (matchIncidentSearchText(i, tokens)) return true;

        // Correlation match: check if the platform correlation API identified this incident
        if (correlatedIncidentIds.size > 0) {
          const rawId = toRawIncidentKey(i.id);
          if (correlatedIncidentIds.has(i.id) || correlatedIncidentIds.has(rawId)) {
            return true;
          }
        }

        return false;
      });
    }

    // Date range filter
    if (dateFrom) {
      const fromMs = dateFrom.getTime();
      result = result.filter(i => (i.createdTs || 0) >= fromMs);
    }
    if (dateTo) {
      // Include the entire "to" day
      const toMs = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999).getTime();
      result = result.filter(i => (i.createdTs || 0) <= toMs);
    }

    return result;
  }, [filteredByAssignee, filters, negatedFilters, deferredSearchQuery, correlatedIncidentIds, extraCorrelatedIncidents, dateFrom, dateTo]);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, negatedFilters, deferredSearchQuery, showIrrelevant, dateFrom, dateTo]);

  // Sort incidents
  const sortedIncidents = useMemo(() => {
    const sorted = [...filteredIncidents];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'severity':
          comparison = (severityOrder[a.severity] || 0) - (severityOrder[b.severity] || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'assignee':
          comparison = (a.assignee || '').localeCompare(b.assignee || '');
          break;
        case 'created':
          comparison = a.createdTs - b.createdTs;
          break;
        case 'edited':
          comparison = (a.editedTs || a.createdTs) - (b.editedTs || b.createdTs);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // In demo mode, the focus phishing incident can occasionally be seeded
    // more than once if a previous "Force generate" failed mid-flight or a
    // background re-seed races the cleanup. Visually collapse those into a
    // single row so the user always sees exactly ONE "Phishing email
    // reported by Diego Ruiz" — the newest copy wins.
    if (demoActive) {
      let kept = false;
      const deduped: typeof sorted = [];
      // Walk newest-first regardless of current sort, then re-emit in
      // original order so we don't disturb the user's chosen sort.
      const newestFirst = [...sorted].sort((a, b) => (b.createdTs || 0) - (a.createdTs || 0));
      const dropIds = new Set<string>();
      for (const inc of newestFirst) {
        if (/Phishing email reported by Diego Ruiz/i.test(inc.title || '')) {
          if (kept) dropIds.add(inc.id);
          else kept = true;
        }
      }
      for (const inc of sorted) {
        if (!dropIds.has(inc.id)) deduped.push(inc);
      }
      return deduped;
    }

    if (correlatedIncidentIds.size > 0) {
      return sorted.map(i => {
        if (correlatedIncidentIds.has(i.id) || correlatedIncidentIds.has(toRawIncidentKey(i.id))) {
          return {
            ...i,
            correlationCount: Math.max(i.correlationCount || 0, 1),
          };
        }
        return i;
      });
    }

    return sorted;
  }, [filteredIncidents, sortBy, sortDirection, demoActive, correlatedIncidentIds]);

  // Determine if all selected incidents are already resolved
  const selectedIncidentsList = useMemo(() => incidents.filter(i => selectedIds.has(i.id)), [incidents, selectedIds]);

  // Continue existing merge threads silently: if an incident already has
  // merges under it and carries a thread_id, fold any newly-arrived thread
  // siblings into it. Only touches existing threads — never starts new ones.
  const { busy: threadContinuationBusy } = useBackgroundThreadContinuation(incidents, () => { void fetchItems(); });

  const allSelectedResolved = selectedIds.size > 0 && selectedIncidentsList.every(i => i.status.toLowerCase() === 'resolved');
  const someSelectedResolved = selectedIds.size > 0 && selectedIncidentsList.some(i => i.status.toLowerCase() === 'resolved');

  const handleBulkReopen = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBulkResolving(true);

    const updates = selectedIncidentsList
      .filter(i => i.status.toLowerCase() === 'resolved')
      .map(async (incident) => {
        const reopenActivity: ActivityItem = {
          id: `status-${Date.now()}-${incident.id}`,
          type: 'status',
          user: currentUsername,
          timestamp: Date.now(),
          content: 'Reopened incident',
          details: {},
          attachments: [],
        };

        const rawOCSF = incident.rawOCSF || {} as OCSFIncidentFinding;
        const existingActivity = (rawOCSF as any).activity || [];

        const updated = {
          ...rawOCSF,
          class_uid: 2005 as const,
          class_name: 'Incident Finding' as const,
          finding_uid: rawOCSF.finding_uid || incident.id,
          title: rawOCSF.title || incident.title,
          status_id: 1,
          status: 'New',
          status_detail: '',
          activity: [...existingActivity, reopenActivity],
        };

        const rawKey = toRawIncidentKey(incident.id);
        const primaryResult = await writeIncidentSafe(rawKey, updated);

        if (incident.sharedOrgs && incident.sharedOrgs.length > 0) {
          Promise.allSettled(
            incident.sharedOrgs.map(org =>
              writeIncidentSafe(rawKey, updated, org.orgId)
            )
          );
        }

        return primaryResult;
      });

    const results = await Promise.all(updates);
    const successCount = results.filter(r => r.success).length;

    setIsBulkResolving(false);

    if (successCount > 0) {
      toast.success(t(`Reopened ${successCount} incident${successCount !== 1 ? 's' : ''}`));
    } else {
      toast.warning(t('Failed to reopen incidents'));
    }

    setSelectedIds(new Set());
    await fetchItems();
  }, [selectedIds, selectedIncidentsList, currentUsername, fetchItems]);

  const getIncidentUrl = (incident: DisplayIncident) => {
    const isInvalidData = (!incident.title || incident.title === 'Untitled Incident' || incident.title === 'Requires sync' || incident.title === incident.id) && !incident.source;
    const params = new URLSearchParams();
    if (isInvalidData) params.set('tab', 'raw');
    if (incident.sharedOrgs && incident.sharedOrgs.length > 1) {
      params.set('shared_orgs', incident.sharedOrgs.map(o => o.orgId).join(','));
    }
    const rawKey = toRawIncidentKey(incident.id);
    const routeId = incident.orgId && currentOrgId && incident.orgId !== currentOrgId
      ? `${incident.orgId}::${rawKey}`
      : rawKey;
    const paramStr = params.toString();
    return `${entityBasePath}/${routeId}${paramStr ? '?' + paramStr : ''}`;
  };

  const handleCreateIncident = async (ocsf: OCSFIncidentFinding) => {
    const key = ocsf.finding_uid;
    await addItem(key, ocsf);
    trackPredefinedEvent(GA_EVENTS.INCIDENT_CREATE);
    // Auto-open the freshly created incident so the user can immediately
    // see it materialize (and watch background enrichments stream in).
    // NOTE: do NOT await fetchItems() here — it paginates through all
    // incidents (10+ pages) and was adding several seconds of delay before
    // the detail page opened. Fire-and-forget so the list refreshes in the
    // background while we navigate.
    navigate(`/incidents/${key}`);
    fetchItems();
  };

  const resetToDefaults = () => {
    // Build the same org list that the auto-select effect uses on load
    let defaultOrg: string[] | null = null;
    if (isParentOrg) {
      const allIds = [currentOrgId || '', ...subOrgs.filter(o => o.id !== currentOrgId).map(o => o.id)];
      defaultOrg = allIds;
    } else if (isChildOrg && currentOrgId) {
      defaultOrg = [currentOrgId];
    }
    setFilters({ severity: null, status: DEFAULT_STATUS_FILTER, tlp: null, assignee: null, source: null, tag: null, org: defaultOrg });
    setNegatedFilters(new Set());
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearchQuery('');
    setCorrelatedIncidentIds(new Set());
    setExtraCorrelatedIncidents([]);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    // Collect all cross-org delete promises for shared incidents
    const crossOrgDeletes: Promise<any>[] = [];
    const selectedIncidents = incidents.filter(i => selectedIds.has(i.id));
    for (const inc of selectedIncidents) {
      if (inc.sharedOrgs && inc.sharedOrgs.length > 0) {
        const rawKey = toRawIncidentKey(inc.id);
        for (const org of inc.sharedOrgs) {
          crossOrgDeletes.push(deleteDatastoreItem(rawKey, DATASTORE_CATEGORIES.INCIDENTS, org.orgId));
        }
      }
    }

    const result = await deleteDatastoreItems(
      Array.from(selectedIds),
      DATASTORE_CATEGORIES.INCIDENTS
    );
    
    // Fire cross-org deletes in parallel (best effort)
    if (crossOrgDeletes.length > 0) {
      Promise.allSettled(crossOrgDeletes);
    }

    if (result.success) {
      toast.success(t(`Deleted ${result.deleted} incident${result.deleted !== 1 ? 's' : ''}`));
      setSelectedIds(new Set());
      await fetchItems();
    } else {
      toast.error(`Deleted ${result.deleted}, but ${result.failed.length} failed`);
      setSelectedIds(new Set(result.failed));
      await fetchItems();
    }
  }, [selectedIds, incidents, fetchItems]);

  const handleBulkResolve = useCallback(async (resolutionData: ResolutionData) => {
    if (selectedIds.size === 0) return;
    
    setIsBulkResolving(true);
    trackPredefinedEvent(GA_EVENTS.INCIDENT_BULK_RESOLVE, resolutionData.reason, selectedIds.size);
    
    const reasonLabel = RESOLUTION_REASONS.find(r => r.value === resolutionData.reason)?.label || resolutionData.reason;
    
    // Update each selected incident to resolved status with proper resolution data
    const updates = incidents
      .filter(i => selectedIds.has(i.id))
      .map(async (incident) => {
        const resolveActivity: ActivityItem = {
          id: `status-${Date.now()}-${incident.id}`,
          type: 'status',
          user: currentUsername,
          timestamp: Date.now(),
          content: `Resolved: ${reasonLabel}${resolutionData.notes ? ` - ${resolutionData.notes}` : ''}`,
          details: {},
          attachments: [],
        };
        
        // Get existing data or initialize empty structure
        const rawOCSF = incident.rawOCSF || {} as OCSFIncidentFinding;
        const existingMetadata = rawOCSF.metadata || {};
        const existingExtensions = existingMetadata.extensions || {};
        const existingCustomAttrs = (existingExtensions.custom_attributes || {}) as Record<string, unknown>;
        // Get existing activity from top level first, then metadata fallback
        const existingActivity = (rawOCSF as any).activity || 
          ((existingCustomAttrs.activity as ActivityItem[] | undefined) || []);
        
        const updated = {
          ...rawOCSF,
          // Ensure required OCSF fields exist
          class_uid: 2005 as const,
          class_name: 'Incident Finding' as const,
          finding_uid: rawOCSF.finding_uid || incident.id,
          title: rawOCSF.title || incident.title,
          // Set resolved status
          status_id: 3,
          status: 'Resolved',
          status_detail: `${resolutionData.reason}${resolutionData.notes ? `: ${resolutionData.notes}` : ''}`,
          // Store activity at top level (primary location)
          activity: [...existingActivity, resolveActivity],
          // Ensure metadata structure exists
          metadata: {
            ...existingMetadata,
            extensions: {
              ...existingExtensions,
              custom_attributes: {
                ...existingCustomAttrs,
                // Remove activity from metadata (migrated to top level)
              },
            },
          },
        };
        
        // Remove the old activity key from custom_attributes if it exists
        if ((updated.metadata.extensions.custom_attributes as Record<string, unknown>).activity) {
          delete (updated.metadata.extensions.custom_attributes as Record<string, unknown>).activity;
        }
        
        const rawKey = toRawIncidentKey(incident.id);
        const primaryResult = await writeIncidentSafe(rawKey, updated);
        
        // Sync to shared orgs (fire-and-forget)
        if (incident.sharedOrgs && incident.sharedOrgs.length > 0) {
          Promise.allSettled(
            incident.sharedOrgs.map(org =>
              writeIncidentSafe(rawKey, updated, org.orgId)
            )
          );
        }
        
        return primaryResult;
      });
    
    const results = await Promise.all(updates);
    const successCount = results.filter(r => r.success).length;
    
    setIsBulkResolving(false);
    setBulkResolveDialogOpen(false);
    
    if (successCount === selectedIds.size) {
      toast.success(t(`Resolved ${successCount} incident${successCount !== 1 ? 's' : ''}`));
    } else {
      toast.warning(t(`Resolved ${successCount} of ${selectedIds.size} incidents`));
    }
    
    setSelectedIds(new Set());
    // Refetch to get updated data
    await fetchItems();
  }, [selectedIds, incidents, currentUsername, fetchItems]);

  const isDefaultFilter = useMemo(() => {
    if (filters.severity || filters.tlp || filters.source || filters.tag) return false;
    if (negatedFilters.size > 0 || dateFrom || dateTo) return false;
    if (filters.assignee !== null || searchQuery.trim()) return false;
    const statusFilter = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : [];
    if (statusFilter.length !== DEFAULT_STATUS_FILTER.length) return false;
    for (const status of DEFAULT_STATUS_FILTER) {
      if (!statusFilter.includes(status)) return false;
    }

    // Org filter check
    if (isParentOrg) {
      // Default = all orgs selected
      const allIds = new Set([
        currentOrgId || '',
        ...subOrgs.filter(o => o.id !== currentOrgId).map(o => o.id),
      ]);
      
      const currentOrgs = new Set(filters.org || []);
      if (currentOrgs.size !== allIds.size) return false;
      for (const id of allIds) { if (!currentOrgs.has(id)) return false; }
    } else if (isChildOrg) {
      if (!filters.org || filters.org.length !== 1 || filters.org[0] !== currentOrgId) return false;
    } else {
      if (filters.org && filters.org.length > 0) return false;
    }

    return true;
  }, [filters, negatedFilters, dateFrom, dateTo, searchQuery, isParentOrg, isChildOrg, currentOrgId, subOrgs, parentOrg]);

  // Collect unique tags across all active incidents for the filter UI
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    activeIncidents.forEach(inc => {
      inc.labels?.forEach(l => { if (l.trim()) tagSet.add(l); });
    });
    return Array.from(tagSet).sort();
  }, [activeIncidents]);

  // Show empty state when no relevant incidents exist (after loading completes)
  // But NOT when there was a load error — show error state instead
  // Also suppress during refreshes to prevent flash between skeleton and empty state
  // If the primary org fetch failed but sub-org data loaded, skip the error screen
  const hasAnyIncidents = relevantIncidents.length > 0 || irrelevantCount > 0;
  const primaryFetchFailed = !!error;
  const subOrgDataAvailable = subOrgItems.size > 0 && Array.from(subOrgItems.values()).some(v => v.items.length > 0);

  // Show a stable loader on initial fetch so we don't flicker between
  // the list view (with stale/demo items) and the "No incidents yet" empty state.
  if (!hasFetched && !demoActive && !error) {
    return (
      <Box aria-label={`Loading ${entityPlural.toLowerCase()}`}>
        {/* Header skeleton — mirrors the real page header (title + actions row) */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Skeleton variant="text" width={180} height={36} sx={{ bgcolor: 'hsl(var(--muted) / 0.3)' }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant="rounded" width={36} height={36} sx={{ bgcolor: 'hsl(var(--muted) / 0.25)' }} />
            <Skeleton variant="rounded" width={36} height={36} sx={{ bgcolor: 'hsl(var(--muted) / 0.25)' }} />
            <Skeleton variant="rounded" width={140} height={36} sx={{ bgcolor: 'hsl(var(--muted) / 0.25)' }} />
          </Box>
        </Box>

        {/* Stats cards skeleton */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={78}
              sx={{ bgcolor: 'hsl(var(--muted) / 0.2)', borderRadius: 2 }}
            />
          ))}
        </Box>

        {/* Filter bar skeleton */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Skeleton variant="rounded" width={280} height={40} sx={{ bgcolor: 'hsl(var(--muted) / 0.25)' }} />
          <Skeleton variant="rounded" width={120} height={40} sx={{ bgcolor: 'hsl(var(--muted) / 0.2)' }} />
          <Skeleton variant="rounded" width={120} height={40} sx={{ bgcolor: 'hsl(var(--muted) / 0.2)' }} />
        </Box>

        {/* Card list skeleton — same 6-row layout as the loaded list */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                borderRadius: 2,
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                animation: 'incidentsSkelPulse 1.5s ease-in-out infinite',
                animationDelay: `${index * 0.08}s`,
                '@keyframes incidentsSkelPulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.6 },
                },
              }}
            >
              <Skeleton variant="rounded" width={48} height={48} sx={{ bgcolor: 'hsl(var(--muted) / 0.3)', flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton variant="text" width="60%" height={24} sx={{ bgcolor: 'hsl(var(--muted) / 0.3)', mb: 0.5 }} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Skeleton variant="rounded" width={70} height={22} sx={{ bgcolor: 'hsl(var(--muted) / 0.2)', borderRadius: 3 }} />
                  <Skeleton variant="rounded" width={85} height={22} sx={{ bgcolor: 'hsl(var(--muted) / 0.2)', borderRadius: 3 }} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                <Skeleton variant="text" width={100} height={16} sx={{ bgcolor: 'hsl(var(--muted) / 0.2)' }} />
                <Skeleton variant="text" width={80} height={14} sx={{ bgcolor: 'hsl(var(--muted) / 0.15)' }} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  const renderAutomationPipeline = () => {
    if (!showAutomation && !demoActive) return null;
    return (
      <Box
        className="automation-pipeline"
        sx={{
          // In demo mode the Ingest area is the focal point of the tour,
          // so it must remain visible regardless of viewport width.
          display: demoActive ? 'flex' : { xs: 'none', md: 'flex' },
          alignItems: 'center',
          gap: 0,
          position: 'relative',
          // Default state
          '& .automation-section-ingest, & .automation-section-forward': {
            transition: 'border-color 0.3s ease, background-color 0.3s ease',
            overflow: 'visible',
            clipPath: 'inset(-24px -20px -20px -20px)',
            position: 'relative',
          },
          '& .automation-section-title': {
            transition: 'opacity 0.25s ease',
          },
          '& .automation-arrow': {
            transition: 'max-width 0.4s cubic-bezier(0.4,0,0.2,1) 0.15s, opacity 0.3s ease 0.15s',
            overflow: 'hidden',
          },
          // Hovering either section: boost z-index and make bg opaque, hide other title
          '&:has(.automation-section-ingest:hover), &:has(.automation-section-ingest.is-hovered)': {
            '& .automation-section-ingest': {
              zIndex: 10,
              bgcolor: 'hsl(var(--muted))',
              clipPath: 'inset(-20px 0px -20px -500px)',
            },
            '& .automation-section-forward .automation-section-title': {
              opacity: 0,
              transition: 'opacity 0.2s ease',
            },
          },
          '&:has(.automation-section-forward:hover), &:has(.automation-section-forward.is-hovered)': {
            '& .automation-section-forward': {
              zIndex: 10,
              bgcolor: 'hsl(var(--muted))',
              clipPath: 'inset(-20px 0px -20px -500px)',
            },
            '& .automation-section-ingest .automation-section-title': {
              opacity: 0,
              transition: 'opacity 0.2s ease',
            },
          },
        }}
      >
        {/* Ingestion Sources - grouped in a subtle container with add button */}
        {ingestionLoading ? (
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: 'hsl(var(--muted) / 0.4)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              px: 0.75,
              py: 0.5,
              height: 38,
            }}
          >
            <Typography
              className="automation-section-title"
              sx={{
                position: 'absolute',
                top: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '0.55rem',
                fontWeight: 600,
                color: 'hsl(var(--muted-foreground))',
                bgcolor: 'hsl(var(--muted))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 10,
                px: 1,
                py: 0.15,
                lineHeight: 1.3,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              Ingest
            </Typography>
            <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.6)', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.6)', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '0.2s' }} />
            <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.6)', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '0.4s' }} />
          </Box>
        ) : (
          <Box className={`automation-section-ingest${ingestHovered ? ' is-hovered' : ''}`}
            onMouseEnter={handleIngestEnter}
            onMouseLeave={handleIngestLeave}
            sx={{ 
            position: 'relative',
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5,
            bgcolor: 'hsl(var(--muted) / 0.4)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 1.5,
            px: 0.75,
            py: 0.5,
            '& .automation-overflow': {
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'row-reverse',
              gap: 0.5,
              position: 'absolute',
              right: 'calc(100% - 6px)',
              top: -1,
              bottom: -1,
              opacity: 0,
              pl: 0.75,
              pr: 1.5,
              bgcolor: 'hsl(var(--muted))',
              borderRadius: '6px 0 0 6px',
              border: '1px solid hsl(var(--border))',
              borderRight: 'none',
              transition: 'opacity 0.3s ease',
              pointerEvents: 'none',
            },
            '& .automation-overflow-count': {
              maxWidth: 36,
              opacity: 1,
              overflow: 'hidden',
              transition: 'max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
            },
            '&:hover .automation-overflow, &.is-hovered .automation-overflow': {
              opacity: 1,
              pointerEvents: 'auto',
              transitionDelay: '0.25s',
            },
            '&:hover, &.is-hovered': {
              borderRadius: '0 6px 6px 0',
            },
            '&:hover .automation-overflow-count, &.is-hovered .automation-overflow-count': {
              maxWidth: 0,
              opacity: 0,
            },
          }}>
            <Typography className="automation-section-title" sx={{
              position: 'absolute',
              top: -10,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '0.55rem',
              fontWeight: 600,
              color: 'hsl(var(--muted-foreground))',
              bgcolor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 10,
              px: 1,
              py: 0.15,
              lineHeight: 1.3,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              {demoActive ? (
                <span>Ingest</span>
              ) : (
                <Tooltip title={t('Apps with authentication appear here. Verified apps show in green, unverified in yellow. Toggle them to control which tools automatically pull in incidents.')} placement="top" arrow>
                  <span style={{ cursor: 'help' }}>Ingest</span>
                </Tooltip>
              )}
            </Typography>
            {/* Webhook counts as 1 of the 5 visible slots */}
            <WebhookIngestionButton webhook={webhookIngestion} onToggled={fetchIngestionApps} />
            {/* Demo-injected apps (e.g. Outlook after fake auth) only render
                while demo mode is active, so they vanish after cleanup. */}
            {demoActive && demoInjectedApps.map(app => (
              <IngestionSourceButton key={`demo-${app.name}`} app={app} onToggle={() => { /* no-op for demo apps */ }} incidentCount={0} />
            ))}
            {!isDemoTourActive && ingestionApps.slice(0, 3).map(app => (
              <IngestionSourceButton key={app.name} app={app} onToggle={handleToggleApp} incidentCount={incidentCountsBySource.get(normalizeAppName(app.name)) || 0} />
            ))}
            {!isDemoTourActive && ingestionApps.length > 3 && (
              <>
                <Typography className="automation-overflow-count" sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontWeight: 600, px: 0.25 }}>
                  +{ingestionApps.length - 3}
                </Typography>
                <Box className="automation-overflow" sx={{ px: 0.75, py: 0.5 }}>
                  {ingestionApps.slice(3).map(app => (
                    <IngestionSourceButton key={app.name} app={app} onToggle={handleToggleApp} incidentCount={incidentCountsBySource.get(normalizeAppName(app.name)) || 0} />
                  ))}
                </Box>
              </>
            )}
            <Tooltip title="Add ingestion source">
              <IconButton
                data-tour="add-ingestion-source-button"
                onClick={() => setAppSearchOpen(true)}
                size="small"
                sx={{
                  width: 28,
                  height: 28,
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px dashed hsl(var(--border))',
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: 'hsl(var(--muted))',
                    borderStyle: 'solid',
                    color: 'hsl(var(--primary))',
                  },
                }}
              >
                <AddIcon size={16} />
              </IconButton>
            </Tooltip>
            {ingestWorkflowId && (
              <Tooltip title={isUpdatingApps ? "Updating sources…" : ingestScheduleStopped ? "Schedule is stopped — click to run now" : "Sync now"}>
                <span>
                <IconButton
                  data-tour="sync-ingestion-button"
                  onClick={() => { triggerSync(); }}
                  disabled={isSyncing || isUpdatingApps}
                  size="small"
                  sx={{
                    width: 28,
                    height: 28,
                    color: ingestScheduleStopped ? 'hsl(var(--severity-medium))' : 'hsl(var(--muted-foreground))',
                    border: '1px solid',
                    borderColor: ingestScheduleStopped ? 'hsl(var(--severity-medium))' : 'hsl(var(--border))',
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'hsl(var(--muted))',
                      color: ingestScheduleStopped ? 'hsl(var(--severity-medium))' : 'hsl(var(--primary))',
                    },
                  }}
                >
                  {isSyncing || isUpdatingApps ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <PlayArrowIcon size={16} />
                  )}
                </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
    );
  };

  // During the demo tour, always render the full incidents UI (with seeded
  // demo data) instead of the empty state, so users see the real layout.
  if (hasFetched && !isLoading && !isRefreshing && !hasAnyIncidents && !(primaryFetchFailed && subOrgDataAvailable) && !demoActive) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <RuntimeQueueProblemBar />
        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
           <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {entityPlural}
          </Typography>
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {renderAutomationPipeline()}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {showAutomation && (
              <Tooltip title="Automation for Incidents">
                <IconButton
                  data-tour="incidents-automation-button"
                  onClick={() => {
                    trackPredefinedEvent(GA_EVENTS.INCIDENT_AUTOMATION_CHANGE, 'open_dialog');
                    setAutomationsDialogOpen(true);
                  }}

                  sx={{
                    width: 36, height: 36,
                    color: categoryAutomations?.some(a => a.enabled) ? '#4ade80' : 'text.secondary',
                    border: '1px solid',
                    borderColor: categoryAutomations?.some(a => a.enabled) ? 'success.main' : 'divider',
                    borderRadius: 1,
                    '&:hover': {
                      borderColor: categoryAutomations?.some(a => a.enabled) ? 'success.main' : 'text.secondary',
                    },
                  }}
                >
                  <RocketLaunchIcon size={20} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Refresh">
              <IconButton 
                onClick={() => { sessionStorage.removeItem('shuffle_auto_resync_done'); autoResyncQueueRef.current.clear(); fetchItems(); fetchSubOrgIncidents(); }} 
                disabled={isLoading}
                sx={{ 
                  width: 36, height: 36, color: 'text.secondary',
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  '&:hover': { borderColor: 'text.secondary' },
                }}
              >
                <RefreshIcon size={20} className={isRefreshing ? 'animate-spin' : ''} />
              </IconButton>
            </Tooltip>
            <Tooltip title={`Create ${entitySingular}`}>
              <IconButton 
                onClick={() => setCreateDialogOpen(true)}
                sx={{ 
                  width: 36, height: 36, color: 'text.secondary',
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  '&:hover': { borderColor: 'text.secondary' },
                }}
              >
                <AddIcon size={20} />
              </IconButton>
            </Tooltip>
          </Box>
          </Box>
        </Box>

        {error && datastoreItems.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 12,
              px: 4,
              textAlign: 'center',
              maxWidth: 520,
              mx: 'auto',
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '20px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 4,
              }}
            >
              <RefreshIcon size={36} style={{ color: '#ef4444', opacity: 0.8 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 1.5 }}>
              Failed to load incidents
            </Typography>
            <Typography variant="body1" sx={{ color: 'hsl(var(--muted-foreground))', mb: isSupport ? 3 : 5, lineHeight: 1.7, maxWidth: 420 }}>
              There was a problem connecting to the server. Check your network connection and try again.
            </Typography>
            {isSupport && error && (
              <Alert severity="info" sx={{ width: '100%', mb: 4, borderRadius: 2, textAlign: 'left', alignItems: 'flex-start' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'hsl(var(--foreground))', mb: 1.5 }}>
                  Support debug output
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, width: '100%' }}>
                  {supportIncidentDebugRows.map(([label, value]) => (
                    <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 1.5, alignItems: 'start' }}>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', wordBreak: 'break-word' }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                {lastDiagnostics?.bodyPreview && (
                  <Box sx={{ mt: 2, width: '100%' }}>
                    <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Response preview
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        mt: 0.75,
                        mb: 0,
                        p: 1.5,
                        borderRadius: 1.5,
                        bgcolor: 'hsl(var(--muted))',
                        border: '1px solid hsl(var(--border))',
                        color: 'hsl(var(--foreground))',
                        fontSize: '0.75rem',
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        overflowX: 'auto',
                      }}
                    >
                      {lastDiagnostics.bodyPreview}
                    </Box>
                  </Box>
                )}
              </Alert>
            )}
            <Button
              variant="contained"
              size="large"
              startIcon={<RefreshIcon />}
              onClick={() => fetchItems()}
              sx={{
                px: 4, py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: '0.95rem',
                backgroundColor: 'hsl(var(--primary))',
                '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)' },
              }}
            >
              Retry
            </Button>
          </Box>
        ) : (
          <IncidentsEmptyState 
            ingestionApps={ingestionApps} 
            onIngestionToggled={fetchIngestionApps}
            onToggleApp={handleToggleApp}
            webhook={webhookIngestion}
            isSyncing={isSyncing}
            isUpdatingApps={isUpdatingApps}
            isLoading={ingestionLoading}
            onSyncNow={ingestWorkflowId ? () => triggerSync() : undefined}
            onCreateIncident={() => setCreateDialogOpen(true)}
            // The "Add ingestion source" button opens the in-page
            // AppSearchDrawer — same behavior as the populated-list "+"
            // button — instead of navigating away to /onboarding/sources.
            onAddSource={() => setAppSearchOpen(true)}
          />
        )}

        <CreateIncidentDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSubmit={handleCreateIncident}
        />

        <CategoryAutomationsDialog
          open={automationsDialogOpen}
          onClose={() => setAutomationsDialogOpen(false)}
          category={DATASTORE_CATEGORIES.INCIDENTS}
          automations={categoryAutomations}
          onAutomationsChange={setCategoryAutomations}
          initialSettings={categoryConfig?.settings}
          onSaved={() => {
            // Re-fetch ingestion apps & workflows, then auto-sync
            fetchIngestionApps();
            triggerSync();
          }}
        />
      </motion.div>
    );
  }

  // Tenant multi-select control — rendered inline on desktop and inside a
  // dedicated dialog from the mobile overflow menu.
  const tenantSelector = (
                <Autocomplete
                  multiple
                  disableCloseOnSelect
                  size="small"
                  options={(() => {
                    const currentOrgImage = userInfo?.active_org?.image;
                    const realOrgs: { id: string; name: string; image?: string }[] = [
                      { id: currentOrgId || '', name: currentOrgName, image: currentOrgImage },
                      ...subOrgs.filter(org => org.id !== currentOrgId).map(o => ({ id: o.id, name: o.name, image: o.image })),
                    ];
                    // Don't add parent org — we only fetch downward (children)
                    return [
                      { id: '__all__', name: 'All tenants' },
                      { id: '__none__', name: 'Current Tenant' },
                      ...realOrgs,
                    ];
                  })()}
                  getOptionLabel={(option) => option.name}
                  value={
                    (Array.isArray(filters.org) ? filters.org : filters.org ? [filters.org] : []).map(id => {
                      if (id === currentOrgId) return { id: currentOrgId || '', name: currentOrgName };
                      if (parentOrg && id === parentOrg.id) return { id: parentOrg.id, name: parentOrg.name };
                      const found = subOrgs.find(o => o.id === id);
                      return found || { id, name: id };
                    })
                  }
                  onChange={(_, newValue) => {
                    // Check if special options were selected
                    const hasAll = newValue.some(v => v.id === '__all__');
                    const hasNone = newValue.some(v => v.id === '__none__');
                    if (hasNone) {
                      setFilters(prev => ({ ...prev, org: [currentOrgId || ''] }));
                      return;
                    }
                    if (hasAll) {
                      // Select all real orgs
                      const allIds = [
                        currentOrgId || '',
                        ...subOrgs.filter(o => o.id !== currentOrgId).map(o => o.id),
                      ];
                      setFilters(prev => ({ ...prev, org: allIds }));
                      return;
                    }
                    setFilters(prev => ({
                      ...prev,
                      org: newValue.length > 0 ? newValue.map(v => v.id) : null,
                    }));
                  }}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  filterOptions={(options, params) => {
                    const filtered = options.filter(o => {
                      if (o.id === '__all__' || o.id === '__none__') return true;
                      return o.name.toLowerCase().includes(params.inputValue.toLowerCase());
                    });
                    return filtered;
                  }}
                  renderOption={(props, option) => {
                    if (option.id === '__all__' || option.id === '__none__') {
                      return (
                        <li {...props} key={option.id} style={{ borderBottom: option.id === '__none__' ? '1px solid hsla(var(--border))' : undefined }}>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>
                            {option.name}
                          </Typography>
                        </li>
                      );
                    }
                    const count = option.id === currentOrgId
                      ? datastoreItems.length
                      : subOrgItems.get(option.id)?.items.length || 0;
                    const isOrgLoading = subOrgLoading.has(option.id);
                    const isOrgFailed = subOrgFailed.has(option.id);
                    // Indent orgs that are children of another org in the list
                    const orgData = subOrgs.find(o => o.id === option.id);
                    const isSubOrg = orgData?.creator_org && orgData.creator_org !== option.id;
                    return (
                      <li {...props} key={option.id} style={{ paddingLeft: isSubOrg ? 48 : 16 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {option.image ? (
                              <img src={option.image} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
                            ) : (
                              <Box sx={{ width: 20, height: 20, borderRadius: '4px', bgcolor: 'hsl(var(--muted) / 0.5)', flexShrink: 0 }} />
                            )}
                            <Typography sx={{ fontSize: '0.82rem' }}>{option.name}</Typography>
                            {isOrgFailed && (
                              <Tooltip title="Failed to load incidents from this tenant" placement="right">
                                <WarningAmberIcon size={14} style={{ color: 'hsl(var(--severity-medium))' }} />
                              </Tooltip>
                            )}
                          </Box>
                          {isOrgLoading ? (
                            <CircularProgress size={12} sx={{ color: '#a78bfa', ml: 1 }} />
                          ) : (
                            <Typography sx={{ fontSize: '0.7rem', color: isOrgFailed ? 'hsl(var(--severity-medium))' : 'hsl(var(--muted-foreground))', ml: 1 }}>
                              {isOrgFailed ? '!' : count}
                            </Typography>
                          )}
                        </Box>
                      </li>
                    );
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={(() => {
                        const orgFilter = Array.isArray(filters.org) ? filters.org : filters.org ? [filters.org] : [];
                        return orgFilter.length > 0 ? `${orgFilter.length} Tenant${orgFilter.length > 1 ? 's' : ''}` : 'Tenants';
                      })()}
                      sx={{ minWidth: 150, width: 150 }}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: null,
                      }}
                    />
                  )}
                  renderTags={() => null}
                  sx={{
                    minWidth: 150,
                    width: 150,
                    '& .MuiOutlinedInput-root': {
                      minHeight: 36,
                      py: '2px',
                    },
                  }}
                  slotProps={{
                    popper: {
                      sx: {
                        width: '280px !important',
                      },
                      placement: 'bottom-start',
                    },
                    paper: {
                      sx: {
                        bgcolor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        '& .MuiAutocomplete-option': {
                          fontSize: '0.82rem',
                          py: 0.75,
                        },
                      },
                    },
                  }}
                />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}
    >
      <HighlightSpotlight />
      <RuntimeQueueProblemBar />
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            {entityPlural}
          </Typography>
          {(isLoading || subOrgLoading.size > 0) && (() => {
            const totalOrgs = subOrgs.filter(o => o.id !== currentOrgId).length;
            const loaded = totalOrgs - subOrgLoading.size;
            const showOrgProgress = totalOrgs > 0 && subOrgLoading.size > 0;
            return (
              <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
                <Box
                  aria-label="Loading incidents"
                  sx={{
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    borderRadius: '50%',
                    border: '2px solid hsl(var(--primary) / 0.22)',
                    borderTopColor: 'hsl(var(--primary))',
                    animation: 'casesHeaderLoaderSpin 0.8s linear infinite',
                    '@keyframes casesHeaderLoaderSpin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
                {showOrgProgress && (
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 500, display: { xs: 'none', md: 'inline' } }}>
                    Loading orgs {loaded}/{totalOrgs}
                  </Typography>
                )}
              </Box>
            );
          })()}
          {error && (
            <Typography variant="caption" color="error">{error}</Typography>
          )}
        </Box>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Ingestion + Forward pipeline container */}
          {renderAutomationPipeline()}

          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
            {showAutomation && (
            <Tooltip title="Automation for Incidents">
              <IconButton 
                data-tour="incidents-automation-button"
                onClick={() => {
                  trackPredefinedEvent(GA_EVENTS.INCIDENT_AUTOMATION_CHANGE, 'open_dialog');
                  setAutomationsDialogOpen(true);
  
                  // Demo: the "Enable the AI Agent automation" sub-goal is
                  // tracked by watching the live automation state, not by a
                  // click — see the useEffect above.
                }}
                sx={{ 
                  width: 36,
                  height: 36,
                  color: categoryAutomations?.some(a => a.enabled) ? '#4ade80' : 'text.secondary',
                  border: '1px solid',
                  borderColor: categoryAutomations?.some(a => a.enabled) ? 'success.main' : 'divider',
                  borderRadius: 1,
                  '&:hover': {
                    borderColor: categoryAutomations?.some(a => a.enabled) ? 'success.main' : 'text.secondary',
                  },
                }}
              >
                <RocketLaunchIcon size={20} />
              </IconButton>
            </Tooltip>
            )}
            {/* Thread continuation runs silently in the background — no indicator. */}
  
            <Tooltip title="Refresh">
              <IconButton 
                onClick={() => { sessionStorage.removeItem('shuffle_auto_resync_done'); autoResyncQueueRef.current.clear(); fetchItems(); fetchSubOrgIncidents(); }} 
                disabled={isLoading}
                sx={{ 
                  width: 36,
                  height: 36,
                  color: 'text.secondary',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '&:hover': {
                    borderColor: 'text.secondary',
                  },
                }}
              >
                <RefreshIcon size={20} className={isRefreshing ? 'animate-spin' : ''} />
              </IconButton>
            </Tooltip>
            <Tooltip title={`Create ${entitySingular}`}>
              <IconButton 
                onClick={() => setCreateDialogOpen(true)}
                sx={{ 
                  width: 36,
                  height: 36,
                  color: 'text.secondary',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '&:hover': {
                    borderColor: 'text.secondary',
                  },
                }}
              >
                <AddIcon size={20} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Mobile-only overflow menu — collapses ingest, tenants and actions */}
          <Tooltip title="Menu">
            <IconButton
              onClick={(e) => setMobileMenuAnchor(e.currentTarget)}
              sx={{
                display: 'none',
                width: 36,
                height: 36,
                color: 'text.secondary',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <MoreVerticalIcon size={20} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={mobileMenuAnchor}
            open={Boolean(mobileMenuAnchor)}
            onClose={() => setMobileMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 220, bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' } } }}
          >
            <MenuItem onClick={() => { setMobileMenuAnchor(null); setCreateDialogOpen(true); }}>
              <ListItemIcon><AddIcon size={18} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>{`Create ${entitySingular}`}</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMobileMenuAnchor(null);
                sessionStorage.removeItem('shuffle_auto_resync_done');
                autoResyncQueueRef.current.clear();
                fetchItems();
                fetchSubOrgIncidents();
              }}
            >
              <ListItemIcon><RefreshIcon size={18} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Refresh</ListItemText>
            </MenuItem>
            {isParentOrg && (
              <MenuItem onClick={() => { setMobileMenuAnchor(null); setMobileTenantsOpen(true); }}>
                <ListItemIcon><UsersIcon size={18} /></ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Tenants</ListItemText>
              </MenuItem>
            )}
            {showAutomation && (
              <MenuItem onClick={() => { setMobileMenuAnchor(null); setAppSearchOpen(true); }}>
                <ListItemIcon><DownloadIcon size={18} /></ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Ingestion sources</ListItemText>
              </MenuItem>
            )}
            {showAutomation && ingestWorkflowId && (
              <MenuItem onClick={() => { setMobileMenuAnchor(null); triggerSync(); }} disabled={isSyncing || isUpdatingApps}>
                <ListItemIcon><PlayArrowIcon size={18} /></ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Sync now</ListItemText>
              </MenuItem>
            )}
            {showAutomation && (
              <MenuItem onClick={() => { setMobileMenuAnchor(null); setAutomationsDialogOpen(true); }}>
                <ListItemIcon><RocketLaunchIcon size={18} /></ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>Automation</ListItemText>
              </MenuItem>
            )}
          </Menu>

          {/* Mobile tenant picker */}
          <Dialog
            open={mobileTenantsOpen}
            onClose={() => setMobileTenantsOpen(false)}
            fullWidth
            maxWidth="xs"
            slotProps={{ paper: { sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' } } }}
          >
            <DialogContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>Tenants</Typography>
              {tenantSelector}
            </DialogContent>
          </Dialog>
        </Box>
      </Box>

      {/* Warning banner when Ingest Tickets schedule is stopped */}
      {ingestScheduleStopped && ingestWorkflowId && (
        <Box sx={{
          mb: 2,
          px: 2,
          py: 1.5,
          borderRadius: 1.5,
          bgcolor: 'hsla(var(--severity-medium) / 0.08)',
          border: '1px solid hsla(var(--severity-medium) / 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}>
          <Box sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'hsl(var(--severity-medium))',
            flexShrink: 0,
          }} />
          <Typography sx={{ fontSize: '0.82rem', color: 'hsl(var(--foreground))', flex: 1 }}>
            <strong>Automatic ingestion is paused</strong> — the "Ingest Tickets" workflow schedule has been stopped. Sources are shown as disabled until the schedule is re-enabled.
          </Typography>
        </Box>
      )}


      {/* Floating Filter Bar - sticky */}
      <Card elevation={0} sx={{ mb: 3, position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(var(--card))', backgroundImage: 'none', border: '1px solid hsl(var(--border))', boxShadow: 'none', backdropFilter: 'none' }}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
            {/* Select all checkbox - always visible */}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {(() => {
                const visibleIds = sortedIncidents
                  .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                  .map(i => i.id);
                const visibleSelectedCount = visibleIds.filter(id => selectedIds.has(id)).length;
                const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
                const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
                return (
                  <Tooltip title={selectedIds.size > 0 ? 'Deselect all' : 'Select all on this page'}>
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected || (selectedIds.size > 0 && !allVisibleSelected)}
                      onChange={() => {
                        if (selectedIds.size > 0) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(visibleIds));
                        }
                      }}
                      size="small"
                      sx={{
                        color: 'hsl(var(--muted-foreground))',
                        '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                          color: 'hsl(var(--primary))',
                        },
                      }}
                    />
                  </Tooltip>
                );
              })()}
              {selectedIds.size > 0 && (
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: 'hsl(var(--primary))',
                    fontSize: '0.7rem',
                    ml: -0.5,
                    minWidth: 12,
                  }}
                >
                  {selectedIds.size}
                </Typography>
              )}
            </Box>

            <TextField
              size="small"
              placeholder="Filter incidents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end" sx={{ gap: 0.5 }}>
                    {correlationsLoading && (
                      <Tooltip title="Searching platform correlations...">
                        <CircularProgress size={14} sx={{ color: 'text.secondary' }} />
                      </Tooltip>
                    )}
                    {!correlationsLoading && correlatedIncidentIds.size > 0 && (
                      <Tooltip title={`${correlatedIncidentIds.size} correlated incident${correlatedIncidentIds.size === 1 ? '' : 's'} found by platform`}>
                        <Box
                          component="span"
                          sx={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            px: 0.6,
                            py: 0.15,
                            borderRadius: '4px',
                            bgcolor: 'action.selected',
                            color: 'text.secondary',
                            cursor: 'default',
                            userSelect: 'none',
                          }}
                        >
                          {correlatedIncidentIds.size} corr
                        </Box>
                      </Tooltip>
                    )}
                    {searchQuery && (
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSearchQuery('');
                          setCorrelatedIncidentIds(new Set());
                          setExtraCorrelatedIncidents([]);
                        }}
                        aria-label="Clear filter"
                        sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                      >
                        <CloseIcon style={{ width: 14, height: 14 }} />
                      </IconButton>
                    )}
                  </InputAdornment>
                ),
                sx: { height: 36, fontSize: '0.8125rem' },
              }}
              sx={{
                width: { xs: 'auto', sm: 180, md: 240 },
                flex: { xs: '1 1 auto', sm: '0 0 auto' },
                minWidth: 0,
                flexShrink: 1,
                transition: 'width 0.2s ease',
                '&:focus-within': {
                  width: { xs: 'auto', sm: 220, md: 300 },
                },
              }}
            />

            <Tooltip title="Menu">
              <IconButton
                onClick={(e) => setMobileMenuAnchor(e.currentTarget)}
                sx={{
                  display: { xs: 'inline-flex', md: 'none' },
                  width: 36,
                  height: 36,
                  color: 'text.secondary',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              >
                <MoreVerticalIcon size={20} />
              </IconButton>
            </Tooltip>

      {false && <>
      <AppSearchDrawer
        open={forwardAppSearchOpen}
        onClose={() => {
          setForwardAppSearchOpen(false);
          fetchIngestionApps();
        }}
        title="Add Forward Destination"
        subtitle="Search and authenticate a tool to forward incidents to"
      />
      </>}

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {allSelectedResolved ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleBulkReopen}
                    disabled={isBulkResolving}
                    sx={{
                      height: 36,
                      borderColor: 'hsl(var(--border))',
                      color: '#f59e0b',
                      '&:hover': {
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      },
                    }}
                  >
                    Reopen
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setBulkResolveDialogOpen(true)}
                    sx={{
                      height: 36,
                      borderColor: 'hsl(var(--border))',
                      color: '#22c55e',
                      '&:hover': {
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      },
                    }}
                  >
                    Resolve
                  </Button>
                )}
              </Box>
            )}

            {/* Active filters */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {filters.assignee && filters.assignee !== 'all' && (
                <Chip
                  label={`${negatedFilters.has('assignee') ? 'NOT ' : ''}${filters.assignee === 'unassigned' ? 'Unassigned' : filters.assignee}`}
                  size="small"
                  onClick={() => setNegatedFilters(prev => { const next = new Set(prev); next.has('assignee') ? next.delete('assignee') : next.add('assignee'); return next; })}
                  onDelete={() => { setFilters(prev => ({ ...prev, assignee: null })); setNegatedFilters(prev => { const next = new Set(prev); next.delete('assignee'); return next; }); }}
                  sx={{
                    cursor: 'pointer',
                    backgroundColor: negatedFilters.has('assignee') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                    color: negatedFilters.has('assignee') ? '#f87171' : '#818cf8',
                    fontWeight: 500,
                    '& .MuiChip-deleteIcon': { color: negatedFilters.has('assignee') ? '#f87171' : '#818cf8' },
                  }}
                />
              )}

              {filters.severity && (() => {
                const sevArr = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
                const sevLabel = sevArr.join(' / ');
                const sevColor = sevArr.length === 1 ? (severityColors[sevArr[0]] || '#94a3b8') : '#94a3b8';
                return (
                  <Chip
                    label={`${negatedFilters.has('severity') ? 'NOT ' : ''}${sevLabel}`}
                    size="small"
                    onClick={() => setNegatedFilters(prev => { const next = new Set(prev); next.has('severity') ? next.delete('severity') : next.add('severity'); return next; })}
                    onDelete={() => { setFilters(prev => ({ ...prev, severity: null })); setNegatedFilters(prev => { const next = new Set(prev); next.delete('severity'); return next; }); }}
                    sx={{
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      backgroundColor: negatedFilters.has('severity') ? 'rgba(239, 68, 68, 0.15)' : `${sevColor}20`,
                      color: negatedFilters.has('severity') ? '#f87171' : sevColor,
                      fontWeight: 500,
                      '& .MuiChip-deleteIcon': { color: negatedFilters.has('severity') ? '#f87171' : sevColor },
                    }}
                  />
                );
              })()}

              {filters.status && (
                Array.isArray(filters.status) ? (
                  <Chip
                    label={`${negatedFilters.has('status') ? 'NOT ' : ''}${filters.status.map(s => statusConfig[s]?.label || s).join(' / ')}`}
                    size="small"
                    onClick={() => setNegatedFilters(prev => { const next = new Set(prev); next.has('status') ? next.delete('status') : next.add('status'); return next; })}
                    onDelete={() => { setFilters(prev => ({ ...prev, status: null })); setNegatedFilters(prev => { const next = new Set(prev); next.delete('status'); return next; }); }}
                    sx={{ 
                      cursor: 'pointer',
                      backgroundColor: negatedFilters.has('status') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: negatedFilters.has('status') ? '#f87171' : '#818cf8',
                      fontWeight: 500,
                      '& .MuiChip-deleteIcon': { color: negatedFilters.has('status') ? '#f87171' : '#818cf8' },
                    }}
                  />
                ) : (
                  <Chip
                    label={`${negatedFilters.has('status') ? 'NOT ' : ''}${statusConfig[filters.status]?.label || filters.status.replace('_', ' ')}`}
                    size="small"
                    onClick={() => setNegatedFilters(prev => { const next = new Set(prev); next.has('status') ? next.delete('status') : next.add('status'); return next; })}
                    onDelete={() => { setFilters(prev => ({ ...prev, status: null })); setNegatedFilters(prev => { const next = new Set(prev); next.delete('status'); return next; }); }}
                    sx={{ 
                      cursor: 'pointer',
                      backgroundColor: negatedFilters.has('status') ? 'rgba(239, 68, 68, 0.15)' : (statusConfig[filters.status]?.bg || 'rgba(148, 163, 184, 0.1)'),
                      color: negatedFilters.has('status') ? '#f87171' : (statusConfig[filters.status]?.color || '#94a3b8'),
                      fontWeight: 500,
                      '& .MuiChip-deleteIcon': { color: negatedFilters.has('status') ? '#f87171' : (statusConfig[filters.status]?.color || '#94a3b8') },
                    }}
                  />
                )
              )}

              {filters.source && (
                <Chip
                  label={`${negatedFilters.has('source') ? 'NOT ' : ''}${filters.source}`}
                  size="small"
                  onClick={() => setNegatedFilters(prev => { const next = new Set(prev); next.has('source') ? next.delete('source') : next.add('source'); return next; })}
                  onDelete={() => { setFilters(prev => ({ ...prev, source: null })); setNegatedFilters(prev => { const next = new Set(prev); next.delete('source'); return next; }); }}
                  avatar={
                    (() => {
                      const app = ingestionApps.find(a => 
                        a.name.toLowerCase().replace(/[\s_-]/g, '') === filters.source!.toLowerCase().replace(/[\s_-]/g, '')
                      );
                      return app?.image ? (
                        <img src={app.image} alt="" style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 2 }} />
                      ) : undefined;
                    })()
                  }
                  sx={{ 
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    backgroundColor: negatedFilters.has('source') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    color: negatedFilters.has('source') ? '#f87171' : '#60a5fa',
                    fontWeight: 500,
                    '& .MuiChip-deleteIcon': { color: negatedFilters.has('source') ? '#f87171' : '#60a5fa' },
                  }}
                />
              )}

              {filters.tag && (
                <Chip
                  label={`${negatedFilters.has('tag') ? 'NOT ' : ''}${filters.tag}`}
                  size="small"
                  onClick={() => setNegatedFilters(prev => { const next = new Set(prev); next.has('tag') ? next.delete('tag') : next.add('tag'); return next; })}
                  onDelete={() => { setFilters(prev => ({ ...prev, tag: null })); setNegatedFilters(prev => { const next = new Set(prev); next.delete('tag'); return next; }); }}
                  sx={{ 
                    cursor: 'pointer',
                    backgroundColor: negatedFilters.has('tag') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                    color: negatedFilters.has('tag') ? '#f87171' : '#06b6d4',
                    fontWeight: 500,
                    '& .MuiChip-deleteIcon': { color: negatedFilters.has('tag') ? '#f87171' : '#06b6d4' },
                  }}
                />
              )}



              {/* Tag quick-filter chips removed — use tag chips on incident cards instead */}

              {!isDefaultFilter && (
                <Button size="small" onClick={resetToDefaults} sx={{ minWidth: 'auto', height: 36 }}>
                  Reset
                </Button>
              )}
            </Box>

            <Tooltip title={hasMore ? 'More incidents exist beyond the fetch cap — narrow filters or load more to see the exact total.' : 'Total incidents matching the current organization scope'} arrow placement="top">
              <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' }, ml: 'auto', color: 'text.secondary', whiteSpace: 'nowrap', cursor: 'help' }}>
                {(() => {
                  const localCount = sortedIncidents.length;
                  const activeTotal = activeIncidents.length;
                  const apiTotal = totalAmount ?? 0;
                  const totalIncidents = hasMore
                    ? Math.max(activeTotal, apiTotal, incidents.length)
                    : activeTotal;
                  const totalDisplay = hasMore ? `${totalIncidents}+` : `${totalIncidents}`;
                  const totalPages = Math.max(1, Math.ceil(localCount / ITEMS_PER_PAGE));
                  const isNarrowed = !isDefaultFilter && totalIncidents > localCount;
                  const countLabel = isNarrowed
                    ? `${localCount} of ${totalDisplay} incidents (filtered)`
                    : `${totalDisplay} incident${totalIncidents !== 1 ? 's' : ''}`;
                  return `${countLabel}${totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ''}`;
                })()}
              </Typography>
            </Tooltip>

            {/* Organization multi-select dropdown */}
            {isParentOrg && !isMobileView && tenantSelector}
          </Box>
        </CardContent>
      </Card>

      {/* Card View with Stats */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 320px' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        {/* Card list */}
        <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
          <IncidentCardView
            incidents={sortedIncidents.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)}
            getIncidentUrl={getIncidentUrl}
            threadCounts={(() => {
              // Group all loaded incidents by shared email thread_id from
              // the raw OCSF payload. Any group with 2+ members contributes
              // a count to every member so the thread badge shows on the
              // list even before persistent merging catches up.
              const buckets = new Map<string, string[]>();
              for (const inc of sortedIncidents) {
                const raw = (inc as any).rawOCSF || (inc as any);
                const tid = extractThreadId(raw);
                if (!tid) continue;
                const key = String(tid).toLowerCase();
                const arr = buckets.get(key) || [];
                arr.push(inc.id);
                buckets.set(key, arr);
              }
              const out: Record<string, number> = {};
              for (const ids of buckets.values()) {
                if (ids.length < 2) continue;
                for (const id of ids) out[id] = ids.length;
              }
              return out;
            })()}

            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            isLoading={isLoading}
            ingestionApps={ingestionApps}
            resyncingIds={allResyncingIds}
            resyncingSource={resyncingSource}
            orgFilterNames={(() => {
              const orgFilter = Array.isArray(filters.org) ? filters.org : filters.org ? [filters.org] : [];
              // Build a lookup of all known orgs
              const allKnownOrgs: { id: string; name: string }[] = [
                { id: currentOrgId || '', name: currentOrgName },
                ...subOrgs.map(o => ({ id: o.id, name: o.name })),
              ];
              return orgFilter.map(id => {
                const found = allKnownOrgs.find(o => o.id === id);
                return found?.name || id;
              });
            })()}
            totalOrgCount={(() => {
              if (!isParentOrg) return 1;
              const allIds = new Set([currentOrgId || '', ...subOrgs.map(o => o.id)]);
              return allIds.size;
            })()}
            onResetOrgFilter={resetToDefaults}
            totalIncidentCount={incidents.length}
            onResetFilters={resetToDefaults}
            onShowAllIncidents={() => {
              // Clear every filter (including the default status filter) and
              // reveal incidents that were hidden for missing/corrupt content.
              const allOrgIds = [currentOrgId || '', ...subOrgs.map(o => o.id)];
              setFilters({ severity: null, status: null, tlp: null, assignee: null, source: null, tag: null, org: isParentOrg ? allOrgIds.filter(Boolean) : null });
              setNegatedFilters(new Set());
              setDateFrom(undefined);
              setDateTo(undefined);
              setSearchQuery('');
              setCorrelatedIncidentIds(new Set());
              setExtraCorrelatedIncidents([]);
              setShowIrrelevant(true);
            }}

            isParentOrg={isParentOrg}
            onFilterChange={(type, value) => {
              setFilters(prev => {
                if (type === 'org') {
                  // Clicking a tenant chip filters for ONLY that tenant.
                  const valStr = String(value);
                  if (Array.isArray(prev.org) && prev.org.length === 1 && prev.org[0] === valStr) {
                    return { ...prev, org: null };
                  }
                  return { ...prev, org: [valStr] };
                }
                return { ...prev, [type]: prev[type] === value ? null : value };
              });
            }}
          />
          
          {/* Load more from server when on last page - only if client-side filters aren't already hiding loaded items */}
          {hasMore && currentPage >= Math.ceil(sortedIncidents.length / ITEMS_PER_PAGE) && sortedIncidents.length >= datastoreItems.length && (!filters.org || filters.org.length === 0 || filters.org.includes(currentOrgId || '')) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={fetchNextPage}
                disabled={isLoading}
                sx={{ 
                  height: 36, minWidth: 140,
                  borderColor: 'hsl(var(--border))',
                  '&:hover': { borderColor: 'hsl(var(--primary))' },
                }}
              >
                {isLoading ? <CircularProgress size={20} /> : 'Load More'}
              </Button>
            </Box>
          )}
        </Box>
        
        {/* Stats sidebar — sticky on desktop. */}
        <Box sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', '& > *': { flexShrink: 0 }, position: 'sticky', top: 72, alignSelf: 'start', maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', order: { xs: -1, lg: 0 } }}>
          {/* Date range filter */}
          <Box sx={{ 
            mb: 2, 
            px: 1.5, 
            py: 1, 
            borderRadius: 2, 
            backgroundColor: 'transparent', 
            border: '1px solid', 
            borderColor: (dateFrom || dateTo) ? 'rgba(99, 102, 241, 0.4)' : 'hsl(var(--border))',
            transition: 'border-color 0.2s ease',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <CalendarTodayIcon size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Date Range
              </Typography>
              {(dateFrom || dateTo) && (
                <Typography 
                  variant="caption" 
                  onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
                  sx={{ ml: 'auto', color: '#818cf8', fontSize: '0.65rem', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  Clear
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <RadixPopover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex-1 text-left text-xs px-2 py-1.5 rounded-md border transition-all ${dateFrom ? 'border-blue-500/60 bg-blue-500/10 text-foreground' : 'border-blue-500/20 text-muted-foreground hover:border-blue-500/40 hover:bg-blue-500/5'} bg-background`}
                  >
                    {dateFrom ? format(dateFrom, dateFrom.getHours() || dateFrom.getMinutes() || dateFrom.getSeconds() ? 'MMM d, yyyy HH:mm:ss' : 'MMM d, yyyy') : 'From'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-blue-500/30" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => {
                      if (d && dateFrom) {
                        d.setHours(dateFrom.getHours(), dateFrom.getMinutes(), dateFrom.getSeconds());
                      }
                      setDateFrom(d);
                    }}
                    disabled={(date) => dateTo ? date > dateTo : false}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    classNames={{
                      day_selected: 'bg-blue-500 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-500 focus:text-white',
                      day_today: 'bg-blue-500/15 text-blue-400',
                    }}
                  />
                  <div className="border-t border-blue-500/20 px-3 py-2">
                    <label className="text-[0.65rem] text-blue-400 font-medium uppercase tracking-wider">Time</label>
                    <input
                      type="time"
                      step="1"
                      value={dateFrom ? format(dateFrom, 'HH:mm:ss') : '00:00:00'}
                      onChange={(e) => {
                        const [h, m, s] = e.target.value.split(':').map(Number);
                        const d = dateFrom ? new Date(dateFrom) : new Date();
                        d.setHours(h || 0, m || 0, s || 0);
                        setDateFrom(d);
                      }}
                      className="w-full mt-1 text-xs px-2 py-1 rounded-md border border-blue-500/30 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                </PopoverContent>
              </RadixPopover>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>→</Typography>
              <RadixPopover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex-1 text-left text-xs px-2 py-1.5 rounded-md border transition-all ${dateTo ? 'border-emerald-500/60 bg-emerald-500/10 text-foreground' : 'border-emerald-500/20 text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/5'} bg-background`}
                  >
                    {dateTo ? format(dateTo, dateTo.getHours() || dateTo.getMinutes() || dateTo.getSeconds() ? 'MMM d, yyyy HH:mm:ss' : 'MMM d, yyyy') : 'To'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-emerald-500/30" align="end">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(d) => {
                      if (d && dateTo) {
                        d.setHours(dateTo.getHours(), dateTo.getMinutes(), dateTo.getSeconds());
                      }
                      setDateTo(d);
                    }}
                    disabled={(date) => dateFrom ? date < dateFrom : false}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    classNames={{
                      day_selected: 'bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white focus:bg-emerald-500 focus:text-white',
                      day_today: 'bg-emerald-500/15 text-emerald-400',
                    }}
                  />
                  <div className="border-t border-emerald-500/20 px-3 py-2">
                    <label className="text-[0.65rem] text-emerald-400 font-medium uppercase tracking-wider">Time</label>
                    <input
                      type="time"
                      step="1"
                      value={dateTo ? format(dateTo, 'HH:mm:ss') : '23:59:59'}
                      onChange={(e) => {
                        const [h, m, s] = e.target.value.split(':').map(Number);
                        const d = dateTo ? new Date(dateTo) : new Date();
                        d.setHours(h || 0, m || 0, s || 0);
                        setDateTo(d);
                      }}
                      className="w-full mt-1 text-xs px-2 py-1 rounded-md border border-emerald-500/30 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-emerald-500/40"
                    />
                  </div>
                </PopoverContent>
              </RadixPopover>
            </Box>
          </Box>
          
          <IncidentStatsCards 
            incidents={activeIncidents}
            currentUsername={currentUsername}
            isLoading={isLoading || !hasFetched}
            onFilterChange={(type, value) => {
              setFilters(prev => ({
                ...prev,
                [type]: prev[type] === value ? null : value,
              }));
            }}
          />
          {/* Incident trend charts — show real totals across all incidents,
              not the currently filtered list, so the charts stay informative
              even when the user has a status/severity filter active. */}
          <IncidentTrendChart incidents={activeIncidents} dateFrom={dateFrom} dateTo={dateTo} onDateRangeSelect={(from, to) => { setDateFrom(from); setDateTo(to); }} />
          <SourceTrendChart incidents={activeIncidents} dateFrom={dateFrom} dateTo={dateTo} onDateRangeSelect={(from, to) => { setDateFrom(from); setDateTo(to); }} />
          {/* By Tenant chart — only for parent tenants that actually have
              child tenants contributing incidents. */}
          {isParentOrg && childTenantsWithIncidents > 0 && (
            <OrgTrendChart incidents={activeIncidents} dateFrom={dateFrom} dateTo={dateTo} />
          )}
          {/* Readiness stays mounted in one place; when nothing is configured
              it is only re-ordered to the very top (never remounted, which
              previously made it flip back and forth). */}
          <Box sx={{ order: readinessEmpty ? -1 : 0, flexShrink: 0 }}>
            <AutomationReadinessBanner atTop={readinessEmpty} onEmptyChange={handleReadinessEmptyChange} />

          </Box>
          {/* Irrelevant incidents bar */}
          {irrelevantCount > 0 && (
            <Box
              onClick={() => setShowIrrelevant(prev => !prev)}
              sx={{
                mt: 2,
                px: 2,
                py: 1.5,
                borderRadius: 2,
                backgroundColor: showIrrelevant ? 'rgba(107, 114, 128, 0.15)' : 'transparent',
                border: '1px solid',
                borderColor: showIrrelevant ? 'rgba(107, 114, 128, 0.4)' : 'hsl(var(--border))',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: 'rgba(107, 114, 128, 0.5)',
                  bgcolor: 'rgba(107, 114, 128, 0.1)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VisibilityOffIcon size={14} style={{ color: '#6b7280' }} />
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                  {irrelevantCount} irrelevant
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', opacity: 0.7, fontSize: '0.7rem' }}>
                {showIrrelevant ? 'Click to hide' : 'Hidden'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <CreateIncidentDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={handleCreateIncident}
      />

      <CategoryAutomationsDialog
        open={automationsDialogOpen}
        onClose={() => setAutomationsDialogOpen(false)}
        category={DATASTORE_CATEGORIES.INCIDENTS}
        automations={categoryAutomations}
        onAutomationsChange={setCategoryAutomations}
        initialSettings={categoryConfig?.settings}
        onSaved={() => {
          // Re-fetch ingestion apps & workflows, then auto-sync
          fetchIngestionApps();
          triggerSync();
        }}
      />

      <ResolveIncidentDialog
        open={bulkResolveDialogOpen}
        onClose={() => setBulkResolveDialogOpen(false)}
        onResolve={handleBulkResolve}
        incidentTitle={`${selectedIds.size} selected incident${selectedIds.size !== 1 ? 's' : ''}`}
        isLoading={isBulkResolving}
      />

      <AppSearchDrawer
        theme={resolvedTheme}
        open={appSearchOpen}
        onClose={() => {
          setAppSearchOpen(false);
          fetchIngestionApps();
        }}
        title="Add Ingestion Source"
        subtitle={isAddOutlookStep ? 'Add either "Outlook Office365" or "Gmail" — we will pretend-authenticate it for the demo' : 'Search and authenticate a tool to ingest incidents from'}
        pinnedApps={isAddOutlookStep ? [
          {
            name: 'Outlook_Office365',
            image_url: 'https://storage.googleapis.com/shuffle_public/app_images/Outlook_Office365_accdaaf2eeba6a6ed43b2efc0112032d.png',
            categories: ['email'],
            objectID: 'demo-outlook-office365',
          },
          {
            name: 'Gmail',
            image_url: 'https://storage.googleapis.com/shuffle_public/app_images/Gmail_794e51c3c1a8b24b89ccc573a3defc47.png',
            categories: ['email'],
            objectID: 'demo-gmail',
          },
        ] : undefined}
        highlightAppName={shouldHighlightOutlook ? 'Outlook_Office365' : undefined}
        realtimeHighlightAppNames={isAddOutlookStep && isHoveringEmailGoal ? ['Outlook_Office365', 'Gmail'] : undefined}
        onSelectOverride={isAddOutlookStep ? (app: any) => {
          // Pretend-authenticate flow: Outlook Office365 or Gmail advance the
          // tour. Anything else falls through to the normal detail drawer so
          // the user is not trapped if they explore.
          const norm = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const isEmailApp = norm.includes('outlook') || norm.includes('office365') || norm.includes('gmail');
          if (isEmailApp) {
            // Remember which email tool the user picked so the focus phishing
            // incident is sourced from it (Gmail vs Outlook Office365) instead
            // of always defaulting to Outlook.
            try {
              const product = norm.includes('gmail') ? 'gmail' : 'outlook_office365';
              localStorage.setItem('shuffle_demo_email_source', product);
            } catch { /* ignore */ }
            // Close the search drawer and run the fake auth experience.
            setAppSearchOpen(false);
            setFakeAuth({ name: app.name, image: app.icon || '' });
            // After ~1.6s, finish "auth": inject the app into Ingest and mark
            // the email sub-goal as complete.
            setTimeout(() => {
              setDemoInjectedApps(prev => {
                if (prev.some(a => a.name.toLowerCase() === app.name.toLowerCase())) return prev;
                const next: ValidatedIngestionApp[] = [
                  ...prev,
                  {
                    id: `demo-${app.name}`,
                    name: app.name,
                    image: app.icon || '',
                    validated: true,
                    enabled: true,
                    category: 'email',
                  },
                ];
                markStepCompleted('add-outlook:outlook');
                return next;
              });
              setFakeAuth(null);
              // No toast in demo mode — the success toast was overlapping the
              // "Next" button on the demo flow, and the visual state change in
              // the source list already makes the connection obvious.
              void app;
            }, 1600);
            return true; // prevent the detail drawer from opening
          }
          return false;
        } : undefined}
      />

      {/* Fake "Connecting to Microsoft" dialog used during the demo's
          add-outlook step so users get a tangible auth moment. */}
      <Dialog
        open={!!fakeAuth}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            minWidth: 360,
          },
        }}
      >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
          {fakeAuth?.image && (
            <Box
              component="img"
              src={fakeAuth.image}
              alt={fakeAuth.name}
              sx={{ width: 56, height: 56, borderRadius: 1.5, p: 0.75, bgcolor: 'hsl(var(--muted))', objectFit: 'contain' }}
            />
          )}
          <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Connecting to {fakeAuth?.name?.replace(/_/g, ' ') || 'Microsoft'}…
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
              Demo mode — no real OAuth roundtrip.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
      {/* Fixed bottom pagination */}
      {sortedIncidents.length > ITEMS_PER_PAGE && (
        <Box sx={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 1,
          py: 1,
          px: 2.5,
          bgcolor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 20,
        }}>
          <IconButton
            size="small"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            sx={{
              width: 36, height: 36,
              border: '1px solid hsl(var(--border))',
              borderRadius: 1,
              color: 'hsl(var(--muted-foreground))',
              '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
              '&.Mui-disabled': { opacity: 0.3 },
            }}
          >
            <ChevronLeftIcon size={20} />
          </IconButton>

          {Array.from({ length: Math.ceil(sortedIncidents.length / ITEMS_PER_PAGE) }, (_, i) => i + 1)
            .filter(page => {
              const totalPages = Math.ceil(sortedIncidents.length / ITEMS_PER_PAGE);
              if (totalPages <= 7) return true;
              if (page === 1 || page === totalPages) return true;
              if (Math.abs(page - currentPage) <= 1) return true;
              return false;
            })
            .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
              if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
              acc.push(page);
              return acc;
            }, [])
            .map((item, idx) =>
              item === 'ellipsis' ? (
                <Typography key={`e-${idx}`} sx={{ px: 0.5, color: 'hsl(var(--muted-foreground))' }}>…</Typography>
              ) : (
                <Button
                  key={item}
                  size="small"
                  onClick={() => setCurrentPage(item as number)}
                  sx={{
                    minWidth: 36, height: 36, px: 0,
                    borderRadius: 1,
                    fontWeight: currentPage === item ? 700 : 400,
                    color: currentPage === item ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                    bgcolor: currentPage === item ? 'hsl(var(--primary))' : 'transparent',
                    border: currentPage === item ? 'none' : '1px solid hsl(var(--border))',
                    '&:hover': {
                      bgcolor: currentPage === item ? 'hsl(var(--primary))' : 'hsl(var(--muted) / 0.5)',
                    },
                  }}
                >
                  {item}
                </Button>
              )
            )}

          {(() => {
            const totalPages = Math.ceil(sortedIncidents.length / ITEMS_PER_PAGE);
            const atEnd = currentPage >= totalPages;
            // When the user reaches the last loaded page, the next click should
            // sideload the next cursor batch from the server and advance into it.
            const canLoadMoreFromServer = atEnd && hasMore;
            const disabled = atEnd && !canLoadMoreFromServer;
            return (
              <IconButton
                size="small"
                disabled={disabled || isLoading}
                onClick={async () => {
                  if (canLoadMoreFromServer) {
                    await fetchNextPage();
                    setCurrentPage(p => p + 1);
                  } else {
                    setCurrentPage(p => p + 1);
                  }
                }}
                title={canLoadMoreFromServer ? 'Load older incidents' : 'Next page'}
                sx={{
                  width: 36, height: 36,
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 1,
                  color: canLoadMoreFromServer ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  borderColor: canLoadMoreFromServer ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
                  '&.Mui-disabled': { opacity: 0.3 },
                }}
              >
                {isLoading && atEnd ? <CircularProgress size={14} /> : <ChevronRightIcon size={20} />}
              </IconButton>
            );
          })()}
        </Box>
      )}

    </motion.div>
  );
};

export default IncidentsPage;
