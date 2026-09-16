import {
  readTenantStamp,
  isTenantGhost,
  type TenantStamp,
} from "@/utils/tenantAuthority";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  forwardRef,
} from "react";
import DOMPurify from "dompurify";
import AgentIcon from "@/Shuffle-MCPs/components/AgentIcon";
import {
  useParams,
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "@/lib/router-compat";
import {
  useEntityLabel,
  useTaskStatuses,
  useEntityText,
  useAutoMergeThread,
} from "@/hooks/useEntityLabel";
import {
  Box,
  Typography,
  Chip,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Switch,
  Avatar,
  Button,
  Tooltip,
  Skeleton,
  Collapse,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Paper,
  Popover,
  Checkbox,
  Autocomplete,
} from "@mui/material";
import { motion } from "framer-motion";
import { createAndUploadFile } from "@/services/files";
import Menu from "@mui/material/Menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDatastore } from "@/hooks/useDatastore";
import { useIgnoredObservables } from "@/hooks/useIgnoredObservables";
import { useAgentReadiness } from "@/hooks/useAgentReadiness";
import {
  CorrelationRow,
  getEffectiveCorrelationCount,
  filterMeaningfulCorrelations,
  hasIocMatch,
} from "@/components/incidents/CorrelationRow";
import CorrelationContextStrip from "@/components/incidents/CorrelationContextStrip";
import { IocDetailsCard } from "@/components/incidents/IocDetailsCard";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useAppDetail } from "@/Shuffle-MCPs/AppDetailContext";
import { useDemo } from "@/context/DemoContext";
import {
  forceCreateSingleDemoIncidentReturningKey,
  isDemoActive,
  handleDemoAgentComment,
  getDemoCorrelations,
} from "@/services/demoMode";
import {
  DATASTORE_CATEGORIES,
  getDatastoreItem,
  getDatastoreItemPublic,
  setDatastoreItem,
  deleteDatastoreItem,
  getDatastoreByCategory,
} from "@/Shuffle-MCPs/datastore";
import type { DatastoreItem, RBACConfig } from "@/Shuffle-MCPs/datastore";
import { ShareAccessModal } from "@/components/common/ShareAccessModal";
import IncidentReportDialog from "@/components/incidents/IncidentReportDialog";
import type { GenerateReportInput } from "@/services/incidentReports";
import {
  API_CONFIG,
  getApiUrl,
  getAuthHeader,
  getShuffleCoreUrl,
  getShuffleCoreWorkflowUrl,
  mapCloudRegionUrl,
  isDevEnvironment,
} from "@/Shuffle-MCPs/api";
import { navigateToShuffleCore } from "@/lib/authHandoff";
import {
  resyncState,
  getResyncBlockedReason,
  extractResyncFailureReason,
} from "@/lib/resyncState";
import {
  autoCorrectTranslatedString,
  repairCorruptedOcsfFields,
  type FieldRepair,
} from "@/lib/translationFallback";
import { useUsers } from "@/hooks/useUsers";
import { useSubOrgs } from "@/hooks/useSubOrgs";
import { useCustomFields, CustomField } from "@/hooks/useCustomFields";
import { useIOCTypes } from "@/hooks/useIOCTypes";
import { ObservableTypeSelector } from "@/components/incidents/ObservableTypeSelector";
import { ObservableLookupMenu } from "@/components/incidents/ObservableLookupMenu";
import { useCaseTemplates, CaseTemplate } from "@/hooks/useCaseTemplates";
import {
  ActivityItem,
  tlpLevels,
} from "@/components/incidents/CreateIncidentDialog";
import {
  OCSFIncidentFinding,
  Observable,
  IncidentTask,
  FileAttachment,
  Comment,
  severityOptions,
  taskCategories,
  TLP_LABELS,
  TLP_STRING_TO_INT,
  mapOCSFSeverity,
  mapOCSFStatus,
  convertLegacyTlp,
} from "@/config/ocsfIncidentSchema";
import { normalizeStatus } from "@/config/incidentConfig";
import {
  ResolveIncidentDialog,
  ResolutionData,
  RESOLUTION_REASONS,
} from "@/components/incidents/ResolveIncidentDialog";
import { MergeIncidentDialog } from "@/components/incidents/MergeIncidentDialog";
import { MergeCandidatesBanner } from "@/components/incidents/MergeCandidatesBanner";
import { MergedIncidentBanner } from "@/components/incidents/MergedIncidentBanner";
import { RelatedIncidentsBanner } from "@/components/incidents/RelatedIncidentsBanner";
import { ThreadCorrelatedBanner } from "@/components/incidents/ThreadCorrelatedBanner";
import { useRelatedIncidents } from "@/hooks/useRelatedIncidents";
import { useThreadCorrelatedIncidents } from "@/hooks/useThreadCorrelatedIncidents";
import {
  maybeMigrateLegacyMerge,
  getPrimaryPointer,
  linkMergePairsIncremental,
  writeIncidentSafe,
  reconcileRelatedFromRevisions,
  getLinkedPointers,
  pairWasUnmerged,
  enforceMergedStatusInvariant,
  isClosedIncident,
} from "@/lib/incidentRelations";
import { DemoFallbackAuditBanner } from "@/components/incidents/DemoFallbackAuditBanner";
import { useMergeCandidates } from "@/hooks/useMergeCandidates";
import { RoutingRulePreviewBanner } from "@/components/incidents/RoutingRulePreviewBanner";
import { SelectionRuleChip } from "@/components/incidents/SelectionRuleChip";
import { IncidentDetailSkeleton } from "@/components/incidents/IncidentDetailSkeleton";
import {
  ROUTING_DATASTORE_CATEGORY,
  type RoutingRule,
  type RoutingAction,
  ACTION_TYPE_LABELS,
} from "@/components/settings/IncidentRoutingEditor";
import {
  evaluateRoutingRules,
  dedupeMatchesByActionTarget,
  type IncidentEvaluationContext,
} from "@/utils/routingRuleEvaluator";
import { GitBranch as CallSplitIcon } from "lucide-react";
import {
  buildAgentContextBlock,
  stripAgentContextBlock,
} from "@/utils/agentContextBlock";
import { MentionText } from "@/components/incidents/MentionText";
import CollapsibleContent from "@/components/incidents/CollapsibleContent";
import {
  UserHoverCard,
  resolveUserAvatar,
} from "@/components/incidents/UserHoverCard";
import { TaskKanbanBoard } from "@/components/incidents/TaskKanbanBoard";
import {
  DeferredTextField,
  DeferredMentionInput,
  DebouncedMentionInput,
  DebouncedMentionInputHandle,
} from "@/components/incidents/DeferredTextField";
import { TaskDateTimePicker } from "@/components/incidents/TaskDateTimePicker";
import { FileAttachments } from "@/components/incidents/FileAttachments";
import { toast } from "@/lib/toast";
import {
  isAIAssignee,
  deduplicateTasks,
  htmlToPlainText,
  decodeHtmlEntities,
  decodeIfBase64,
  deepMergeIncidents,
} from "@/lib/utils";
import { MarkdownDescriptionEditor } from "@/components/incidents/MarkdownDescriptionEditor";
import { MentionInput } from "@/components/incidents/MentionInput";
import {
  TimelineSeverityDropdown,
  TimelineStatusDropdown,
  TimelineAssigneeDropdown,
  TimelineTagsEditor,
  TimelineTlpDropdown,
} from "@/components/incidents/TimelineAttributeComponents";
import { useIncidentAgentRuns } from "@/hooks/useIncidentAgentRuns";
import { useIncidentWorkflowRuns } from "@/hooks/useIncidentWorkflowRuns";
import { useAgentNotifications } from "@/hooks/useNotifications";
import {
  isApprovalNotification,
  type AgentNotification,
} from "@/services/notifications";
import InlineAgentQuestion from "@/components/agent/InlineAgentQuestion";
import { useSourceAppImage } from "@/hooks/useSourceAppImage";
import { AgentExecutionDrawer } from "@/Shuffle-MCPs";
import { extractPendingAgentQuestions } from "@/Shuffle-MCPs/components/AgentUI";
import { WorkflowRunExplorerDrawer } from "@/Shuffle-Core";

import { SegmentedControl } from "@/components/ui/segmented-control";
import AgentRunDiagnosisBanner from "@/components/agent/AgentRunDiagnosisBanner";
import {
  getRunTitle,
  getRunIconColor,
  formatDuration as formatAgentRunDuration,
  getTimeAgo as getAgentTimeAgo,
  STATUS_CONFIG as AGENT_STATUS_CONFIG,
} from "@/components/agent/AgentRunHeader";
import {
  getFailureInfo as getAgentFailureInfo,
  hasOutputWarning as hasAgentOutputWarning,
  diagnoseOutputWarning as diagnoseAgentOutputWarning,
} from "@/components/agent/AgentRunResultViewer";
import AgentRunStatusBadge from "@/components/agent/AgentRunStatusBadge";
import {
  AlertTriangle as AlertTriangleIcon,
  Loader2 as Loader2Icon,
  ArrowDown as ArrowDownwardIcon,
  AlertTriangle as WarningAmberIcon,
  ArrowUp as ArrowUpwardIcon,
  Fingerprint as FingerprintIcon,
  ArrowLeft as ArrowBackIcon,
  CheckCircle2 as CheckCircleIcon,
  Plus as AddIcon,
  Send as SendIcon,
  Reply as ReplyIcon,
  Paperclip as AttachFileIcon,
  User as PersonIcon,
  Pencil as EditIcon,
  History as HistoryIcon,
  Clock as AccessTimeIcon,
  ChevronDown as ExpandMoreIcon,
  ChevronUp as ExpandLessIcon,
  Filter as FilterListIcon,
  Shield as SecurityIcon,
  Link as LinkIcon,
  Users as PeopleIcon,
  Settings as SettingsIcon,
  FileText as DescriptionIcon,
  CheckCircle2 as TaskAltIcon,
  Trash2 as DeleteIcon,
  GripVertical as DragIndicatorIcon,
  ListPlus as PlaylistAddIcon,
  RefreshCw as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Wand2 as AutoFixHighIcon,
  MoreVertical as MoreVertIcon,
  Forward as ForwardIcon,
  GitMerge as CallMergeIcon,
  X as CloseIcon,
  Eye as VisibilityIcon,
  EyeOff as VisibilityOffIcon,
  ChevronRight as ChevronRightIcon,
  Globe as LanguageIcon,
  Search as SearchIcon,
  Square as SquareIcon,
  CheckSquare as CheckSquareIcon,
  MessageSquare,
  Network,
  SlidersHorizontal as TuneIcon,
} from "lucide-react";
import { Zap as ZapIcon } from "lucide-react";
import type { AgentRun } from "@/services/agentActivity";
import { getAgentSkipInfo } from "@/lib/agentParsers";
import HighlightedFileEditor from "@/components/incidents/HighlightedFileEditor";
import EmailThreadPanel, {
  isEmailContent,
  getEmailMessageCount,
} from "@/components/incidents/EmailThreadPanel";
import SimpleCaseLayout from "@/components/incidents/SimpleCaseLayout";
import SimpleTasksView from "@/components/incidents/SimpleTasksView";
import {
  isDraftOnlyIncident,
  resolveEmailThread,
} from "@/lib/emailThreadAdapters";

import { IncidentSection } from "@/components/incidents/IncidentSection";
import { useEnrichmentStatus } from "@/hooks/useEnrichmentStatus";
import { useIsSupport } from "@/hooks/useIsSupport";
import { useAssignEscalateStatus } from "@/hooks/useAssignEscalateStatus";
import AppSearchDrawer from "@/Shuffle-MCPs/views/AppSearchDrawer";

// Per-open guarantee: at least ONE of Email Thread or Timeline must be
// expanded, otherwise the page looks empty. We respect whichever the user
// already has open; only when BOTH are collapsed do we force-expand the
// Timeline (the preferred default).
try {
  if (typeof window !== "undefined") {
    // Email Thread: '1' = open.
    const emailOpen =
      localStorage.getItem("shuffle-incident-email-thread-open") === "1";
    // Timeline: '1' = collapsed, anything else (including null) = expanded.
    const timelineCollapsed =
      localStorage.getItem("shuffle-incident-timeline-collapsed") === "1";
    if (!emailOpen && timelineCollapsed) {
      localStorage.setItem("shuffle-incident-timeline-collapsed", "0");
    }
  }
} catch {
  /* ignore — non-fatal */
}

// TaskTemplate interface is now imported from useCaseTemplates

export interface Stakeholder {
  id: string;
  name: string;
  email?: string;
  type: "technical" | "business";
  role?: string;
  location?: string;
  phone?: string;
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
  edited?: string;
  editedTs?: number;
  tlp?: string;
  pap?: string;
  references?: string[];
  stakeholders?: Stakeholder[];
  observables?: Observable[];
  enrichments?: Array<{
    type: string;
    value?: string;
    data?: string;
    first_seen?: string | number;
    last_seen?: string | number;
  }>;
  customFields?: Record<string, string | number | boolean>;
  relatedFindings?: string[];
  activity?: ActivityItem[];
  tasks?: IncidentTask[];
  rawOCSF?: any; // Use any to support both new and legacy formats
  labels?: string[];
}

interface IncidentListFallbackState {
  incidentListFallback?: Partial<DisplayIncident> & {
    id: string;
    orgId?: string;
    orgName?: string;
  };
}

// Status and severity colors now imported from shared config
import {
  statusConfig,
  severityColors,
  getOCSFStatus,
} from "@/config/incidentConfig";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  getAgentTools as getAssignedAgentTools,
  AGENT_TOOLS_CHANGED_EVENT,
  formatToolName as formatAgentToolName,
} from "@/lib/agentTools";
import { openAgentDrawer } from "@/lib/agentDrawer";
import { useScheduleAgentRun } from "@/hooks/useScheduleAgentRun";

// Transport failures (circuit-breaker 503s, flaky tunnels) are not the same as
// a missing incident. Keep retrying quietly for ~30s before showing anything
// terminal so the user only ever sees a loading state.
const MAX_TRANSIENT_LOAD_RETRIES = 12;

/**
 * Normalize any timestamp (Unix seconds, ms, µs, ns, ISO string, numeric string) to ms epoch.
 */
const normalizeToMs = (timestamp: number | string | undefined): number => {
  if (!timestamp) return 0;
  if (typeof timestamp === "string" && /[^0-9.]/.test(timestamp)) {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const ts = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(ts) || ts <= 0) return 0;
  if (ts < 1e12) return ts * 1000;
  if (ts < 1e15) return ts;
  if (ts < 1e18) return ts / 1000;
  return ts / 1e6;
};

const formatTimestamp = (timestamp: number | string | undefined): string => {
  const ms = normalizeToMs(timestamp);
  if (!ms) return "Unknown";
  const date = new Date(ms);
  if (isNaN(date.getTime())) return "Unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const formatRelativeTime = (timestamp: number): string => {
  const ms = normalizeToMs(timestamp);
  if (!ms) return "Unknown";
  const now = Date.now();
  const diff = now - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatTimestamp(ms);
};

/**
 * Ultra-compact relative time for the simple timeline, where the timestamp
 * is secondary information and must not eat horizontal space.
 * "now", "5m", "3h", "2d", "12w", then a short date.
 */
const formatCompactTime = (timestamp: number): string => {
  const ms = normalizeToMs(timestamp);
  if (!ms) return "";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 365)}y`;
};

/**
 * Turn a timeline step label into a human sentence fragment that reads
 * naturally after a username ("frikky completed"). Without an actor we keep
 * the original standalone label.
 */
const stepVerbLabel = (label: string, hasActor: boolean): string => {
  if (!hasActor) return label;
  // Attribute-change steps already read as a verb phrase and carry values
  // whose casing matters ("Changed severity") — only lowercase the
  // leading verb so the sentence reads "<user> changed severity".
  if (
    /^(Changed|Added|Removed|Updated|Resolved|Assigned|Unassigned) /.test(label)
  ) {
    return `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  }
  const map: Record<string, string> = {
    "Task created": "created",
    "Task completed": "completed",
    "Task moved": "moved",
    "Incident created": "created this incident",
  };
  return map[label] || label;
};

/**
 * Universal styling for timeline text items that must occupy at most 1 line
 * by default, expanding to full wrapped text when hovered.
 */
const timelineClampSingleLineSx = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
  cursor: "inherit",
  transition: "all 0.12s ease",
  "&:hover, .timeline-hover-row:hover &": {
    whiteSpace: "pre-wrap",
    overflow: "visible",
    wordBreak: "break-word",
  },
};

const formatDuration = (ms: number): string => {
  // Guard against NaN/undefined/negative — callers sometimes pass a diff of
  // two timestamps where one side is missing, which propagates as NaN and
  // renders as "NaNd NaNh" in the Metrics area.
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${days}d ${hours % 24}h`;
};

const parseTimestamp = (timestamp: number | string | undefined): number => {
  return normalizeToMs(timestamp);
};

const normalizeRoutingSeverityValue = (value?: string): string => {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const match = severityOptions.find(
    (s) =>
      s.value.toLowerCase() === raw ||
      s.label.toLowerCase().replace(/[\s-]+/g, "_") === raw,
  );
  return match?.value || raw;
};

const parseRoutingActionValue = (
  value: string | undefined,
): string | number | boolean => {
  const trimmed = String(value ?? "").trim();
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
};

const readDeepValue = (obj: any, path: string): any => {
  if (!obj || !path) return undefined;
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
};

const setDeepValue = (
  obj: any,
  path: string,
  value: string | number | boolean,
) => {
  if (!obj || !path) return;
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== "object" || Array.isArray(cur[part]))
      cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
};

// Quick OCSF-shape check used by the revision-fallback logic. Mirrors the
// detection inside parseIncidentFromDatastore so we agree on what "valid OCSF"
// means: a finding with finding_uid + title (new format), finding_info(_list)
// (legacy), or a numeric severity_id.
const isOcsfShapedData = (data: unknown): boolean => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as any;
  const isNewFormat = "finding_uid" in d && "title" in d;
  const isLegacyOCSF =
    !!d.finding_info_list ||
    !!d.finding_info ||
    typeof d.severity_id === "number";
  return isNewFormat || isLegacyOCSF;
};

// Critical identity fields. If any are missing on a saved OCSF payload, we
// treat the payload as partially corrupted and try to overlay missing pieces
// from the most recent revision that still has them. A bad Raw OCSF save (or
// upstream pipeline drop) often clears title/desc/id while leaving severity_id
// intact, which would silently slip past `isOcsfShapedData`.
const getMissingCriticalFields = (data: unknown): string[] => {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return ["title", "id"];
  const d = data as any;
  const fi = d.finding_info_list?.[0] || d.finding_info || {};
  const missing: string[] = [];
  const title = d.title || fi.title;
  if (!title || (typeof title === "string" && !title.trim()))
    missing.push("title");
  const id = d.finding_uid || d.id || fi.uid || fi.finding_uid;
  if (!id || (typeof id === "string" && !id.trim())) missing.push("id");
  return missing;
};

// Best-effort JSON parse for revision values (handles base64-encoded strings).
const parseRevisionValue = (raw: unknown): any | null => {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  const decoded = decodeIfBase64(raw);
  try {
    return JSON.parse(decoded);
  } catch {}
  try {
    return JSON.parse(raw);
  } catch {}
  return null;
};

const stableRevisionValueString = (raw: unknown): string => {
  const normalize = (value: any): any => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce(
          (acc, key) => {
            acc[key] = normalize(value[key]);
            return acc;
          },
          {} as Record<string, any>,
        );
    }
    return value;
  };

  const parsed = parseRevisionValue(raw);
  try {
    return JSON.stringify(normalize(parsed ?? raw));
  } catch {
    return String(raw ?? "");
  }
};

const cheapHash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
};

// Strict check: only return string if it has meaningful non-whitespace content
// Also rejects raw JSON objects/arrays that shouldn't be displayed as text
// Normalize equivalent source labels (e.g. "Manual Entry" -> "Manual") so the
// UI does not show two chips for the same logical source.
const normalizeSourceLabel = (val: string | undefined): string | undefined => {
  if (!val) return val;
  if (val.trim().toLowerCase() === "manual entry") return "Manual";
  return val;
};

const meaningfulString = (val: unknown): string | undefined => {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  if (trimmed.length === 0) return undefined;
  // Reject values that look like serialized JSON objects or arrays
  // Skip JSON.parse for large strings (>10KB) to avoid blocking the main thread
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    if (trimmed.length > 10_000) {
      console.warn(
        `[Perf] meaningfulString: skipping JSON.parse on large string (${(trimmed.length / 1024).toFixed(1)}KB)`,
      );
      return undefined; // Large JSON-looking strings are never meaningful display strings
    }
    try {
      JSON.parse(trimmed);
      return undefined; // It's valid JSON — not a meaningful display string
    } catch {
      // Not valid JSON, treat as regular string
    }
  }
  return decodeHtmlEntities(trimmed);
};

/**
 * Wrap meaningfulString with the translation-expression fallback so fields
 * that were left as literal JSONPath (e.g. `$payload.headers[?(@.name=="Subject")].value`)
 * get evaluated against the raw payload instead of leaking to the UI.
 */
const meaningfulField = (
  val: unknown,
  container: unknown,
  headerName?: string,
): string | undefined => {
  const corrected = autoCorrectTranslatedString(val, container, headerName);
  return meaningfulString(
    corrected ?? (typeof val === "string" ? val : undefined),
  );
};

const cleanInitialRevisionText = (
  val: unknown,
  container: unknown,
  headerName?: string,
): string => {
  const meaningful = meaningfulField(val, container, headerName);
  const src = String(meaningful || "");
  if (!src) return "";
  const decoded = decodeIfBase64(src);
  const trimmedDecoded = decoded.trim();
  const looksLikeBase64Blob =
    src.length > 120 &&
    /^[A-Za-z0-9+/_\-\s=]+$/.test(src) &&
    !/\s/.test(src.trim().slice(0, 200));
  if (looksLikeBase64Blob && decoded === src) return "";
  if (
    /^\s*(Content-Type|MIME-Version|Content-Transfer-Encoding):/im.test(decoded)
  )
    return "";
  if (/^\s*\[\s*\{\s*"name"\s*:/i.test(trimmedDecoded)) return "";
  if (/\[\?\(\s*@\./.test(trimmedDecoded)) return "";
  return decoded;
};

/**
 * Resolve the "created" timestamp for an incident.
 * Priority: value.created_time → item.created (datastore envelope).
 */
const resolveCreatedTs = (data: any, itemCreated?: number): number => {
  if (data?.created_time) {
    const ct =
      typeof data.created_time === "string" && /^\d+$/.test(data.created_time)
        ? Number(data.created_time)
        : data.created_time;
    const ms = normalizeToMs(ct);
    if (ms > 0) return ms;
  }
  return normalizeToMs(itemCreated);
};

/** Merge native (root-level) enrichments with OCSF-level enrichments, deduplicating by type+value */
const deduplicateEnrichments = (
  nativeEnrichments?: Array<{ type: string; value?: string; data?: string }>,
  ocsfEnrichments?: Array<{ type: string; value?: string; data?: string }>,
): Array<{ type: string; value?: string; data?: string }> => {
  const native = Array.isArray(nativeEnrichments) ? nativeEnrichments : [];
  const ocsf = Array.isArray(ocsfEnrichments) ? ocsfEnrichments : [];
  const all = [...native, ...ocsf];
  const seen = new Set<string>();
  return all.filter((e) => {
    const key = `${e.type}::${e.value || e.data || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getLocalEmailThreadMessageCount = (raw: any): number => {
  if (!raw || typeof raw !== "object") return 0;
  const counts: number[] = [];
  try {
    const resolved = resolveEmailThread(raw);
    if (resolved?.messages?.length) counts.push(resolved.messages.length);
  } catch {
    /* ignore malformed provider payloads */
  }
  const unmapped = raw.unmapped_original;
  if (Array.isArray(unmapped?.messages)) counts.push(unmapped.messages.length);
  if (Array.isArray(unmapped?.emails)) counts.push(unmapped.emails.length);
  if (Array.isArray(raw.email?.messages))
    counts.push(raw.email.messages.length);
  return counts.length ? Math.max(...counts) : 0;
};

const parseIncidentFromDatastore = (item: {
  key: string;
  value: string;
  created?: number;
  edited?: number;
  enrichments?: Array<{ type: string; value?: string; data?: string }>;
}): DisplayIncident | null => {
  const parseStart = performance.now();
  try {
    const jsonStart = performance.now();
    const data = enforceMergedStatusInvariant(JSON.parse(item.value));
    const jsonTime = performance.now() - jsonStart;
    if (jsonTime > 5) {
      console.warn(
        `[Perf] JSON.parse took ${jsonTime.toFixed(1)}ms for incident ${item.key} (${(item.value.length / 1024).toFixed(1)}KB)`,
      );
    }

    // Check if this is new OCSF format (has finding_uid at root)
    const isNewFormat = "finding_uid" in data && "title" in data;
    // Check if legacy OCSF format
    const isLegacyOCSF =
      data.finding_info_list ||
      data.finding_info ||
      data.severity_id !== undefined;

    if (isNewFormat) {
      // New OCSF format
      const ocsf = data as OCSFIncidentFinding;
      const customAttrs = ocsf.metadata?.extensions?.custom_attributes;
      const tlpValue = customAttrs?.tlp;
      const tlpLabel =
        typeof tlpValue === "number" ? TLP_LABELS[tlpValue]?.label : undefined;

      // Read tasks and activity from top level first, fallback to metadata
      const topLevelTasks = (data as any).tasks;
      const topLevelActivity = (data as any).activity;
      const metadataTasks = customAttrs?.tasks;
      const metadataActivity = (customAttrs as any)?.activity;
      const tasks = topLevelTasks || metadataTasks || [];
      const activity = topLevelActivity || metadataActivity || [];

      // Convert comments to activity for display (legacy format support)
      const comments = customAttrs?.comments || [];
      const activityFromComments: ActivityItem[] = comments.map((c, i) => ({
        id: `comment-${i}`,
        type: "comment" as const,
        user: c.author,
        timestamp: new Date(c.timestamp).getTime(),
        content: c.text,
      }));

      // Use top-level/metadata activity if exists, otherwise fallback to comments
      const mergedActivity =
        activity.length > 0 ? activity : activityFromComments;

      return {
        id: item.key, // Always use datastore key as the canonical ID
        title:
          meaningfulField(ocsf.title, data, "Subject") ||
          meaningfulField(ocsf.supporting_data, data) ||
          meaningfulField(ocsf.desc, data),
        source: normalizeSourceLabel(
          meaningfulField(ocsf.product?.name, data) ||
            meaningfulField(ocsf.types?.[0], data),
        ),
        severity: mapOCSFSeverity(ocsf.severity_id || 3),
        status: normalizeStatus(
          ocsf.status || mapOCSFStatus(ocsf.status_id || 1),
        ),
        assignee:
          meaningfulField(customAttrs?.assignee, data, "From") ||
          meaningfulField((data as any).assignee, data, "From") ||
          null,
        created: formatTimestamp(resolveCreatedTs(data, item.created)),
        createdTs: resolveCreatedTs(data, item.created),
        edited: item.edited ? formatTimestamp(item.edited) : undefined,
        editedTs: item.edited ? parseTimestamp(item.edited) : undefined,
        tlp: tlpLabel,
        references: ocsf.references,
        stakeholders:
          (customAttrs as any)?.stakeholders ||
          (data as any).stakeholders ||
          [],
        observables: customAttrs?.observables || (data as any).observables,
        enrichments: deduplicateEnrichments(
          item.enrichments,
          (data as any).enrichments,
        ),
        // Support both customFields and custom_fields naming
        customFields:
          customAttrs?.customFields ||
          (customAttrs as any)?.custom_fields ||
          (data as any).customFields ||
          (data as any).custom_fields,
        relatedFindings: ocsf.related_events,
        activity: mergedActivity,
        tasks,
        rawOCSF: data, // Store raw data for updates
        labels: Array.isArray(ocsf.types) ? ocsf.types : [],
      };
    } else if (isLegacyOCSF) {
      // Legacy OCSF format
      const legacyData = data as any;
      const findingInfo =
        legacyData.finding_info_list?.[0] || legacyData.finding_info;
      const customAttrs = legacyData.metadata?.extensions?.custom_attributes;
      const tlp = customAttrs?.tlp || legacyData.tlp;
      const pap = customAttrs?.pap || legacyData.pap;
      const tasks = customAttrs?.tasks || legacyData.tasks;
      const activity = customAttrs?.activity || legacyData.activity;
      const customFields =
        customAttrs?.customFields ||
        (customAttrs as any)?.custom_fields ||
        legacyData.customFields ||
        legacyData.custom_fields;

      return {
        id: item.key, // Always use datastore key as the canonical ID
        title:
          meaningfulField(findingInfo?.title, legacyData, "Subject") ||
          meaningfulField(legacyData.supporting_data, legacyData) ||
          meaningfulField(legacyData.desc, legacyData) ||
          meaningfulField(legacyData.message, legacyData),
        source: normalizeSourceLabel(
          meaningfulField(legacyData.metadata?.product?.name, legacyData) ||
            meaningfulField(findingInfo?.types?.[0], legacyData),
        ),
        severity: mapOCSFSeverity(legacyData.severity_id),
        status: normalizeStatus(
          legacyData.status || mapOCSFStatus(legacyData.status_id),
        ),
        assignee:
          meaningfulField(legacyData.assignee, legacyData, "From") || null,
        created: formatTimestamp(resolveCreatedTs(legacyData, item.created)),
        createdTs: resolveCreatedTs(legacyData, item.created),
        edited: item.edited ? formatTimestamp(item.edited) : undefined,
        editedTs: item.edited ? parseTimestamp(item.edited) : undefined,
        tlp:
          typeof tlp === "string"
            ? tlp
            : tlp
              ? TLP_LABELS[tlp]?.label
              : undefined,
        pap,
        references: findingInfo?.references,
        observables: legacyData.observables,
        enrichments: deduplicateEnrichments(
          item.enrichments,
          legacyData.enrichments,
        ),
        customFields,
        relatedFindings: legacyData.related_findings,
        activity: activity || [],
        tasks,
        rawOCSF: legacyData,
        labels: Array.isArray(findingInfo?.types) ? findingInfo.types : [],
      };
    }

    // Non-OCSF format
    return {
      id: item.key, // Always use datastore key as the canonical ID
      title:
        meaningfulField(data.title, data, "Subject") ||
        meaningfulField(data.supporting_data, data) ||
        meaningfulField(data.desc, data) ||
        meaningfulField(data.message, data),
      source: normalizeSourceLabel(meaningfulField(data.source, data)),
      severity: data.severity || "medium",
      status: normalizeStatus(data.status),
      assignee: meaningfulField(data.assignee, data, "From") || null,
      created: formatTimestamp(resolveCreatedTs(data, item.created)),
      createdTs: resolveCreatedTs(data, item.created),
      edited: item.edited ? formatTimestamp(item.edited) : undefined,
      editedTs: item.edited ? parseTimestamp(item.edited) : undefined,
      tlp: data.tlp,
      pap: data.pap,
      references: data.references || [],
      stakeholders: data.stakeholders || [],
      observables: data.observables || [],
      enrichments: deduplicateEnrichments(item.enrichments, data.enrichments),
      customFields: data.customFields || {},
      relatedFindings: data.relatedFindings || [],
      activity: data.activity || [],
      tasks: data.tasks || [],
      rawOCSF: data,
    };
  } catch (err) {
    console.error(
      `[Perf] parseIncidentFromDatastore failed for ${item.key}:`,
      err,
    );
    return null;
  } finally {
    const totalTime = performance.now() - parseStart;
    if (totalTime > 10) {
      console.warn(
        `[Perf] parseIncidentFromDatastore total: ${totalTime.toFixed(1)}ms for ${item.key}`,
      );
    }
  }
};

// Canonical collapsible panel — see src/components/incidents/IncidentSection.tsx.
// Aliased as `Section` so existing call sites keep working.
const Section = IncidentSection;

interface SimpleIncidentTitleProps {
  title: string;
  onCommit: (val: string) => void;
  readOnly?: boolean;
}

/**
 * Title header for the Simple Case View.
 * Clamped to 1 line with ellipsis by default so long email subjects/alert titles
 * do not take up 3-4 lines and dominate the screen. Expands smoothly on hover
 * to reveal full text, and switches to an editable input on click.
 */
const SimpleIncidentTitle = ({
  title,
  onCommit,
  readOnly = false,
}: SimpleIncidentTitleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  if (isEditing && !readOnly) {
    return (
      <DeferredTextField
        autoFocus
        value={title}
        onCommit={(next) => {
          onCommit(next);
          setIsEditing(false);
        }}
        onBlur={() => setIsEditing(false)}
        variant="standard"
        placeholder="Untitled incident"
        multiline
        fullWidth
        slotProps={{ input: { disableUnderline: true } }}
        sx={{
          flex: 1,
          minWidth: 0,
          "& textarea, & input": {
            fontSize: "1.6rem",
            fontWeight: 700,
            lineHeight: 1.25,
            color: "hsl(var(--foreground))",
            p: 0,
          },
        }}
      />
    );
  }

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (!readOnly) setIsEditing(true);
      }}
      title={!isHovered ? title || "Untitled incident" : undefined}
      sx={{
        flex: 1,
        minWidth: 0,
        fontSize: "1.6rem",
        fontWeight: 700,
        lineHeight: 1.25,
        color: title
          ? "hsl(var(--foreground))"
          : "hsl(var(--muted-foreground))",
        cursor: readOnly ? "default" : "text",
        borderRadius: 1,
        pt: "5px",
        transition: "background-color 0.15s ease",
        "&:hover": {
          bgcolor: readOnly ? "transparent" : "rgba(255, 255, 255, 0.04)",
        },
        ...(isHovered
          ? {
              whiteSpace: "pre-wrap",
              overflow: "visible",
              wordBreak: "break-word",
            }
          : {
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }),
      }}
    >
      {title || "Untitled incident"}
    </Box>
  );
};

const IncidentDetailPage = () => {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    plural: entityPlural,
    singular: entitySingular,
    basePath: entityBasePath,
  } = useEntityLabel();
  const t = useEntityText();
  const taskStatuses = useTaskStatuses();
  const { userInfo } = useAuth();
  const { resolvedTheme } = useTheme();
  const { openApp } = useAppDetail();
  const currentUsername = userInfo?.username || "";
  const scheduleAgentRun = useScheduleAgentRun();

  const handleScheduleAgentRun = useCallback(
    async (info: Parameters<ReturnType<typeof useScheduleAgentRun>>[0]) => {
      await scheduleAgentRun(info);
    },
    [scheduleAgentRun],
  );

  // Parse namespaced org ID from sub-org incidents (format: "orgId::incidentId")
  const crossOrgId = useMemo(() => {
    if (!rawId || !rawId.includes("::")) return null;
    return rawId.split("::")[0];
  }, [rawId]);
  const id = useMemo(() => {
    if (!rawId) return rawId;
    return rawId.includes("::")
      ? rawId.split("::").filter(Boolean).pop() || rawId
      : rawId;
  }, [rawId]);
  const listFallbackIncident = useMemo(() => {
    const fallback = (location.state as IncidentListFallbackState | null)
      ?.incidentListFallback;
    if (!fallback || !id) return null;
    if (fallback.id !== id && fallback.id !== rawId) return null;
    const createdTs =
      normalizeToMs(fallback.createdTs || fallback.created) || Date.now();
    if (fallback.rawOCSF) {
      const parsed = parseIncidentFromDatastore({
        key: id,
        value: JSON.stringify(fallback.rawOCSF),
        created: createdTs,
        edited: fallback.editedTs,
      });
      if (parsed) return parsed;
    }
    return {
      id,
      title: fallback.title || id,
      source: fallback.source,
      severity: fallback.severity || "informational",
      status: fallback.status || "new",
      assignee: fallback.assignee ?? null,
      created: fallback.created || formatTimestamp(createdTs),
      createdTs,
      edited: fallback.edited,
      editedTs: fallback.editedTs,
      tlp: fallback.tlp,
      labels: fallback.labels,
      rawOCSF: {
        finding_uid: id,
        title: fallback.title || id,
        product: fallback.source ? { name: fallback.source } : undefined,
      },
      activity: [],
      tasks: [],
      observables: [],
      enrichments: [],
    } as DisplayIncident;
  }, [location.state, id, rawId]);
  const isCrossOrg = !!crossOrgId && crossOrgId !== userInfo?.active_org?.id;

  // Headers to include on every API call when viewing a cross-org incident
  const crossOrgHeaders = useMemo<Record<string, string>>(() => {
    if (!crossOrgId) return {} as Record<string, string>;
    return { "Org-Id": crossOrgId };
  }, [crossOrgId]);

  // Public sharing params
  const publicAuth = searchParams.get("authorization");
  const publicOrg = searchParams.get("org");
  const isPublicView = !!(publicAuth && publicOrg);

  // Seed with the list-row fallback when present so click-through from
  // /incidents renders the ticket shell (title, severity, source) instantly
  // instead of flashing a black skeleton while the datastore recovery path
  // (transient retries + list_cache pagination) grinds through ~10s.
  const [incident, setIncident] = useState<DisplayIncident | null>(
    () => listFallbackIncident,
  );
  const [loading, setLoading] = useState(!listFallbackIncident);

  // When a demo incident was seeded with static fallback IOCs (because the
  // live `ioc_*` datastore categories were empty at seed time), the seeder
  // sets `metadata.extensions.custom_attributes.demoFallback = true` on the
  // incident. Surface that fact in the URL as `?demo-fallback=true` so it is
  // obvious from the address bar that the visible IOCs are static fallbacks
  // rather than live indicators.
  useEffect(() => {
    if (!incident) return;
    const usedFallback =
      !!incident.rawOCSF?.metadata?.extensions?.custom_attributes?.demoFallback;
    const alreadyTagged = searchParams.get("demo-fallback") === "true";
    if (usedFallback && !alreadyTagged) {
      const next = new URLSearchParams(searchParams);
      next.set("demo-fallback", "true");
      setSearchParams(next, { replace: true });
    }
  }, [incident, searchParams, setSearchParams]);

  // Support-only debug capture for failed loads. Populated whenever loadIncident
  // ends without producing an incident, so support users can see why.
  const [loadDebug, setLoadDebug] = useState<{
    stage: "fetch-error" | "no-success" | "no-item" | "parse-failed" | "no-id";
    message?: string;
    rawId?: string;
    id?: string;
    crossOrgId?: string | null;
    activeOrgId?: string;
    isPublicView?: boolean;
    httpSuccess?: boolean;
    reason?: string;
    itemKey?: string;
    valueLength?: number;
    valuePreview?: string;
    error?: string;
    httpStatus?: number;
    httpStatusText?: string;
    responsePreview?: string;
    timestamp?: string;
  } | null>(null);
  // Demo-mode self-heal: when the user lands on a demo focus incident URL
  // that no longer exists in the datastore (e.g. it was force-regenerated
  // with a fresh timestamp suffix while the list was cached), we recreate
  // the focus incident and redirect to the new key — no "Incident not found"
  // dead-end during the tour. See "Incidents arriving" step 4.
  const { active: demoActive } = useDemo();
  const [demoRecovering, setDemoRecovering] = useState(false);
  const demoRecoveryTriedRef = useRef(false);

  // Editable fields
  const [editedTitle, setEditedTitle] = useState("");
  const currentIncidentTitle = (editedTitle || incident?.title || "").trim();

  usePageMeta({
    title: currentIncidentTitle
      ? `${currentIncidentTitle} | Incident`
      : "Incident",
    description:
      "Incident details, observables, correlations, timeline, and AI agent triage.",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__shuffleActiveEntityTitle =
        currentIncidentTitle || undefined;
      (window as any).__shuffleActiveIncidentId = rawId || undefined;
    }
    return () => {
      if (typeof window !== "undefined") {
        (window as any).__shuffleActiveEntityTitle = undefined;
        (window as any).__shuffleActiveIncidentId = undefined;
      }
    };
  }, [currentIncidentTitle, rawId]);
  const [editedMessage, setEditedMessage] = useState("");
  const [editedSeverity, setEditedSeverity] = useState("");
  const [editedAssignee, setEditedAssignee] = useState("");
  const [editedStatus, setEditedStatus] = useState("");
  const [editedTlp, setEditedTlp] = useState("TLP:AMBER");
  const [editedReferences, setEditedReferences] = useState<string[]>([]);
  const [newReference, setNewReference] = useState("");
  const [editedStakeholders, setEditedStakeholders] = useState<Stakeholder[]>(
    [],
  );
  const [showAddStakeholder, setShowAddStakeholder] = useState(false);
  const [newStakeholder, setNewStakeholder] = useState<Omit<Stakeholder, "id">>(
    { name: "", type: "technical" },
  );
  const [stakeholderSearch, setStakeholderSearch] = useState("");
  const [showStakeholderSuggestions, setShowStakeholderSuggestions] =
    useState(false);
  const [knownStakeholders, setKnownStakeholders] = useState<Stakeholder[]>([]);
  const [editedObservables, setEditedObservables] = useState<Observable[]>([]);
  const [enrichments, setEnrichments] = useState<
    Array<{
      type: string;
      value?: string;
      data?: string;
      first_seen?: string | number;
      last_seen?: string | number;
    }>
  >([]);
  const [expandedObsKey, setExpandedObsKey] = useState<string | null>(null);
  const [refreshingObservables, setRefreshingObservables] = useState(false);
  // Baseline observable+enrichment count captured when a comment is sent.
  // Used to early-clear the "Running indicator check" loader as soon as
  // new enrichments/observables show up — even if the scheduled 7s refresh
  // has not fired yet.
  const obsRefreshBaselineRef = useRef<number | null>(null);
  // Wall-clock moment the current indicator check started. Used to ignore
  // workflow runs that already existed before the check began.
  const obsCheckStartedAtRef = useRef<number | null>(null);
  const [obsCheckTick, setObsCheckTick] = useState(0);
  const obsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Early-clear the comment loader as soon as the visible observable/
  // enrichment count grows past the baseline captured at send time. The
  // 7s scheduled refresh is still useful as a safety net, but we should
  // not keep the spinner visible after enrichments have already landed.
  const _obsCount =
    editedObservables.filter((o) => !o.archived).length + enrichments.length;
  useEffect(() => {
    if (!refreshingObservables) return;
    const baseline = obsRefreshBaselineRef.current;
    if (baseline === null) return;
    if (_obsCount > baseline) {
      setRefreshingObservables(false);
      obsRefreshBaselineRef.current = null;
    }
  }, [_obsCount, refreshingObservables]);
  // When an incident was just created (within the last 2 minutes) we keep the
  // observables area in a "loading" state so the user can see automated
  // enrichments stream in shortly after, instead of an empty list.
  const FRESH_OBS_WINDOW_MS = 2 * 60 * 1000;
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Keys of items that arrived via background poll — used to flash a
  // highlight so the user can spot the new content without losing focus.
  // Observable keys: `${type}::${value}` (lowercase). Activity keys: actItem.id.
  const [newlyArrivedObservables, setNewlyArrivedObservables] = useState<
    Set<string>
  >(() => new Set());
  const [newlyArrivedActivity, setNewlyArrivedActivity] = useState<Set<string>>(
    () => new Set(),
  );
  // Transient highlights triggered by clicking a timeline step pill — let the
  // user jump from the timeline to the corresponding row in the Observables /
  // Correlations tab without losing track of which item they followed.
  const [flashedObsKey, setFlashedObsKey] = useState<string | null>(null);
  const [flashedCorrelationKey, setFlashedCorrelationKey] = useState<
    string | null
  >(null);
  const [flashedTaskId, setFlashedTaskId] = useState<string | null>(null);
  const flashedTaskTimerRef = useRef<any>(null);
  const flashedObsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashedCorrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Track the user's most recent keystroke so background polls can defer
  // while they're actively typing in a textfield.
  const lastKeystrokeRef = useRef<number>(0);
  const [showThreatIntelDrawer, setShowThreatIntelDrawer] = useState(false);
  const [showForwardAppsDrawer, setShowForwardAppsDrawer] = useState(false);
  const [newObservableType, setNewObservableType] = useState("ipv4");
  const [newObservableValue, setNewObservableValue] = useState("");
  const [obsFilterTypes, setObsFilterTypes] = useState<string[]>([]);
  const [obsFilterText, setObsFilterText] = useState("");
  const [obsSortField, setObsSortField] = useState<
    "first_seen" | "last_seen" | "type" | "value"
  >("first_seen");
  const [obsSortDir, setObsSortDir] = useState<"asc" | "desc">("desc");
  // Frozen sort-rank cache for the Observables tab. Captures (ioc, corr)
  // values the FIRST time we see a given observable key, so when correlation
  // lookups stream in later they don't yank rows around the list while the
  // user is mid-click. Cleared explicitly when the user changes sort/filter
  // or hits the manual refresh.
  const obsSortRankRef = useRef<Map<string, { ioc: number; corr: number }>>(
    new Map(),
  );
  // Bumped to force a fresh capture of the sort rank cache (used by the
  // sort/filter controls and the explicit "Re-run correlations" button).
  const [obsSortRankEpoch, setObsSortRankEpoch] = useState(0);
  // Ignored observables (per-org) — uninteresting indicators the user has
  // chosen to hide from the default Observables view. Toggle reveals them.
  const ignoredObs = useIgnoredObservables();
  const [showIgnoredObs, setShowIgnoredObs] = useState(false);
  // Wipe the frozen rank cache whenever the user touches sort/filter — that
  // is the right moment to honour newly-arrived correlations in the order.
  useEffect(() => {
    obsSortRankRef.current = new Map();
    setObsSortRankEpoch((n) => n + 1);
  }, [obsSortField, obsSortDir, obsFilterText, obsFilterTypes, showIgnoredObs]);

  // Single source of truth for "is this observable hidden?" — used by the
  // Observables list filter, the Observables tab badge, and the Timeline
  // observables filter so the counts always agree.
  //
  // The Correlations tab hides by VALUE only (it has no OCSF type), so a value
  // hidden there must also count as hidden here — otherwise the same indicator
  // stays visible in one tab and hidden in the other.
  const isObservableIgnored = useCallback(
    (type?: string, value?: string) =>
      ignoredObs.isIgnored(type || "", value || "") ||
      ignoredObs.isValueIgnored(value || ""),
    [ignoredObs],
  );
  // Un-hide an observable no matter which tab hid it: remove both the
  // type-scoped row and the value-only row written by the Correlations tab.
  const unignoreObservable = useCallback(
    async (type?: string, value?: string) => {
      const v = value || "";
      if (ignoredObs.isIgnored(type || "", v))
        await ignoredObs.unignore(type || "", v);
      if (ignoredObs.isValueIgnored(v)) await ignoredObs.unignore("value", v);
    },
    [ignoredObs],
  );
  const visibleObservablesCount = useMemo(() => {
    const manual = editedObservables.filter(
      (o) => !o.archived && !isObservableIgnored(o.type, o.value),
    ).length;
    const enr = enrichments.filter(
      (e) => !isObservableIgnored(e.type, e.value || (e as any).data),
    ).length;
    return manual + enr;
  }, [editedObservables, enrichments, isObservableIgnored]);

  const [editedCustomFields, setEditedCustomFields] = useState<
    Record<string, string | number | boolean>
  >({});
  const [editedLabels, setEditedLabels] = useState<string[]>([]);
  const [newLabelInput, setNewLabelInput] = useState("");

  // Activity/comments
  // Draft comments are persisted to localStorage per-incident so an accidental
  // refresh doesn't lose what the user was typing. Key is scoped by incident id.
  const commentDraftKey = rawId ? `incident-comment-draft::${rawId}` : "";
  const [newComment, setNewComment] = useState<string>(() => {
    if (typeof window === "undefined" || !commentDraftKey) return "";
    try {
      return window.localStorage.getItem(commentDraftKey) || "";
    } catch {
      return "";
    }
  });
  const [commentAttachments, setCommentAttachments] = useState<
    FileAttachment[]
  >([]);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const debouncedCommentInputRef = useRef<DebouncedMentionInputHandle>(null);

  // Locally added timeline entries (comments, agent asks) live here until the
  // backend echoes them back. A background poll or re-parse can return an
  // activity list that was assembled before our write landed, which used to
  // make a fresh comment disappear and pop back seconds later. Merging keeps
  // the local entry visible until the server confirms it — or until the write
  // fails, in which case it is dropped so the server stays the source of truth.
  const pendingLocalActivityRef = useRef<ActivityItem[]>([]);
  const trackPendingActivity = useCallback((item: ActivityItem) => {
    pendingLocalActivityRef.current = [
      ...pendingLocalActivityRef.current.filter((p) => p.id !== item.id),
      item,
    ];
  }, []);
  const dropPendingActivity = useCallback((itemId: string) => {
    pendingLocalActivityRef.current = pendingLocalActivityRef.current.filter(
      (p) => p.id !== itemId,
    );
  }, []);
  const mergePendingActivity = useCallback(
    (serverActivity: ActivityItem[]): ActivityItem[] => {
      const pending = pendingLocalActivityRef.current;
      if (pending.length === 0) return serverActivity;
      const list = Array.isArray(serverActivity) ? serverActivity : [];
      const serverIds = new Set(list.map((a) => a.id).filter(Boolean));
      const signature = (a: ActivityItem) =>
        `${a.type}|${a.user || ""}|${(a.content || "").trim()}`;
      const serverSignatures = new Set(list.map(signature));
      const stillPending = pending.filter((p) => {
        if (p.id && serverIds.has(p.id)) return false;
        if (serverSignatures.has(signature(p))) return false;
        // Safety valve: never hold a local-only entry for more than 2 minutes.
        return Date.now() - (p.timestamp || 0) < 120_000;
      });
      pendingLocalActivityRef.current = stillPending;
      if (stillPending.length === 0) return list;
      return [...list, ...stillPending];
    },
    [],
  );

  // "Ask the agent" popover state — quick way to send an @AIAgent question
  // from the incident header without scrolling down to the comment box.
  const [askAgentAnchor, setAskAgentAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [askAgentText, setAskAgentText] = useState("");
  const [askAgentSending, setAskAgentSending] = useState(false);
  // Sub-org incidents must be validated against THEIR tenant, not the active
  // org — otherwise readiness reports the parent org's wiring.
  const agentReadiness = useAgentReadiness(crossOrgId || undefined);
  // Assigned agent tools, mirrored into the "Ask the AI agent" popover so it
  // is obvious which apps the agent may use before asking a question.
  const [askAgentTools, setAskAgentTools] = useState<string[]>(() =>
    getAssignedAgentTools().map((t) => t.name),
  );
  useEffect(() => {
    const refresh = () =>
      setAskAgentTools(getAssignedAgentTools().map((t) => t.name));
    refresh();
    window.addEventListener(AGENT_TOOLS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AGENT_TOOLS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [askAgentAnchor]);

  // Builds the auto-attached context block sent with @AIAgent questions.
  // Lives as a closure so it always reads the latest scoped state.
  const buildAskAgentContext = (): string => {
    try {
      return buildAgentContextBlock({
        incident: incident
          ? {
              id: incident.id,
              title: incident.title,
              severity: (incident as any).severity,
              status: (incident as any).status,
              type: (incident as any).type,
              source: (incident as any).source,
              created: (incident as any).created,
              assignee: (incident as any).assignee,
            }
          : null,
        observables: editedObservables || [],
        enrichments: enrichments || [],
        iocObservableKeys:
          iocObservableKeys instanceof Set
            ? iocObservableKeys
            : new Set<string>(),
        correlationKeys: (visibleCorrelations || [])
          .map((c: any) => String(c?.label || c?.key || ""))
          .filter(Boolean),
        stakeholders: (editedStakeholders || []) as any,
        recentTimeline: (activity || [])
          .filter((a: any) => a && a.type !== "comment")
          .slice(-12)
          .map((a: any) => ({
            type: a.type,
            user: a.user,
            content: a.content || a.details?.summary,
            timestamp: a.timestamp,
          })),
        mergeCandidates: mergeCandidates?.candidates || [],
      });
    } catch (e) {
      console.warn("[AskAgent] Failed to build context block", e);
      return "";
    }
  };

  // Persist the draft on every change. Empty string clears the saved draft so
  // we don't leak stale content between sessions.
  useEffect(() => {
    if (!commentDraftKey || typeof window === "undefined") return;
    try {
      if (newComment) {
        window.localStorage.setItem(commentDraftKey, newComment);
      } else {
        window.localStorage.removeItem(commentDraftKey);
      }
    } catch {
      /* ignore quota / privacy mode errors */
    }
  }, [commentDraftKey, newComment]);
  // When the user clicks "Reply" on a timeline item we capture enough context
  // here to render the chip above the input AND attach the parent reference
  // to the new comment when it's submitted. Cleared after submit / cancel.
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    label: string;
    preview: string;
  } | null>(null);
  const commentInputRef = useRef<HTMLDivElement>(null);
  // Simple-view timeline feed: always parked at the newest (bottom) entry.
  const simpleFeedRef = useRef<HTMLDivElement | null>(null);
  const defaultFeedRef = useRef<HTMLDivElement | null>(null);
  const [simpleExpandedTaskIds, setSimpleExpandedTaskIds] = useState<string[]>(
    [],
  );
  const toggleSimpleTaskExpanded = (taskId: string) => {
    setSimpleExpandedTaskIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((id) => id !== taskId)
        : [...previous, taskId],
    );
  };
  const [commentUploading, setCommentUploading] = useState(false);
  const handleCommentAttach = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setCommentUploading(true);
    const newAttachments: FileAttachment[] = [];
    for (const file of Array.from(files)) {
      const result = await createAndUploadFile(
        file,
        "incidents",
        incident?.id ? [incident.id, "comments"] : ["comments"],
      );
      if (result.success && result.file) {
        newAttachments.push({
          id: result.file.id,
          filename: result.file.filename,
          filesize: result.file.filesize,
          uploadedAt: Date.now(),
        });
        toast.success(`Uploaded ${file.name}`);
      } else {
        toast.error(`Failed to upload ${file.name}: ${result.reason}`);
      }
    }
    if (newAttachments.length > 0) {
      setCommentAttachments((prev) => [...prev, ...newAttachments]);
    }
    setCommentUploading(false);
    if (commentFileInputRef.current) commentFileInputRef.current.value = "";
  };
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // Tick used to re-render the timeline so the AI processing placeholder can
  // flip into a "timed out" state once 2 minutes have elapsed without an
  // agent reply, even when no other state changes.
  const [, setAiPlaceholderTick] = useState(0);
  useEffect(() => {
    const hasPendingAgentResponse = activity.some((a: any) => {
      if (a?.ai_handled !== true) return false;
      const text = String(a?.content || "");
      // Only items that explicitly @-mention the AI Agent show a placeholder.
      if (!/@\s*ai[\s_-]*agent\b/i.test(text)) return false;
      const replied = activity.some((r: any) => {
        if (r?.replyToId !== a.id) return false;
        const u = r?.user || "";
        return /agent|ai\s*agent|aiagent/i.test(u);
      });
      return !replied;
    });
    if (!hasPendingAgentResponse) return;
    const i = setInterval(() => setAiPlaceholderTick((t) => t + 1), 15_000);
    return () => clearInterval(i);
  }, [activity]);
  /**
   * Pending soft-delete confirmation. We never hard-delete a comment — the
   * confirm dialog flips `deleted: true` on the original entity so the
   * timestamp, author and thread position survive. Set to the comment id
   * when the user clicks the delete icon; cleared on cancel/confirm.
   */
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);

  // Tasks
  const [tasks, setTasks] = useState<IncidentTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const TASKS_PER_PAGE = 25;
  const [visibleTaskCount, setVisibleTaskCount] = useState(TASKS_PER_PAGE);

  // Incident-level attachments
  const [incidentAttachments, setIncidentAttachments] = useState<
    FileAttachment[]
  >([]);

  // Description editing state
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  // Simple view: the email renderer sits above the description and starts collapsed.
  const [simpleEmailOpen, setSimpleEmailOpen] = useState(false);
  const [descriptionView, setDescriptionView] = useState<
    "rendered" | "readable" | "raw"
  >("readable");
  const [rawDescriptionHtml, setRawDescriptionHtml] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergePreselectedId, setMergePreselectedId] = useState<
    string | undefined
  >(undefined);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveTargetOrgId, setMoveTargetOrgId] = useState<string>("");
  const [moveSelectedOrgIds, setMoveSelectedOrgIds] = useState<Set<string>>(
    new Set(),
  );
  const [isMoving, setIsMoving] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [publicAuthorization, setPublicAuthorization] = useState<string>("");
  const TAB_NAMES = [
    "details",
    "tasks",
    "observables",
    "correlations",
    "raw",
    "file",
    "original",
    "simple",
  ] as const;
  const isSupportUser = useIsSupport();
  // Timeline filter — multi-select. Each key can be toggled independently.
  // Defaults: everything EXCEPT "Changes" (revisions). Revisions are noisy
  // diffs that most users don't want to see by default — the synthetic
  // "Incident created" step below is rendered unconditionally so the
  // creation marker is never hidden by this default. Persisted to
  // localStorage so the same set is restored across page loads. Substep
  // filters (`tasks`, `observables`, `correlations`) split the legacy
  // "steps" bucket so each artefact type can be hidden individually.
  type TimelineFilterKey =
    | "revisions"
    | "agent"
    | "workflows"
    | "manual"
    | "merges"
    | "tasks"
    | "observables"
    | "correlations";
  const ALL_TIMELINE_FILTERS: TimelineFilterKey[] = [
    "revisions",
    "agent",
    "workflows",
    "manual",
    "merges",
    "tasks",
    "observables",
    "correlations",
  ];
  const DEFAULT_TIMELINE_FILTERS: TimelineFilterKey[] = [
    "agent",
    "workflows",
    "manual",
    "tasks",
    "observables",
    "correlations",
  ];
  // Mobile starts with comments only — the full feed is far too dense on a
  // phone. Stored under its own key so the desktop selection is untouched.
  const MOBILE_DEFAULT_TIMELINE_FILTERS: TimelineFilterKey[] = ["manual"];
  // Bumped when the default set changes so existing localStorage entries
  // re-default rather than persist the old "all on" baseline.
  const isMobileViewport =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 599.95px)").matches;
  const TIMELINE_FILTER_STORAGE_KEY = isMobileViewport
    ? "shuffle-incident-timeline-filters-mobile-v1"
    : "shuffle-incident-timeline-filters-v5";
  const [activeTimelineFilters, setActiveTimelineFilters] = useState<
    Set<TimelineFilterKey>
  >(() => {
    const defaults = isMobileViewport
      ? MOBILE_DEFAULT_TIMELINE_FILTERS
      : DEFAULT_TIMELINE_FILTERS;
    if (typeof window === "undefined") return new Set(defaults);
    try {
      const raw = localStorage.getItem(TIMELINE_FILTER_STORAGE_KEY);
      if (!raw) return new Set(defaults);
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set(defaults);
      const valid = arr.filter((k): k is TimelineFilterKey =>
        ALL_TIMELINE_FILTERS.includes(k),
      );
      // Empty set is allowed — user explicitly hid everything.
      return new Set(valid);
    } catch {
      return new Set(defaults);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        TIMELINE_FILTER_STORAGE_KEY,
        JSON.stringify(Array.from(activeTimelineFilters)),
      );
    } catch {
      /* ignore quota */
    }
  }, [activeTimelineFilters]);
  const toggleTimelineFilter = (key: TimelineFilterKey) => {
    setActiveTimelineFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isFilterActive = (key: TimelineFilterKey) =>
    activeTimelineFilters.has(key);
  // Merge/threading audit entries live inside `activity` but should be
  // filed under their own "Threading" filter — they are not user comments.
  // Emitted by src/lib/incidentRelations.ts as { type: 'system', id: 'merge-…' | 'merge-in-…' }.
  const isMergeActivityItem = (item: any): boolean => {
    if (!item) return false;
    if (item.type === "system") {
      const id = String(item.id || "");
      if (id.startsWith("merge-") || id.startsWith("merge-in-")) return true;
      const content = String(item.content || "");
      if (/^Merged (data )?(from|into) /i.test(content)) return true;
    }
    return false;
  };
  const getMergeActivityDisplayKey = (item: any): string | null => {
    if (!isMergeActivityItem(item)) return null;
    const id = String(item.id || "");
    if (id.startsWith("merge-in-")) {
      const sourcePart = id.replace(/^merge-in-/, "").replace(/-\d{10,}$/, "");
      if (sourcePart) return `merge-in:${sourcePart.toLowerCase()}`;
    }
    const content = String(item.content || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    return content ? `merge-content:${content}` : null;
  };
  const displayActivity = useMemo(() => {
    const seenMergeKeys = new Set<string>();
    return activity.filter((item) => {
      const key = getMergeActivityDisplayKey(item);
      if (!key) return true;
      if (seenMergeKeys.has(key)) return false;
      seenMergeKeys.add(key);
      return true;
    });
  }, [activity]);
  const mergeActivity = displayActivity.filter(isMergeActivityItem);
  const commentActivity = displayActivity.filter(
    (a) => !isMergeActivityItem(a),
  );
  // Legacy compatibility shim — a few render branches used to special-case
  // the single-select "revisions" tab to relabel the oldest revision as
  // "Incident created". The equivalent in the new multi-select model is
  // "only the Changes filter is enabled".
  const isOnlyRevisionsFilter =
    activeTimelineFilters.size === 1 && activeTimelineFilters.has("revisions");
  // Timeline expand/collapse — same UX as Email Thread / Description sections.
  // Persisted per-browser so the choice survives navigation.
  const TIMELINE_COLLAPSED_STORAGE_KEY = "shuffle-incident-timeline-collapsed";
  const [timelineCollapsed, setTimelineCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(TIMELINE_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        TIMELINE_COLLAPSED_STORAGE_KEY,
        timelineCollapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [timelineCollapsed]);

  // Per-open guarantee: every time an incident detail page opens (or the
  // user navigates to a different incident), make sure AT LEAST one of
  // Email Thread or Timeline is expanded. If both are currently collapsed
  // we force-open the Timeline so the page never looks empty.
  useEffect(() => {
    if (!id) return;
    try {
      const emailOpen =
        localStorage.getItem("shuffle-incident-email-thread-open") === "1";
      const tlCollapsed =
        localStorage.getItem(TIMELINE_COLLAPSED_STORAGE_KEY) === "1";
      if (!emailOpen && tlCollapsed) {
        localStorage.setItem(TIMELINE_COLLAPSED_STORAGE_KEY, "0");
        setTimelineCollapsed(false);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Anchor for the unified Timeline filters dropdown.
  const [timelineFilterAnchor, setTimelineFilterAnchor] =
    useState<HTMLElement | null>(null);
  const [hoveredTimelineFilter, setHoveredTimelineFilter] =
    useState<TimelineFilterKey | null>(null);
  const [timelineVisibleWindow, setTimelineVisibleWindow] = useState<{
    minTs: number;
    maxTs: number;
  } | null>(null);

  const handleFilterHover = (key: TimelineFilterKey | null) => {
    if (key && !activeTimelineFilters.has(key)) {
      const container = simpleFeedRef.current || defaultFeedRef.current;
      if (container) {
        const cTop = container.scrollTop;
        const cBottom = cTop + container.clientHeight;
        const rows = Array.from(
          container.querySelectorAll<HTMLElement>("[data-timeline-timestamp]"),
        );
        let minTs = Infinity;
        let maxTs = -Infinity;
        let found = 0;
        rows.forEach((el) => {
          const elTop = el.offsetTop;
          const elHeight = el.offsetHeight || 30;
          const elBottom = elTop + elHeight;
          if (elBottom >= cTop - 60 && elTop <= cBottom + 60) {
            const ts = Number(el.getAttribute("data-timeline-timestamp"));
            if (ts && !isNaN(ts) && ts > 0) {
              if (ts < minTs) minTs = ts;
              if (ts > maxTs) maxTs = ts;
              found++;
            }
          }
        });
        if (found > 0 && minTs !== Infinity) {
          setTimelineVisibleWindow({ minTs, maxTs });
        } else {
          rows.forEach((el) => {
            const ts = Number(el.getAttribute("data-timeline-timestamp"));
            if (ts && !isNaN(ts) && ts > 0) {
              if (ts < minTs) minTs = ts;
              if (ts > maxTs) maxTs = ts;
              found++;
            }
          });
          if (found > 0 && minTs !== Infinity) {
            setTimelineVisibleWindow({ minTs, maxTs });
          } else {
            setTimelineVisibleWindow(null);
          }
        }
      } else {
        setTimelineVisibleWindow(null);
      }
    } else {
      setTimelineVisibleWindow(null);
    }
    setHoveredTimelineFilter(key);
  };
  const [revisionDialogData, setRevisionDialogData] = useState<{
    json: string;
    changedKeys: Set<string>;
  } | null>(null);
  // Remember whether the user prefers the Simple or Detailed incident view so
  // opening any incident lands on the same experience as last time.
  const VIEW_MODE_STORAGE_KEY = "shuffle-incident-view-mode";
  const readPreferredViewMode = (): "simple" | "detailed" | null => {
    try {
      const v = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      return v === "simple" || v === "detailed" ? v : null;
    } catch {
      return null;
    }
  };
  const initialTab = (() => {
    const t = searchParams.get("tab");
    if (t) {
      const idx = TAB_NAMES.indexOf(t as any);
      return idx >= 0 ? idx : 0;
    }
    const preferred = readPreferredViewMode();
    if (preferred === "simple") return 7;
    if (preferred === "detailed") return 0;
    // No stored choice yet: support users start in Simple, everyone else Detailed.
    return isSupportUser ? 7 : 0;
  })();
  const [activeTab, setActiveTabState] = useState(initialTab);
  const userInteractedTabRef = useRef(false);
  const currentIncidentIdRef = useRef(rawId);
  if (currentIncidentIdRef.current !== rawId) {
    currentIncidentIdRef.current = rawId;
    userInteractedTabRef.current = false;
  }

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab) {
      const idx = TAB_NAMES.indexOf(requestedTab as any);
      if (idx >= 0 && idx !== activeTab) {
        setActiveTabState(idx);
      }
      return;
    }

    // No explicit ?tab in URL:
    // If the user manually selected a tab for this incident in this session, do not override.
    if (userInteractedTabRef.current) return;

    const preferred = readPreferredViewMode();
    if (preferred === "simple") {
      if (activeTab !== 7) setActiveTabState(7);
    } else if (preferred === "detailed") {
      if (activeTab !== 0) setActiveTabState(0);
    } else if (preferred === null && isSupportUser) {
      // First-time visit for a support user with no stored preference: default to Simple
      if (activeTab !== 7) setActiveTabState(7);
    }
  }, [activeTab, isSupportUser, searchParams]);

  const setActiveTab = (tab: number) => {
    userInteractedTabRef.current = true;
    // Leaving the Raw OCSF tab (index 4) while previewing an older revision:
    // revert the editor back to the live incident OCSF so unsaved revision
    // previews do not persist across tab switches.
    setActiveTabState((prev) => {
      if (prev === 4 && tab !== 4 && selectedRevisionIdx !== null) {
        setRawJsonText(
          JSON.stringify((incident as any)?.rawOCSF || {}, null, 2),
        );
        setSelectedRevisionIdx(null);
      }
      // Switching tabs while scrolled to the bottom of a long tab (e.g. the
      // simple timeline) would otherwise leave the new tab scrolled past its
      // content. Always start the new tab at the top; any focus helper that
      // runs after this scrolls its own target into view.
      if (prev !== tab) {
        try {
          window.scrollTo({ top: 0, behavior: "auto" });
        } catch {
          /* ignore */
        }
      }
      return tab;
    });

    if (tab === 7 || tab === 0) {
      try {
        localStorage.setItem(
          VIEW_MODE_STORAGE_KEY,
          tab === 7 ? "simple" : "detailed",
        );
      } catch {
        /* ignore */
      }
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 7) {
          next.delete("tab");
        } else {
          next.set("tab", TAB_NAMES[tab] || "");
        }
        return next;
      },
      { replace: true },
    );
  };

  /**
   * Jump to the Observables tab and flash the row matching the given
   * `${type}::${value}` (lowercase) key. Used by clickable timeline pills so
   * the user can see exactly which observable the timeline entry refers to.
   */
  const focusObservableFromTimeline = (typeValueKey: string | null) => {
    setActiveTab(2);
    if (!typeValueKey) return;
    setFlashedObsKey(typeValueKey);
    if (flashedObsTimerRef.current) clearTimeout(flashedObsTimerRef.current);
    flashedObsTimerRef.current = setTimeout(() => setFlashedObsKey(null), 2200);
    // Defer scroll until the tab content has mounted.
    setTimeout(() => {
      try {
        const escaped =
          typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(typeValueKey)
            : typeValueKey;
        const el = document.querySelector(
          `[data-obs-highlight-key="${escaped}"]`,
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }, 80);
  };

  /**
   * Jump to the Tasks tab and scroll to the task card matching the given id.
   * Used by clickable task pills in the timeline.
   */
  const focusTaskFromTimeline = (taskId: string | null) => {
    setActiveTab(1);
    if (!taskId) return;
    setFlashedTaskId(taskId);
    if (flashedTaskTimerRef.current) clearTimeout(flashedTaskTimerRef.current);
    flashedTaskTimerRef.current = setTimeout(
      () => setFlashedTaskId(null),
      2200,
    );
    setTimeout(() => {
      try {
        const escaped =
          typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(taskId)
            : taskId;
        const el = document.querySelector(
          `[data-task-id="${escaped}"]`,
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }, 120);
  };

  /**
   * Jump to the Correlations tab and flash the row with the given
   * correlation key. When `correlationKey` is null we just switch tabs
   * (used for the "incident-level correlations" pill that has no key).
   */
  const focusCorrelationFromTimeline = (correlationKey: string | null) => {
    setActiveTab(3);
    if (correlationKey) {
      setFlashedCorrelationKey(correlationKey);
      if (flashedCorrTimerRef.current)
        clearTimeout(flashedCorrTimerRef.current);
      flashedCorrTimerRef.current = setTimeout(
        () => setFlashedCorrelationKey(null),
        2200,
      );
      setTimeout(() => {
        try {
          const escaped =
            typeof CSS !== "undefined" && CSS.escape
              ? CSS.escape(correlationKey)
              : correlationKey;
          const el = document.querySelector(
            `[data-corr-key="${escaped}"]`,
          ) as HTMLElement | null;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {}
      }, 80);
    }
  };

  /**
   * Jump to the Correlations tab and flash the linked (merged) incident row
   * with the given ID. Used by "thread-auto-merge" activity entries so
   * clicking a merge audit line takes the analyst straight to the source.
   */
  const [flashedRelatedId, setFlashedRelatedId] = useState<string | null>(null);
  const flashedRelatedTimerRef = useRef<any>(null);
  const focusRelatedIncident = (relatedId: string | null) => {
    setActiveTab(3);
    if (!relatedId) return;
    setFlashedRelatedId(relatedId);
    if (flashedRelatedTimerRef.current)
      clearTimeout(flashedRelatedTimerRef.current);
    flashedRelatedTimerRef.current = setTimeout(
      () => setFlashedRelatedId(null),
      2200,
    );
    setTimeout(() => {
      try {
        const escaped =
          typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(relatedId)
            : relatedId;
        const el = document.querySelector(
          `[data-related-id="${escaped}"]`,
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }, 120);
  };

  /**
   * Demo-style "Ask the agent" affordance: when the user clicks a Known IOC
   * pill on the Timeline, prefill the comment input with an @agent question
   * about that observable, switch to the Details/Timeline tab so the input
   * is visible, then focus and scroll to it. The user just hits Enter to
   * actually send — they're never tricked into sending something they didn't
   * see. This makes it obvious the AI agent is real and reachable from any
   * observable, not just a label in the sidebar.
   */
  const askAgentAboutObservable = (obsKey: string) => {
    const sepIdx = obsKey.indexOf("::");
    const type = sepIdx > -1 ? obsKey.slice(0, sepIdx) : "";
    const value = sepIdx > -1 ? obsKey.slice(sepIdx + 2) : obsKey;
    const labelType = type ? type.toUpperCase() : "observable";
    const prompt = `@agent This ${labelType} \`${value}\` is flagged as a Known IOC on the timeline. What do we know about it (threat-feed sources, related campaigns), and what should we do next — block, isolate, or investigate further?`;
    setActiveTab(0);
    setNewComment((cur) => (cur && cur.trim() ? cur : prompt));
    setTimeout(() => {
      const wrapper = document.querySelector(
        '[data-tour="incident-comment-input"]',
      ) as HTMLElement | null;
      if (!wrapper) return;
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = wrapper.querySelector("textarea, input") as
        HTMLTextAreaElement | HTMLInputElement | null;
      if (input) {
        input.focus();
        try {
          const len = (input.value || "").length;
          (input as HTMLTextAreaElement).setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      }
    }, 120);
    try {
      // toast suppressed during demo (distracting)
    } catch {
      /* ignore */
    }
  };

  /**
   * Demo tour hook: when the user clicks the "Ask the agent a question"
   * sub-goal pill in the DemoTourDrawer, prefill the comment input with a
   * sample @AIAgent message so they only have to hit Enter to send. Same
   * UX pattern as askAgentAboutObservable but triggered from the drawer.
   */
  useEffect(() => {
    const onInject = () => {
      const sample =
        "@AIAgent What should I do next with this incident? Are there other indicators I should look at?";
      setActiveTab(0);
      setNewComment((cur) => (cur && cur.trim() ? cur : sample));
      setTimeout(() => {
        const wrapper = document.querySelector(
          '[data-tour="incident-comment-input"]',
        ) as HTMLElement | null;
        if (!wrapper) return;
        wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = wrapper.querySelector("textarea, input") as
          HTMLTextAreaElement | HTMLInputElement | null;
        if (input) {
          input.focus();
          try {
            const len = (input.value || "").length;
            (input as HTMLTextAreaElement).setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
        }
      }, 120);
      try {
        // toast suppressed during demo (distracting)
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("demo:inject-agent-mention", onInject);
    return () =>
      window.removeEventListener("demo:inject-agent-mention", onInject);
  }, []);

  const [rawJsonText, setRawJsonText] = useState("");
  const forceRawReloadRef = useRef(false);
  const [rawJsonValid, setRawJsonValid] = useState(true);
  // File editor state
  const [fileContent, setFileContent] = useState("");
  const [fileJsonValid, setFileJsonValid] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoaded, setFileLoaded] = useState(false);

  // Revisions (Changes tab)
  const [revisions, setRevisions] = useState<any[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsLoaded, setRevisionsLoaded] = useState(false);

  // Revisions that produce an empty diff (no-op writes) are never rendered in
  // the timeline, so the "Changes" filter count must exclude them too —
  // otherwise the count disagrees with the highest visible "Change #N".
  const visibleRevisionCount = useMemo(() => {
    if (!revisions.length) return 0;
    const NOISE = new Set([
      "activity",
      "updated_by",
      "edited_time",
      "updated_at",
      "last_updated",
      "comments",
    ]);
    const parsed = revisions.map((rev) => {
      try {
        return typeof rev.value === "string"
          ? JSON.parse(rev.value)
          : rev.value;
      } catch {
        return null;
      }
    });
    const hasChanges = (current: any, previous: any): boolean => {
      if (!current || !previous) return true;
      const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
      for (const key of keys) {
        if (NOISE.has(key)) continue;
        const inC = key in current;
        const inP = key in previous;
        if (inC !== inP) return true;
        if (
          inC &&
          inP &&
          JSON.stringify(current[key]) !== JSON.stringify(previous[key])
        )
          return true;
      }
      return false;
    };
    let count = 0;
    for (let i = revisions.length - 1; i >= 0; i--) {
      const prev = i < revisions.length - 1 ? parsed[i + 1] : null;
      const hidden =
        !isOnlyRevisionsFilter &&
        i !== revisions.length - 1 &&
        !!prev &&
        !hasChanges(parsed[i], prev);
      if (!hidden) count += 1;
    }
    return count;
  }, [revisions, isOnlyRevisionsFilter]);
  const [selectedRevisionIdx, setSelectedRevisionIdx] = useState<number | null>(
    null,
  );
  // Set once the user explicitly restores an older revision. While true, the
  // background reconstruction passes (OCSF revision folding, relation
  // reconciliation) are skipped for this page session — otherwise they would
  // immediately fold dropped fields (activity, pointers) back in and the
  // rollback would look like it never happened.
  const revisionRestoredRef = useRef(false);

  // "Not found" fallback: the live datastore lookup can come back empty when
  // the item write timed out upstream. Before showing a dead end, check the
  // revision history for the SAME key. We never auto-restore — the user
  // decides whether to bring the snapshot back.
  const [notFoundRevision, setNotFoundRevision] = useState<{
    timestamp?: number;
    count: number;
    title?: string;
    value: any;
  } | null>(null);
  const [notFoundRevisionLoading, setNotFoundRevisionLoading] = useState(false);
  const [notFoundRestoring, setNotFoundRestoring] = useState(false);
  const notFoundRevisionCheckedRef = useRef(false);

  // Tracks an OCSF-recovery fallback: when the live incident is not OCSF-shaped,
  // we look back through revisions for the most recent valid OCSF snapshot and
  // overlay any new top-level fields from the latest (non-OCSF but valid JSON)
  // revision on top of it. The banner explains this to the user.
  const [ocsfFallbackInfo, setOcsfFallbackInfo] = useState<{
    revisionTimestamp?: number;
    overlaidFieldCount: number;
    reason: "not-ocsf" | "missing-fields";
    // Fields that were missing on the live payload before reconstruction.
    missingFields: string[];
    // Fields still missing AFTER folding revisions into the reconstruction.
    // Only these should be surfaced as "missing" in the UI — anything the
    // recovery could refill is no longer a concern for the reader.
    stillMissingFields: string[];
    recoveredValue?: string;
  } | null>(null);
  const [ocsfRestoring, setOcsfRestoring] = useState(false);
  const ocsfFallbackAttemptedRef = useRef(false);
  const ocsfFallbackDismissKey = id ? `ocsf-fallback-dismissed:${id}` : "";
  const [ocsfFallbackDismissed, setOcsfFallbackDismissed] = useState<boolean>(
    () => {
      if (!ocsfFallbackDismissKey || typeof window === "undefined")
        return false;
      try {
        return localStorage.getItem(ocsfFallbackDismissKey) === "1";
      } catch {
        return false;
      }
    },
  );
  useEffect(() => {
    if (!ocsfFallbackDismissKey || typeof window === "undefined") return;
    try {
      setOcsfFallbackDismissed(
        localStorage.getItem(ocsfFallbackDismissKey) === "1",
      );
    } catch {
      /* ignore */
    }
  }, [ocsfFallbackDismissKey]);
  const dismissOcsfFallback = () => {
    setOcsfFallbackDismissed(true);
    if (ocsfFallbackDismissKey) {
      try {
        localStorage.setItem(ocsfFallbackDismissKey, "1");
      } catch {
        /* ignore */
      }
    }
  };

  // Restore the last known-good OCSF payload discovered by the fallback
  // recovery. Writes the recovered snapshot back to the datastore so the
  // stored item stops being "broken" for other users as well, then reloads
  // the incident state from the server.
  const handleRestoreOcsfFallback = async (silent = false) => {
    if (!id || !ocsfFallbackInfo?.recoveredValue || ocsfRestoring) return;
    setOcsfRestoring(true);
    try {
      let parsedRecovered: any;
      try {
        parsedRecovered = JSON.parse(ocsfFallbackInfo.recoveredValue);
      } catch (err) {
        if (!silent) toast.error("Could not parse the recovered snapshot");
        setOcsfRestoring(false);
        return;
      }
      const res = await writeIncidentSafe(
        id,
        parsedRecovered,
        crossOrgId || undefined,
      );
      if (!res.success) {
        if (!silent)
          toast.error(res.error || "Failed to restore the previous version");
        setOcsfRestoring(false);
        return;
      }
      if (!silent)
        toast.success("Incident restored from the last known-good version");
      dismissOcsfFallback();
      // Reset the fallback attempt so a fresh load re-validates the payload.
      ocsfFallbackAttemptedRef.current = false;
      setOcsfFallbackInfo(null);
      await loadIncident(false);
    } catch (err) {
      if (!silent)
        toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setOcsfRestoring(false);
    }
  };

  const loadRevisions = useCallback(async () => {
    if (!id) return;
    setRevisionsLoading(true);
    try {
      const categoryKey = DATASTORE_CATEGORIES.INCIDENTS;
      const response = await fetch(
        getApiUrl(
          `/api/v2/datastore/category/${encodeURIComponent(categoryKey)}/${encodeURIComponent(id)}/revisions`,
        ),
        {
          credentials: "include",
          headers: {
            ...getAuthHeader(),
            ...(crossOrgId ? { "Org-Id": crossOrgId } : {}),
          },
        },
      );
      if (response.ok) {
        const result = await response.json();
        const rawRevisions: any[] = Array.isArray(result)
          ? result
          : result.data || result.revisions || [];

        // Always sort revisions by normalized timestamp (newest first)
        const sorted = [...rawRevisions].sort(
          (a: any, b: any) =>
            normalizeToMs(b.edited ?? b.created) -
            normalizeToMs(a.edited ?? a.created),
        );

        // Deduplicate by the canonical revision payload. The API can return
        // the same snapshot more than once with different revision ids or
        // timestamps, while every revision also shares the same datastore key.
        // Keep the newest copy of each unique snapshot and show it once.
        const fingerprintFor = (rev: any): string => {
          return `payload:${cheapHash(stableRevisionValueString(rev?.value))}`;
        };

        const seenFingerprints = new Set<string>();
        const seenRevisionIds = new Set<string>();
        const deduped: any[] = [];
        for (const rev of sorted) {
          const explicitId = rev?.revision_id || rev?.revisionId || rev?.id;
          if (explicitId && seenRevisionIds.has(String(explicitId))) continue;
          const fp = fingerprintFor(rev);
          if (seenFingerprints.has(fp)) continue;
          if (explicitId) seenRevisionIds.add(String(explicitId));
          seenFingerprints.add(fp);
          deduped.push(rev);
        }

        setRevisions(deduped);
      } else {
        console.error("[Changes] Failed to load revisions:", response.status);
        setRevisions([]);
      }
    } catch (err) {
      console.error("[Changes] Error loading revisions:", err);
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
      setRevisionsLoaded(true);
    }
  }, [id, crossOrgId]);

  // Sanitized HTML for safe rendering of ingested HTML descriptions (email-client style)
  const sanitizedDescriptionHtml = useMemo(() => {
    if (!rawDescriptionHtml) return "";
    // Check if it actually contains HTML tags
    if (!/<[a-z][\s\S]*>/i.test(rawDescriptionHtml)) return "";
    return DOMPurify.sanitize(rawDescriptionHtml, {
      ALLOWED_TAGS: [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "br",
        "hr",
        "b",
        "i",
        "u",
        "strong",
        "em",
        "small",
        "sub",
        "sup",
        "s",
        "mark",
        "ul",
        "ol",
        "li",
        "dl",
        "dt",
        "dd",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "th",
        "td",
        "caption",
        "colgroup",
        "col",
        "a",
        "img",
        "figure",
        "figcaption",
        "blockquote",
        "pre",
        "code",
        "span",
        "div",
        "section",
      ],
      ALLOWED_ATTR: [
        "href",
        "src",
        "alt",
        "title",
        "width",
        "height",
        "style",
        "class",
        "align",
        "valign",
        "colspan",
        "rowspan",
        "border",
        "cellpadding",
        "cellspacing",
        "role",
        "target",
        "rel",
      ],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ["target"],
      FORBID_TAGS: [
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "select",
        "textarea",
      ],
      FORBID_ATTR: [
        "onerror",
        "onclick",
        "onload",
        "onmouseover",
        "onfocus",
        "onblur",
      ],
    });
  }, [rawDescriptionHtml]);
  const hasHtmlDescription = sanitizedDescriptionHtml.length > 0;

  // Hoisted here so automation-status hooks below can scope to every tenant
  // this incident lives in (primary + shared). Populated by the effect further
  // down that probes for shared copies across sub-tenants.
  const [sharedOrgs, setSharedOrgs] = useState<
    Array<{ id: string; name: string; image?: string }>
  >([]);

  // Validate automation status against every tenant this incident lives in
  // (primary + shared), so a copy in tenant A that lacks enrichment still
  // surfaces the CTA even when the active session is on tenant B. `enable()`
  // will run against every tenant currently missing the automation.
  const incidentOrgIds = useMemo(() => {
    const ids: string[] = [];
    const primary = crossOrgId || userInfo?.active_org?.id;
    if (primary) ids.push(primary);
    for (const so of sharedOrgs) {
      if (so?.id && !ids.includes(so.id)) ids.push(so.id);
    }
    return ids;
  }, [crossOrgId, userInfo?.active_org?.id, sharedOrgs]);
  const enrichmentStatus = useEnrichmentStatus(undefined, {
    orgIds: incidentOrgIds,
  });
  const assignEscalateStatus = useAssignEscalateStatus({
    orgIds: incidentOrgIds,
  });
  // ── Inline enrichment CTA visibility ───────────────────────────────────
  // Surface the same "Automatic observable extraction is not yet fully
  // enabled" CTA used on the Observables tab inside the Timeline / chat
  // area whenever the user is most likely to notice things being "missing":
  //   1. The incident is fresh (created within the last 3 minutes), so the
  //      first wave of observables / correlations would normally still be
  //      streaming in.
  //   2. A comment was posted in the last 30 seconds — fresh chat = fresh
  //      expectations of automated follow-up.
  //   3. The user is currently typing in the comment input — they should
  //      always be able to enable enrichment without leaving the incident.
  const FRESH_INCIDENT_CTA_MS = 3 * 60 * 1000;
  const FRESH_COMMENT_CTA_MS = 30 * 1000;
  const lastManualCommentTs = useMemo(() => {
    let max = 0;
    for (const item of activity || []) {
      const ts = normalizeToMs(
        (item as { timestamp?: number | string }).timestamp,
      );
      if (ts > max) max = ts;
    }
    return max;
  }, [activity]);
  const incidentAgeMs = incident?.createdTs
    ? nowTick - normalizeToMs(incident.createdTs)
    : Infinity;
  const lastCommentAgeMs = lastManualCommentTs
    ? nowTick - lastManualCommentTs
    : Infinity;
  // NOTE: this banner deliberately does NOT react to typing. It sits above the
  // comment input, so toggling it on the first keystroke shifted all content
  // below it and made the page appear to jump/scroll while writing.
  const showEnrichmentInlineCTA =
    !enrichmentStatus.isLoading &&
    !enrichmentStatus.active &&
    (incidentAgeMs < FRESH_INCIDENT_CTA_MS ||
      lastCommentAgeMs < FRESH_COMMENT_CTA_MS);
  // Keep nowTick advancing while a time-based window is in play so the
  // banner auto-hides without requiring a re-render from elsewhere.
  useEffect(() => {
    if (enrichmentStatus.active || enrichmentStatus.isLoading) return;
    const incidentWindowOpen = incidentAgeMs < FRESH_INCIDENT_CTA_MS;
    const commentWindowOpen = lastCommentAgeMs < FRESH_COMMENT_CTA_MS;
    if (!incidentWindowOpen && !commentWindowOpen) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [
    enrichmentStatus.active,
    enrichmentStatus.isLoading,
    incidentAgeMs,
    lastCommentAgeMs,
    FRESH_INCIDENT_CTA_MS,
    FRESH_COMMENT_CTA_MS,
  ]);

  const renderEnrichmentInlineCTA = (simple = false) => (
    <Box
      sx={{
        display: "flex",
        flexDirection: simple ? "column" : "row",
        alignItems: simple ? "flex-start" : "center",
        gap: simple ? 1 : 1.5,
        ...(simple ? { mb: 1 } : { mx: 2, mt: 2 }),
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        bgcolor: "rgba(251, 146, 60, 0.08)",
        border: "1px solid rgba(251, 146, 60, 0.18)",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: "#fb923c",
          fontWeight: 500,
          lineHeight: 1.3,
          ...(simple ? {} : { flex: 1 }),
        }}
      >
        Automatic observable extraction is not yet fully enabled — observables
        and correlations may be missing from this incident.
      </Typography>
      <Tooltip
        title={
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              py: 0.5,
              maxWidth: 360,
            }}
          >
            {enrichmentStatus.checks.map((c) => (
              <Box
                key={c.label}
                sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <CheckCircleIcon
                    size={13}
                    style={{
                      color: c.active
                        ? "hsl(var(--severity-low))"
                        : "hsl(var(--destructive))",
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                  >
                    {c.label}
                  </Typography>
                </Box>
                {isSupportUser && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.65rem",
                      color: "rgba(255,255,255,0.7)",
                      pl: 2.5,
                      lineHeight: 1.3,
                    }}
                  >
                    {c.detail}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        }
        arrow
      >
        <Button
          size="small"
          variant="contained"
          disabled={enrichmentStatus.isEnabling}
          onClick={enrichmentStatus.enable}
          sx={{
            textTransform: "none",
            fontSize: "0.72rem",
            fontWeight: 600,
            height: 26,
            minWidth: 70,
            bgcolor: "#fb923c",
            color: "#fff",
            boxShadow: "none",
            "&:hover": { bgcolor: "#f97316", boxShadow: "none" },
            "&.Mui-disabled": {
              bgcolor: "rgba(251, 146, 60, 0.4)",
              color: "#fff",
            },
          }}
        >
          {enrichmentStatus.isEnabling ? (
            <CircularProgress size={14} sx={{ color: "#fff" }} />
          ) : (
            "Enable"
          )}
        </Button>
      </Tooltip>
    </Box>
  );

  const incidentFileRef = useMemo(() => {
    const raw = incident?.rawOCSF;
    if (!raw?.shuffle_translation_file) return null;
    const fileId = String(raw.shuffle_translation_file).trim();
    if (!fileId) return null;
    return fileId;
  }, [incident?.rawOCSF]);

  const isFileUUID = (id: string) =>
    /^file_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    );

  // Resolve non-UUID file references by looking up the namespace listing
  const [resolvedFileId, setResolvedFileId] = useState<string | null>(null);
  const [fileIdResolved, setFileIdResolved] = useState(false);

  useEffect(() => {
    if (!incidentFileRef) {
      setResolvedFileId(null);
      setFileIdResolved(true);
      return;
    }
    if (isFileUUID(incidentFileRef)) {
      setResolvedFileId(incidentFileRef);
      setFileIdResolved(true);
      return;
    }
    // Need to resolve via namespace listing
    setFileIdResolved(false);
    const resolve = async () => {
      try {
        const resp = await fetch(
          getApiUrl("/api/v1/files/namespaces/translation_output?ids=true"),
          {
            credentials: "include",
            headers: { ...getAuthHeader(), ...crossOrgHeaders },
          },
        );
        if (!resp.ok) {
          setResolvedFileId(null);
          setFileIdResolved(true);
          return;
        }
        const data = await resp.json();
        const list: Array<{ id?: string; name?: string }> =
          data?.list || data || [];
        // Match by name (with or without .json extension)
        const match = list.find((f: any) => {
          const name = f.name || "";
          return (
            name === incidentFileRef ||
            name === `${incidentFileRef}.json` ||
            name.replace(/\.json$/, "") === incidentFileRef
          );
        });
        setResolvedFileId(match?.id || null);
      } catch {
        setResolvedFileId(null);
      } finally {
        setFileIdResolved(true);
      }
    };
    resolve();
  }, [incidentFileRef]);

  // Check if unmapped_original exists in the raw OCSF data
  const unmappedOriginal = useMemo(() => {
    const raw = incident?.rawOCSF;
    if (!raw?.unmapped_original) return null;
    return raw.unmapped_original;
  }, [incident?.rawOCSF]);

  // Load file content when File tab is activated
  const loadFileContent = useCallback(async () => {
    if (!resolvedFileId) return;
    setFileLoading(true);
    setFileError(null);
    try {
      const resp = await fetch(
        getApiUrl(`/api/v1/files/${resolvedFileId}/content`),
        {
          credentials: "include",
          headers: { ...getAuthHeader(), ...crossOrgHeaders },
        },
      );
      if (!resp.ok) throw new Error(`Failed to load file (${resp.status})`);
      const text = await resp.text();
      // Sort keys alphabetically to match the { } tab output
      try {
        const parsed = JSON.parse(text);
        const sortKeys = (obj: any): any => {
          if (Array.isArray(obj)) return obj.map(sortKeys);
          if (obj && typeof obj === "object") {
            return Object.keys(obj)
              .sort()
              .reduce((acc: any, key: string) => {
                acc[key] = sortKeys(obj[key]);
                return acc;
              }, {});
          }
          return obj;
        };
        setFileContent(JSON.stringify(sortKeys(parsed), null, 2));
      } catch {
        setFileContent(text);
      }
      setFileLoaded(true);
    } catch (e: any) {
      setFileError(e.message || "Failed to load file");
    } finally {
      setFileLoading(false);
    }
  }, [resolvedFileId]);

  useEffect(() => {
    if (activeTab === 5 && resolvedFileId && !fileLoaded) {
      loadFileContent();
    }
  }, [activeTab, resolvedFileId, fileLoaded, loadFileContent]);

  // Auto-load revisions when incident finishes loading, then poll every 60s
  useEffect(() => {
    if (!loading && id && !revisionsLoaded) {
      loadRevisions();
    }
  }, [loading, id, revisionsLoaded, loadRevisions]);

  useEffect(() => {
    if (!id || loading) return;
    const interval = setInterval(() => {
      loadRevisions();
    }, 60_000);
    return () => clearInterval(interval);
  }, [id, loading, loadRevisions]);

  // Fallback lookup when the incident itself cannot be found: the same key may
  // still exist in the revision history (typical when the last write timed
  // out). Look it up so we can offer the user a manual restore. Nothing is
  // written automatically.
  useEffect(() => {
    if (loading || incident || isPublicView || !id) return;
    if (loadDebug?.stage === "fetch-error" || loadDebug?.stage === "no-success")
      return;
    if (notFoundRevisionCheckedRef.current) return;
    notFoundRevisionCheckedRef.current = true;
    let cancelled = false;
    (async () => {
      setNotFoundRevisionLoading(true);
      try {
        const categoryKey = DATASTORE_CATEGORIES.INCIDENTS;
        const response = await fetch(
          getApiUrl(
            `/api/v2/datastore/category/${encodeURIComponent(categoryKey)}/${encodeURIComponent(id)}/revisions`,
          ),
          {
            credentials: "include",
            headers: {
              ...getAuthHeader(),
              ...(crossOrgId ? { "Org-Id": crossOrgId } : {}),
            },
          },
        );
        if (!response.ok) return;
        const result = await response.json();
        const rawRevisions: any[] = Array.isArray(result)
          ? result
          : result.data || result.revisions || [];
        const sorted = [...rawRevisions].sort(
          (a: any, b: any) =>
            normalizeToMs(b.edited ?? b.created) -
            normalizeToMs(a.edited ?? a.created),
        );
        // Newest revision whose payload actually parses into something usable.
        const usable = sorted
          .map((rev) => ({ rev, parsed: parseRevisionValue(rev?.value) }))
          .find((entry) => entry.parsed && typeof entry.parsed === "object");
        if (cancelled || !usable) return;
        const p: any = usable.parsed;
        const fi = p.finding_info_list?.[0] || p.finding_info || {};
        setNotFoundRevision({
          timestamp:
            normalizeToMs(usable.rev?.edited ?? usable.rev?.created) ||
            undefined,
          count: sorted.length,
          title: p.title || fi.title || undefined,
          value: p,
        });
      } catch {
        /* ignore — the not-found screen stays as-is */
      } finally {
        if (!cancelled) setNotFoundRevisionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, incident, isPublicView, id, loadDebug?.stage, crossOrgId]);

  // Manual restore from the not-found revision fallback. User-initiated only.
  const handleRestoreFromNotFoundRevision = async () => {
    if (!id || !notFoundRevision?.value || notFoundRestoring) return;
    setNotFoundRestoring(true);
    try {
      const res = await writeIncidentSafe(
        id,
        notFoundRevision.value,
        crossOrgId || undefined,
      );
      if (!res.success) {
        toast.error(res.error || "Failed to restore this version");
        return;
      }
      toast.success("Incident restored from its last revision");
      setNotFoundRevision(null);
      notFoundRevisionCheckedRef.current = false;
      retryFullLoad();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore this version",
      );
    } finally {
      setNotFoundRestoring(false);
    }
  };

  const [forwardingApps, setForwardingApps] = useState<
    Array<{
      id: string;
      name: string;
      large_image: string;
      categories: string[];
    }>
  >([]);
  const [forwardingAppsLoading, setForwardingAppsLoading] = useState(false);
  const sourceAppImage = useSourceAppImage(
    incident?.source ?? null,
    crossOrgId,
  );

  // Reload authenticated tools every time the Forward dialog opens so newly
  // connected tools (e.g. just-authenticated email apps) appear immediately.
  useEffect(() => {
    if (!showForwardDialog) return;
    let cancelled = false;
    setForwardingAppsLoading(true);
    fetch(getApiUrl("/api/v1/apps/authentication"), {
      credentials: "include",
      headers: { ...getAuthHeader(), ...crossOrgHeaders },
    })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled) return;
        const authData = result.data || result;
        if (Array.isArray(authData)) {
          const seen = new Set<string>();
          const apps = authData
            .filter((a: any) => a.app?.name && a.validation?.valid)
            .filter((a: any) => {
              if (seen.has(a.app.name)) return false;
              seen.add(a.app.name);
              return true;
            })
            .map((a: any) => {
              const rawCategories =
                a.app?.categories ??
                a.categories ??
                a.app?.category ??
                a.category ??
                [];
              const categories = Array.isArray(rawCategories)
                ? rawCategories
                : typeof rawCategories === "string"
                  ? [rawCategories]
                  : typeof rawCategories === "object" && rawCategories !== null
                    ? Object.keys(rawCategories)
                    : [];
              return {
                id: a.app.name,
                name: (a.app.name || "")
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c: string) => c.toUpperCase()),
                large_image: a.app.large_image || "",
                categories,
              };
            });
          setForwardingApps(apps);
        }
      })
      .catch(() => {
        if (!cancelled) setForwardingApps([]);
      })
      .finally(() => {
        if (!cancelled) setForwardingAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForwardDialog]);
  const [correlations, setCorrelations] = useState<
    Array<{ key: string; amount: number; ref: string[] }>
  >([]);
  // Live ref to the latest incident snapshot — used by fetchCorrelations to
  // persist correlation_first_seen without taking `incident` as a dep
  // (which would cause refetch loops every time the incident state changes).
  const incidentRef = useRef<{ rawOCSF?: Record<string, unknown> } | null>(
    null,
  );
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  // Per-correlation "first seen" timestamps (epoch ms), keyed by correlation
  // key. Persisted under metadata.extensions.custom_attributes.correlation_first_seen
  // so the timeline stays stable across reloads / sessions without storing
  // the full correlation payload (which is fetched live from /api/v2/correlations).
  const [correlationFirstSeen, setCorrelationFirstSeen] = useState<
    Record<string, number>
  >({});
  // Discovery time used to anchor the aggregated "N Correlations" pill on the
  // timeline. Derived from the earliest persisted first-seen stamp; falls
  // back to Date.now() the very first time we see correlations and haven't
  // persisted anything yet.
  const [correlationsDiscoveredAt, setCorrelationsDiscoveredAt] = useState<
    number | null
  >(null);
  const [obsCorrelations, setObsCorrelations] = useState<
    Record<
      string,
      {
        loading: boolean;
        data: Array<{ key: string; amount: number; ref: string[] }>;
        discoveredAt?: number;
      }
    >
  >({});
  const [obsCorrelationAnchor, setObsCorrelationAnchor] = useState<{
    el: HTMLElement;
    obsKey: string;
  } | null>(null);
  // Set of `${type}::${value}` (lowercase) observable keys whose correlations
  // include at least one ref into a known IOC / threat-feed datastore. Used to
  // surface a red "Known IOC" treatment everywhere the observable appears
  // (Observables tab, timeline pills, drawers).
  const iocObservableKeys = useMemo(() => {
    const set = new Set<string>();
    Object.entries(obsCorrelations).forEach(([obsKey, entry]) => {
      if (!entry?.data?.length) return;
      if (entry.data.some(hasIocMatch)) set.add(obsKey.toLowerCase());
    });
    if (isDemoActive()) {
      editedObservables.forEach((o) => {
        const val = (o.value || "").toLowerCase();
        if (
          val === "185.220.101.47" ||
          val.includes("it-support-portal.live") ||
          val.includes("mfa-reset")
        ) {
          set.add(`${(o.type || "").toLowerCase()}::${val}`);
          set.add(val);
        }
      });
    }
    return set;
  }, [obsCorrelations, editedObservables]);
  // Filtered view of correlations that drops any whose key matches an
  // ignored observable value. Used by every "Correlations (N)" badge and the
  // timeline so the count agrees with what the user actually sees.
  // Unify the two correlation sources we have on the page so the
  // Correlations tab — and every count/badge derived from it — sees the
  // SAME set the per-observable inline lookups already see:
  //
  //  1. `correlations` — incident-level buckets returned by the backend
  //     for `{ type: 'datastore', key: incident.id }`. Authoritative when
  //     present, but can lag because the backend hasn't yet linked a
  //     freshly-seen value back to this incident's record.
  //  2. `obsCorrelations` — live per-value lookups (`{ type: 'value', key }`)
  //     that drive the "1 corr" badge on each observable row. These can
  //     surface matches before #1 catches up.
  //
  // Merge by correlation key, unioning `ref` lists and taking the max
  // `amount` so a value-hit never reduces a richer datastore-hit. Filter
  // out entries the user has chosen to ignore.
  const correlationVisibilityOptions = useMemo(
    () => ({
      currentIncidentId: id,
      isValueIgnored: ignoredObs.isValueIgnored,
    }),
    [id, ignoredObs.isValueIgnored],
  );

  const mergedCorrelations = useMemo(() => {
    const merged = new Map<
      string,
      { key: string; amount: number; ref: string[] }
    >();
    const add = (c: { key: string; amount: number; ref: string[] }) => {
      if (!c?.key) return;
      const k = String(c.key).toLowerCase();
      const existing = merged.get(k);
      if (!existing) {
        merged.set(k, {
          key: c.key,
          amount: c.amount || (c.ref?.length ?? 0),
          ref: [...(c.ref || [])],
        });
        return;
      }
      const refSet = new Set(existing.ref);
      (c.ref || []).forEach((r) => refSet.add(r));
      existing.ref = Array.from(refSet);
      existing.amount = Math.max(
        existing.amount || 0,
        c.amount || 0,
        existing.ref.length,
      );
    };
    correlations.forEach(add);
    Object.values(obsCorrelations).forEach((entry) =>
      (entry?.data || []).forEach(add),
    );
    if (isDemoActive() && id) {
      const demoCorrs = getDemoCorrelations(id, editedObservables);
      demoCorrs.forEach(add);
    }
    return Array.from(merged.values());
  }, [correlations, obsCorrelations, id, editedObservables]);

  const visibleCorrelations = useMemo(
    () =>
      filterMeaningfulCorrelations(
        mergedCorrelations,
        correlationVisibilityOptions,
      ),
    [mergedCorrelations, correlationVisibilityOptions],
  );

  // Correlations the user has hidden but that would otherwise show — revealed
  // by the "Show hidden" toggle so hiding is always reversible.
  const hiddenCorrelations = useMemo(
    () =>
      filterMeaningfulCorrelations(
        mergedCorrelations.filter((c) =>
          ignoredObs.isValueIgnored(String(c.key || "")),
        ),
        { currentIncidentId: id },
      ),
    [mergedCorrelations, ignoredObs, id],
  );

  // What the Correlations tab actually renders — hidden rows appear (dimmed)
  // when the shared "show ignored" toggle is on.
  const correlationRows = useMemo(
    () =>
      showIgnoredObs
        ? [...visibleCorrelations, ...hiddenCorrelations]
        : visibleCorrelations,
    [showIgnoredObs, visibleCorrelations, hiddenCorrelations],
  );

  // ---------------------------------------------------------------------
  // Merge candidate suggestions
  //
  // Build the input signal sets — observable keys, correlation keys, and
  // the subset that we already know matches a known IOC. Each is wrapped
  // in `useMemo` so identity only changes when the underlying data does;
  // that keeps the candidate scoring inside `useMergeCandidates` stable
  // while correlations stream in over time.
  // ---------------------------------------------------------------------
  const currentObservableKeys = useMemo(() => {
    const set = new Set<string>();
    (incident?.observables || []).forEach((o: any) => {
      if (!o?.value || !o?.type) return;
      set.add(
        `${String(o.type).toLowerCase()}::${String(o.value).toLowerCase()}`,
      );
    });
    return set;
  }, [incident?.observables]);

  const currentCorrelationKeys = useMemo(() => {
    const set = new Set<string>();
    visibleCorrelations.forEach((c) => set.add(String(c.key).toLowerCase()));
    return set;
  }, [visibleCorrelations]);

  const mergeCandidates = useMergeCandidates({
    currentIncidentId: incident?.id,
    currentTitle: incident?.title || "",
    currentObservableKeys,
    currentCorrelationKeys,
    currentIocKeys: iocObservableKeys,
    enabled: !!incident?.id && !isPublicView,
  });

  // Cross-referenced merges: fetch the primary (if this incident is merged
  // into another) and the incidents that were merged INTO this one.
  const relatedIncidents = useRelatedIncidents(incident?.id, incident?.rawOCSF);
  const primaryPointer = useMemo(
    () => getPrimaryPointer(incident?.rawOCSF),
    [incident?.rawOCSF],
  );

  // Auto-repair: when the stored payload drifted from OCSF but a known-good
  // reconstruction exists, write it back silently instead of nagging the user
  // with a warning banner. Skipped for read-only / merged-pointer views.
  const ocsfAutoRestoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !ocsfFallbackInfo?.recoveredValue) return;
    if (isPublicView || primaryPointer || ocsfRestoring) return;
    if (ocsfAutoRestoredRef.current === id) return;
    // Freshly created incidents have nothing meaningful to roll back to.
    const createdMs = incident?.createdTs || 0;
    if (createdMs && Date.now() - createdMs < 10 * 60 * 1000) return;
    ocsfAutoRestoredRef.current = id;
    void handleRestoreOcsfFallback(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ocsfFallbackInfo, isPublicView, primaryPointer]);

  // Thread-correlated incidents: when the current payload has a thread_id,
  // pull in every other incident that shares the value via the correlations
  // API. Read-only surface — does not write pointers.
  const threadCorrelated = useThreadCorrelatedIncidents(
    incident?.id,
    incident?.rawOCSF,
    crossOrgHeaders,
  );
  const localEmailThreadMessageCount = useMemo(
    () => getLocalEmailThreadMessageCount(incident?.rawOCSF),
    [incident?.rawOCSF],
  );

  // Auto-merge state — busy flag for the "Auto-merge into latest" CTA in
  // the thread banner.
  const [autoMergeBusy, setAutoMergeBusy] = useState(false);

  /**
   * Pull the freshest "when did something happen" timestamp out of a raw
   * incident payload. Providers land it in different places — try the
   * common ones and fall back to 0 so untimestamped rows sort last.
   */
  const readIncidentTimestamp = useCallback((raw: any): number => {
    if (!raw || typeof raw !== "object") return 0;
    const candidates: unknown[] = [
      raw.modified_time_dt,
      raw.updated_time_dt,
      raw.updated_at,
      raw.modified_at,
      raw.time_dt,
      raw.time,
      raw.event_time,
      raw.created_time_dt,
      raw.created_time,
      raw.created_at,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        // Heuristic: seconds vs ms.
        return c < 1e12 ? c * 1000 : c;
      }
      if (typeof c === "string" && c) {
        const parsed = Date.parse(c);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
    return 0;
  }, []);

  const handleAutoMergeThread = useCallback(async () => {
    if (!incident?.id || !incident.rawOCSF) return;
    // A resolved/closed thread anchor stops absorbing new incidents.
    if (isClosedIncident(incident.rawOCSF)) {
      toast.info(
        "This incident is resolved or closed — new thread items are kept separate.",
      );
      return;
    }

    const siblings =
      threadCorrelated.discoveredCount > threadCorrelated.incidents.length
        ? await threadCorrelated.loadAll()
        : threadCorrelated.incidents;
    if (siblings.length === 0) return;

    // Build the pool: current incident + every visible sibling.
    const pool = [
      {
        id: incident.id,
        raw: incident.rawOCSF,
        title:
          (incident.rawOCSF as any)?.title ||
          (incident.rawOCSF as any)?.finding_info_list?.[0]?.title ||
          incident.id,
        ts: readIncidentTimestamp(incident.rawOCSF),
      },
      ...siblings.map((s) => ({
        id: s.id,
        raw: s.raw,
        title: s.title,
        ts: readIncidentTimestamp(s.raw),
      })),
    ];

    // Primary selection order:
    //   1. If any pool member ALREADY anchors merges (has linked pointers),
    //      it stays the primary. Threads keep a stable ID across time —
    //      new siblings fold into the existing anchor instead of rotating
    //      the primary to whichever incident happens to be newest.
    //   2. Otherwise (first merge on this thread), never pick a draft as
    //      primary; latest non-draft wins; id breaks ties.
    pool.sort((a, b) => {
      const aAnchor = getLinkedPointers(a.raw).length > 0 ? 0 : 1;
      const bAnchor = getLinkedPointers(b.raw).length > 0 ? 0 : 1;
      if (aAnchor !== bAnchor) return aAnchor - bAnchor;
      const ad = isDraftOnlyIncident(a.raw) ? 1 : 0;
      const bd = isDraftOnlyIncident(b.raw) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return b.ts - a.ts || b.id.localeCompare(a.id);
    });
    const primary = pool[0];
    // Skip sources the analyst has explicitly unmerged from the chosen
    // primary (either direction). Auto-merge must never resurrect a pair
    // that was manually taken apart.
    const primaryLinkedIds = new Set(
      getLinkedPointers(primary.raw).map((p) => p.id.toLowerCase()),
    );
    const primaryIdLower = primary.id.toLowerCase();
    const skipped: { id: string; reason: string }[] = [];
    const sources = pool.slice(1).filter((s) => {
      const sourceIdLower = s.id.toLowerCase();
      if (primaryLinkedIds.has(sourceIdLower)) {
        skipped.push({ id: s.id, reason: "already linked to primary" });
        return false;
      }
      const sourcePrimary = getPrimaryPointer(s.raw);
      if (sourcePrimary?.id?.toLowerCase() === primaryIdLower) {
        skipped.push({ id: s.id, reason: "already points to primary" });
        return false;
      }
      if (String(s.raw?.merged_into || "").toLowerCase() === primaryIdLower) {
        skipped.push({ id: s.id, reason: "legacy merged_into primary" });
        return false;
      }
      if (
        sourcePrimary ||
        s.raw?.status_id === 6 ||
        String(s.raw?.status || "").toLowerCase() === "merged"
      ) {
        skipped.push({
          id: s.id,
          reason: `already merged into ${sourcePrimary?.id || s.raw?.merged_into || "another incident"}`,
        });
        return false;
      }
      if (isClosedIncident(s.raw)) {
        skipped.push({ id: s.id, reason: "resolved/closed — kept separate" });
        return false;
      }
      if (pairWasUnmerged(primary.raw, primary.id, s.raw, s.id)) {
        skipped.push({ id: s.id, reason: "manually unmerged from this pair" });
        return false;
      }

      return true;
    });
    if (sources.length === 0) {
      console.info("[auto-merge] Nothing to merge on thread", {
        primaryId: primary.id,
        poolSize: pool.length,
        skipped,
      });

      // Detect a common external anchor: every skipped sibling already
      // merged into the SAME other incident (not the current pool's
      // primary). In that case the thread already has a real anchor
      // that just isn't in our visible pool — offer to jump there
      // instead of leaving the analyst with a dead-end warning.
      const externalAnchors = new Map<string, number>();
      for (const s of skipped) {
        const m = s.reason.match(/already merged into ([^\s]+)/);
        if (!m) continue;
        const anchor = m[1].toLowerCase();
        if (anchor === primary.id.toLowerCase()) continue;
        externalAnchors.set(anchor, (externalAnchors.get(anchor) || 0) + 1);
      }
      const dominant = Array.from(externalAnchors.entries()).sort(
        (a, b) => b[1] - a[1],
      )[0];
      const isDominant =
        dominant &&
        dominant[1] >= Math.max(1, Math.floor(skipped.length * 0.6));

      const reasons = new Set(skipped.map((s) => s.reason));
      const reasonSummary =
        reasons.size === 1
          ? Array.from(reasons)[0]
          : `${skipped.length} sibling${skipped.length === 1 ? "" : "s"} already merged or unmerged elsewhere`;

      if (isDominant) {
        // Informational only — no toast. Anchored threads are expected and
        // surfacing them as a notification is pure noise.
        console.log(
          `[Merge] Thread already anchored on ${dominant[0]} (${dominant[1]}/${skipped.length} siblings)`,
        );
      }
      return;
    }

    setAutoMergeBusy(true);
    try {
      // Incremental batched merge: process large threads in bounded chunks.
      // If one chunk fails, it splits smaller so a single bad sibling or
      // oversized folded payload does not block the rest of the thread.
      let batchResult: Awaited<ReturnType<typeof linkMergePairsIncremental>>;
      try {
        batchResult = await linkMergePairsIncremental({
          primaryId: primary.id,
          primaryRaw: primary.raw,
          primaryTitle: primary.title,
          sources: sources.map((s) => ({
            id: s.id,
            raw: s.raw,
            title: s.title,
          })),
          linkedBy: "thread-auto-merge",
          chunkSize: 10,
        });
      } catch (err: any) {
        batchResult = {
          success: false,
          mergedIds: [],
          attemptedIds: sources.map((s) => s.id),
          errors: sources.map((s) => ({
            id: s.id,
            error: err?.message || "Threw an unexpected error",
          })),
        };
      }
      const failures: { id: string; title: string; error: string }[] =
        batchResult.errors.map((e) => {
          const src = sources.find((s) => s.id === e.id);
          return { id: e.id, title: src?.title || e.id, error: e.error };
        });

      if (failures.length === 0) {
        // Silent success: background auto-merge is expected behaviour, so we do not toast.
        const mergedCount = batchResult.mergedIds.length || sources.length;
        console.log("[auto-merge] merged silently", {
          mergedCount,
          primaryId: primary.id,
        });
      } else {
        // Surface the actual failure reason(s) so the analyst can act:
        // group by error message, then show up to 2 sample titles per group.
        const grouped = new Map<string, { title: string; id: string }[]>();
        for (const f of failures) {
          const list = grouped.get(f.error) || [];
          list.push({ title: f.title, id: f.id });
          grouped.set(f.error, list);
        }
        const lines = Array.from(grouped.entries()).map(([reason, items]) => {
          const sample = items
            .slice(0, 2)
            .map(
              (i) =>
                `"${i.title.length > 40 ? i.title.slice(0, 40) + "…" : i.title}"`,
            )
            .join(", ");
          const more = items.length > 2 ? ` +${items.length - 2} more` : "";
          return `• ${reason} — ${sample}${more}`;
        });
        const allFailed = failures.length === sources.length;
        const headline = allFailed
          ? sources.length === 1
            ? "Auto-merge failed for the sibling incident"
            : `Auto-merge failed for all ${sources.length} sibling incidents`
          : `Auto-merge partial: ${failures.length} of ${sources.length} failed`;
        const successful = batchResult.mergedIds.length;
        const toastOptions = {
          description: `Primary: "${(primary.title || primary.id).slice(0, 60)}"\n${lines.join("\n")}`,
          duration: 15000,
        };
        if (successful > 0) {
          toast.warning(headline, toastOptions);
          const retryKey = `${threadCorrelated.threadId || ""}:${incident.id}`;
          window.setTimeout(() => {
            autoMergedThreadsRef.current.delete(retryKey);
            threadCorrelated.refresh();
          }, 15_000);
        } else {
          toast.error(headline, toastOptions);
        }
        console.error("[auto-merge] failures", {
          primaryId: primary.id,
          primaryTitle: primary.title,
          failures,
        });
      }

      // If the current view is now non-primary, jump to the primary so
      // the analyst lands on the retained incident.
      if (primary.id !== incident.id) {
        navigate(`/incidents/${encodeURIComponent(primary.id)}`);
      } else {
        await loadIncident?.(false);
        threadCorrelated.refresh();
      }
    } catch (e: any) {
      toast.error("Auto-merge failed", {
        description:
          e?.message || "Unknown error before any siblings were processed.",
        duration: 12000,
      });
      console.error("[auto-merge] fatal", e);
    } finally {
      setAutoMergeBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    incident?.id,
    incident?.rawOCSF,
    threadCorrelated.incidents,
    readIncidentTimestamp,
  ]);

  // Auto-invoke thread merging when the org preference is enabled. Runs
  // silently in the background whenever the current incident has visible
  // thread siblings that are not already merged/linked. Guarded per
  // thread_id so a single load only triggers one merge attempt.
  const autoMergeThreadEnabled = useAutoMergeThread();
  const autoMergedThreadsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoMergeThreadEnabled) return;
    if (isPublicView) return;
    if (autoMergeBusy) return;
    if (!incident?.id || !incident.rawOCSF) return;
    // Thread is finished — new arrivals stay separate incidents.
    if (isClosedIncident(incident.rawOCSF)) return;
    if (primaryPointer) return; // Already merged into another incident.

    const threadId = threadCorrelated.threadId;
    if (!threadId) return;
    if (threadCorrelated.loading) return;

    // Filter out siblings already surfaced by merge banners or in Merged
    // status — mirrors the visibility filter used by ThreadCorrelatedBanner.
    const excluded = new Set<string>();
    if (relatedIncidents.primary?.id)
      excluded.add(relatedIncidents.primary.id.toLowerCase());
    relatedIncidents.linked.forEach((l) => excluded.add(l.id.toLowerCase()));
    const previewMergeable = threadCorrelated.incidents.filter((inc) => {
      if (excluded.has(inc.id.toLowerCase())) return false;
      const s = String(inc.status || "").toLowerCase();
      if (s === "merged" || inc.status_id === 6) return false;
      return true;
    });
    // Trigger if either the preview has mergeable siblings OR the raw
    // correlation count exceeds what we've resolved locally — in the
    // latter case handleAutoMergeThread() will loadAll() and evaluate
    // the full set. Skipping here would leave large threads unmerged
    // whenever their first 20 preview slots happen to be already-linked.
    const hasUnresolvedSiblings =
      threadCorrelated.discoveredCount > threadCorrelated.incidents.length;
    if (previewMergeable.length === 0 && !hasUnresolvedSiblings) return;

    const key = `${threadId}:${incident.id}`;
    if (autoMergedThreadsRef.current.has(key)) return;
    autoMergedThreadsRef.current.add(key);
    void handleAutoMergeThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoMergeThreadEnabled,
    isPublicView,
    autoMergeBusy,
    incident?.id,
    primaryPointer,
    threadCorrelated.threadId,
    threadCorrelated.loading,
    threadCorrelated.incidents,
    threadCorrelated.discoveredCount,
    relatedIncidents.primary?.id,
    relatedIncidents.linked,
  ]);

  // Legacy migration: pre-cross-reference merges wrote status_id 99 +
  // `merged_into` on the source only. On first view, upgrade the record
  // to the symmetric pointer model so the banners can render.
  useEffect(() => {
    if (!incident?.id || !incident.rawOCSF) return;
    const invariantRaw = enforceMergedStatusInvariant(incident.rawOCSF);
    if (invariantRaw !== incident.rawOCSF) {
      setIncident((prev) =>
        prev ? { ...prev, status: "merged", rawOCSF: invariantRaw } : prev,
      );
      setEditedStatus("merged");
      // Don't clobber the editor while the user is previewing an older revision.
      if (selectedRevisionIdx === null)
        setRawJsonText(JSON.stringify(invariantRaw, null, 2));
      writeIncidentSafe(
        incident.id,
        invariantRaw,
        crossOrgId || undefined,
      ).catch((err) =>
        console.warn(
          "[IncidentDetail] Failed to repair merged status invariant:",
          err,
        ),
      );
      return;
    }
    maybeMigrateLegacyMerge(incident.id, incident.rawOCSF)
      .then((migrated) => {
        if (migrated) {
          void loadIncident?.(false);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);
  // Track the initial normalized values so auto-save doesn't fire on load
  const initialValuesRef = useRef<{
    title: string;
    message: string;
    severity: string;
    assignee: string;
    status: string;
    tlp: string;
    references: string;
    observables: string;
    customFields: string;
    tasks: string;
    stakeholders: string;
    labels: string;
  } | null>(null);

  const { users, loading: usersLoading } = useUsers();
  const { fields: customFields } = useCustomFields();
  const {
    observableTypeNames,
    iocTypes,
    refetch: refetchIOCTypes,
  } = useIOCTypes();
  const { templates: caseTemplates, trackUsage: trackTemplateUsage } =
    useCaseTemplates();
  const { getItem } = useDatastore({
    category: DATASTORE_CATEGORIES.INCIDENTS,
    orgId: crossOrgId || undefined,
  });

  const { subOrgs, parentOrg, isParentOrg } = useSubOrgs(
    userInfo?.active_org?.id,
  );
  const crossOrgInfo = useMemo(() => {
    if (!crossOrgId) return null;
    if (parentOrg && parentOrg.id === crossOrgId)
      return { name: parentOrg.name, image: parentOrg.image };
    const found = subOrgs.find((o) => o.id === crossOrgId);
    return found ? { name: found.name, image: found.image } : null;
  }, [crossOrgId, subOrgs, parentOrg]);

  // ── Routing rule matches (powers both the preview banner AND timeline pills) ──
  // Rules live on the PARENT org's `shuffle-security_routing` datastore; on a
  // parent we fall back to the active org id. The result is also injected as
  // synthetic "routing-matched" steps in the unified timeline so users can see
  // at a glance which rules would fire — without scrolling up to the banner.
  const routingRulesOrgId = parentOrg?.id || userInfo?.active_org?.id;
  const { items: routingRuleItems, fetchItems: fetchRoutingRules } =
    useDatastore({
      category: ROUTING_DATASTORE_CATEGORY,
      orgId: routingRulesOrgId,
    });
  useEffect(() => {
    if (routingRulesOrgId) fetchRoutingRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingRulesOrgId]);
  const routingRules: RoutingRule[] = useMemo(() => {
    const out: RoutingRule[] = [];
    for (const it of routingRuleItems) {
      try {
        const v =
          typeof it.value === "string" ? JSON.parse(it.value) : it.value;
        if (v && typeof v === "object") {
          const actions = Array.isArray(v.actions)
            ? v.actions
            : v.action
              ? [v.action]
              : [];
          out.push({
            id: v.id || it.key,
            name: v.name || "Untitled rule",
            enabled: v.enabled !== false,
            priority: Number.isFinite(v.priority) ? v.priority : 100,
            matchMode: v.matchMode === "any" ? "any" : "all",
            conditions: Array.isArray(v.conditions) ? v.conditions : [],
            actions,
          });
        }
      } catch {
        /* skip malformed */
      }
    }
    return out;
  }, [routingRuleItems]);
  const routingContext: IncidentEvaluationContext = useMemo(
    () => ({
      title: editedTitle || incident?.title,
      description: editedMessage,
      source: incident?.source,
      severity: editedSeverity,
      status: editedStatus,
      labels: editedLabels,
      observables: editedObservables,
      stakeholders: editedStakeholders,
      rawOCSF: incident?.rawOCSF,
    }),
    [
      editedTitle,
      editedMessage,
      editedSeverity,
      editedStatus,
      editedLabels,
      editedObservables,
      editedStakeholders,
      incident,
    ],
  );
  const routingMatches = useMemo(
    () =>
      dedupeMatchesByActionTarget(
        evaluateRoutingRules(routingContext, routingRules),
      ),
    [routingContext, routingRules],
  );

  // Detect which other orgs share the same incident key without probing every
  // tenant on load. Prefer the list page's shared_orgs query param, then the
  // authoritative tenant stamp persisted on the loaded incident.

  useEffect(() => {
    if (!id || !userInfo?.active_org?.id) return;

    // Check if list page passed shared org IDs
    const sharedOrgParam = searchParams.get("shared_orgs");
    const allKnownOrgs = [
      {
        id: userInfo.active_org!.id,
        name: userInfo.active_org!.name || "",
        image: userInfo.active_org!.image,
      },
      ...(subOrgs || []),
      ...(parentOrg ? [parentOrg] : []),
    ];

    if (sharedOrgParam) {
      const sharedIds = sharedOrgParam.split(",").filter(Boolean);
      // The current viewing org is implicit — find the OTHER orgs
      const viewingOrgId = crossOrgId || userInfo.active_org?.id;
      const others = sharedIds
        .filter((oid) => oid !== viewingOrgId)
        .map((oid) => {
          const org = allKnownOrgs.find((o) => o.id === oid);
          return org
            ? { id: org.id, name: org.name, image: org.image }
            : { id: oid, name: oid.slice(0, 8) + "…" };
        });
      if (others.length > 0) {
        setSharedOrgs(others);
        return;
      }
    }

    const stamp = readTenantStamp(incident?.rawOCSF);
    if (stamp?.tenants?.length) {
      const viewingOrgId = crossOrgId || userInfo.active_org?.id || "";
      const knownOrgById = new Map(allKnownOrgs.map((org) => [org.id, org]));
      const stamped = stamp.tenants
        .filter(
          (oid) => oid && oid !== viewingOrgId && !isTenantGhost(oid, stamp),
        )
        .map((oid) => {
          const org = knownOrgById.get(oid);
          return org
            ? { id: org.id, name: org.name, image: org.image }
            : { id: oid, name: oid.slice(0, 8) + "…" };
        });
      setSharedOrgs(stamped);
      return;
    }

    setSharedOrgs([]);
  }, [
    id,
    subOrgs,
    parentOrg,
    userInfo?.active_org?.id,
    crossOrgId,
    searchParams,
    incident?.rawOCSF,
  ]);

  // Fetch agent runs for this incident — deferred until incident loaded.
  // While an @AIAgent comment is awaiting a reply, poll fast (5s); otherwise
  // we fall back to a 60s cadence inside the hook.
  const hasPendingAgentMention = useMemo(() => {
    return activity.some((a: any) => {
      if (a?.ai_handled !== true) return false;
      const text = String(a?.content || "");
      if (!/@\s*ai[\s_-]*agent\b/i.test(text)) return false;
      const replied = activity.some((r: any) => {
        if (r?.replyToId !== a.id) return false;
        const u = r?.user || "";
        return /agent|ai\s*agent|aiagent/i.test(u);
      });
      return !replied;
    });
  }, [activity]);
  // Scope execution searches to the incident's lifecycle so older runs that
  // would otherwise fall outside the recent-100 window are still found.
  // Window = incident.createdTs → last observed "change" event (activity max
  // timestamp / edited time), padded on both sides for clock skew.
  const runsWindow = useMemo(() => {
    if (loading || !incident) return {};
    const PAD_MS = 5 * 60 * 1000;
    const createdMs = Number(incident.createdTs) || 0;
    if (!createdMs) return {};
    const activityMax = Array.isArray(incident.activity)
      ? incident.activity.reduce((m: number, a: any) => {
          const t = Number(a?.timestamp) || 0;
          return t > m ? t : m;
        }, 0)
      : 0;
    const editedMs = Number((incident as any).editedTs) || 0;
    const lastChange = Math.max(createdMs, activityMax, editedMs);
    const startTime = new Date(Math.max(0, createdMs - PAD_MS)).toISOString();
    const endTime = new Date(lastChange + PAD_MS).toISOString();
    return { startTime, endTime };
  }, [loading, incident]);

  // While we expect new runs to arrive, drop the upper bound so the search
  // covers "up to now" instead of freezing at the last activity timestamp.
  const activeRunsWindow = useMemo(() => {
    if (hasPendingAgentMention || refreshingObservables) {
      return { startTime: runsWindow.startTime };
    }
    return runsWindow;
  }, [runsWindow, hasPendingAgentMention, refreshingObservables]);

  // Non-agent workflow executions can change after the incident itself stops
  // changing (for example, an abort happens from the execution drawer and does
  // not necessarily write incident activity). Extend the upper bound by an
  // extra 30 minute buffer on top of the last event, capped at "now", so late
  // status transitions (aborted, finished) still fall inside the search window
  // without dropping the bound entirely.
  const workflowRunsWindow = useMemo(() => {
    if (!runsWindow.endTime) return { startTime: runsWindow.startTime };
    const EXTRA_MS = 30 * 60 * 1000;
    const extended = new Date(runsWindow.endTime).getTime() + EXTRA_MS;
    const capped = Math.min(extended, Date.now());
    return {
      startTime: runsWindow.startTime,
      endTime: new Date(capped).toISOString(),
    };
  }, [runsWindow.startTime, runsWindow.endTime]);

  // Executions live in the tenant that owns the incident, so sub-org incidents
  // must search that org — searching the active org returns zero runs.
  const {
    runsForIncident: agentRuns,
    isLoading: agentRunsLoading,
    refetch: refetchAgentRuns,
  } = useIncidentAgentRuns(
    !loading ? id : undefined,
    hasPendingAgentMention,
    activeRunsWindow,
    crossOrgId || undefined,
  );
  // Every OTHER workflow execution that touched this incident (datastore
  // triggers, enrichment / indicator-check workflows, forward-to-tool runs).
  // The list is polled at 60s and folded into the timeline as a "workflow
  // run" pill; the observable-check pill also uses it to become a link to
  // the actual execution once its id shows up.
  const {
    runsForIncident: allIncidentWorkflowRuns,
    isLoading: workflowRunsLoading,
    refetch: refetchWorkflowRuns,
  } = useIncidentWorkflowRuns(
    !loading ? id : undefined,
    hasPendingAgentMention || refreshingObservables,
    workflowRunsWindow,
    crossOrgId || undefined,
  );
  // When a workflow execution changes state from within the run explorer
  // (e.g. the user aborts it), refetch both the workflow-run and agent-run
  // lists immediately so the timeline reflects the new status without
  // waiting for the next 60s poll.
  useEffect(() => {
    const onChanged = () => {
      refetchWorkflowRuns();
      refetchAgentRuns();
    };
    window.addEventListener("workflow-run:changed", onChanged as EventListener);
    return () =>
      window.removeEventListener(
        "workflow-run:changed",
        onChanged as EventListener,
      );
  }, [refetchWorkflowRuns, refetchAgentRuns]);

  // The execution behind the "Checking your message for observables…" pill:
  // the newest workflow run that started AFTER the check began (small
  // tolerance for clock skew) and within the last ~90s. Anchoring on the
  // check's own start time matters: without it, an unrelated run that already
  // finished seconds before the comment was sent would be picked up and
  // instantly flip the pill off — which looked like the run "flashed" under
  // the comment and vanished again.
  const observableCheckRun = useMemo(() => {
    const now = Date.now();
    const startedAt = obsCheckStartedAtRef.current;
    const floor = startedAt ? startedAt - 5_000 : 0;
    return (allIncidentWorkflowRuns || [])
      .filter((r: any) => {
        const ts = normalizeToMs(r?.started_at);
        return ts > 0 && ts >= floor && now - ts < 90_000;
      })
      .sort(
        (a: any, b: any) =>
          normalizeToMs(b.started_at) - normalizeToMs(a.started_at),
      )[0] as any;
  }, [allIncidentWorkflowRuns, obsCheckTick]);

  // As soon as that execution reports a terminal status, drop the spinner —
  // previously the pill hung around until the enrichment count changed or the
  // 7s safety timer fired, which could lag the drawer by up to 10 seconds.
  useEffect(() => {
    if (!refreshingObservables || !observableCheckRun) return;
    const status = String(observableCheckRun.status || "").toUpperCase();
    if (
      status &&
      status !== "EXECUTING" &&
      status !== "RUNNING" &&
      status !== "WAITING"
    ) {
      setRefreshingObservables(false);
      obsRefreshBaselineRef.current = null;
    }
  }, [refreshingObservables, observableCheckRun]);

  // While the observable check is in flight, poll the run list immediately so
  // the terminal status is picked up on the very next tick instead of waiting
  // for the slow 60s cadence to catch up.
  useEffect(() => {
    if (!refreshingObservables) return;
    refetchWorkflowRuns();
  }, [refreshingObservables, refetchWorkflowRuns]);

  // Pull open agent-handoff notifications so any workflow execution that is
  // stuck on a Question can render the answer form inline in the timeline.
  const {
    notifications: agentNotifications,
    refresh: refreshAgentNotifications,
  } = useAgentNotifications();
  const questionByExecId = useMemo(() => {
    const map: Record<string, AgentNotification> = {};
    (agentNotifications || []).forEach((n) => {
      if (!n.execution_id) return;
      if (isApprovalNotification(n)) return;
      // Prefer the newest question for a given execution id.
      const existing = map[n.execution_id];
      if (
        !existing ||
        (n.updated_at || n.created_at) >
          (existing.updated_at || existing.created_at)
      ) {
        map[n.execution_id] = n;
      }
    });
    return map;
  }, [agentNotifications]);

  // Questions scoped to this incident that we could not attach to a specific
  // execution row (e.g. the parent workflow row is visible but the child agent
  // execution is not). Rendered as a standalone card at the top of the
  // timeline so the user can always answer without hunting.
  const incidentQuestions = useMemo(() => {
    // Build a set of every execution id known to belong to this incident —
    // covers both direct agent runs and workflow executions the incident
    // triggered. Agent-handoff notifications carry the *workflow* execution
    // id, so matching against both surfaces the question even when the
    // notification has no incident_id set (older backends / manual runs).
    const execIds = new Set<string>();
    (agentRuns || []).forEach((r: any) => {
      if (r?.execution_id) execIds.add(String(r.execution_id));
    });
    (allIncidentWorkflowRuns || []).forEach((r: any) => {
      if (r?.execution_id) execIds.add(String(r.execution_id));
    });
    const fromNotifications = (agentNotifications || []).filter((n) => {
      if (isApprovalNotification(n)) return false;
      const matchesIncident =
        n.incident_id && id && String(n.incident_id) === String(id);
      const matchesExec = n.execution_id && execIds.has(String(n.execution_id));
      return matchesIncident || matchesExec;
    });

    // Also surface pending questions directly discovered on this incident's
    // agent runs — using the SAME `extractPendingAgentQuestions` helper the
    // Agent run drawer uses — so the timeline shows an inline answer form
    // even before the backend emits a corresponding notification.
    const notifiedDecisionIds = new Set(
      fromNotifications
        .map((n) => {
          try {
            const u = new URL(n.reference_url || "", "https://x.local");
            return u.searchParams.get("decision_id") || "";
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    );
    const synthetic: AgentNotification[] = [];
    // Agent decisions are NOT on the search result itself — they live inside
    // the AI Agent action's `result` JSON blob (same source AgentUI parses).
    // Read both so questions surface without opening the drawer.
    const decisionsForRun = (run: any): any[] => {
      if (Array.isArray(run?.decisions)) return run.decisions;
      const results: any[] = Array.isArray(run?.results) ? run.results : [];
      const actionResult =
        results.find((r: any) => r?.action?.app_name === "AI Agent") ||
        results[0];
      const raw = actionResult?.result;
      if (typeof raw !== "string" || !raw.trim().startsWith("{")) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.decisions) ? parsed.decisions : [];
      } catch {
        return [];
      }
    };
    (agentRuns || []).forEach((run: any) => {
      const execId = String(run?.execution_id || "");
      const auth = String(run?.authorization || "");
      if (!execId) return;
      const status = String(run?.status || "").toUpperCase();
      if (
        status &&
        status !== "EXECUTING" &&
        status !== "WAITING" &&
        status !== "RUNNING"
      )
        return;
      for (const pending of extractPendingAgentQuestions({
        decisions: decisionsForRun(run),
      })) {
        if (notifiedDecisionIds.has(pending.decisionId)) continue;
        const startedMs = Math.floor(
          (run?.started_at ? normalizeToMs(run.started_at) : Date.now()) / 1000,
        );
        synthetic.push({
          id: `agent-run-question-${execId}-${pending.decisionId}`,
          title: pending.reason || "Agent needs your input",
          description: pending.description || "",
          reference_url: `/forms/inline?execution_id=${encodeURIComponent(execId)}${auth ? `&authorization=${encodeURIComponent(auth)}` : ""}&decision_id=${encodeURIComponent(pending.decisionId)}`,
          created_at: startedMs,
          updated_at: startedMs,
          execution_id: execId,
          questions: pending.questions,
          severity: "low",
        });
      }
    });

    return [...fromNotifications, ...synthetic];
  }, [agentNotifications, id, agentRuns, allIncidentWorkflowRuns]);

  const workflowOnlyRuns = useMemo(() => {
    // Do not render any workflow rows until BOTH the agent runs and the
    // workflow runs have resolved. Workflow executions that spawned an agent
    // are filtered out below, so rendering before agent runs arrive makes
    // rows appear and then vanish (flicker).
    if (agentRunsLoading || workflowRunsLoading) return [] as any[];
    const agentIds = new Set((agentRuns || []).map((r: any) => r.execution_id));

    // Build [start, end] windows for every agent run on this incident. Any
    // workflow execution that fully contains one of these windows is treated
    // as the parent that spawned the agent — we hide it from the timeline so
    // the agent row itself becomes the single source of truth for that
    // activity (stuck agents are handled inline on the agent row).
    const agentWindows: Array<{
      start: number;
      end: number;
      wfId: string;
      name: string;
    }> = (agentRuns || [])
      .map((r: any) => {
        const s = r.started_at ? normalizeToMs(r.started_at) : 0;
        const e = r.completed_at ? normalizeToMs(r.completed_at) : Date.now();
        return {
          start: s,
          end: e,
          wfId: String(r.workflow_id || r.workflow?.id || "").trim(),
          name: String(r.workflow?.name || "")
            .trim()
            .toLowerCase(),
        };
      })
      .filter((w) => w.start > 0);

    // Same-activity dedupe: an agent run and a workflow run that represent the
    // SAME work (same workflow id/name, overlapping window) must never both be
    // shown. The agent row wins — it can pivot to the workflow run via button.
    const agentActivities = (agentRuns || []).map((r: any) => {
      const s = r.started_at ? normalizeToMs(r.started_at) : 0;
      const e = r.completed_at ? normalizeToMs(r.completed_at) : Date.now();
      return {
        wfId: String(r.workflow_id || "").trim(),
        name: String(r.workflow?.name || "")
          .trim()
          .toLowerCase(),
        start: s,
        end: e,
      };
    });

    const filtered = (allIncidentWorkflowRuns || []).filter((r: any) => {
      if (!r?.execution_id || agentIds.has(r.execution_id)) return false;
      // Hide throwaway executions: single-app one-shots and unnamed "Tmp" scratch flows.
      const wfName = String(r.workflow?.name || r.workflow_name || "").trim();
      if (/single app run/i.test(wfName)) return false;
      if (wfName.toLowerCase() === "tmp") return false;
      // Hide workflow executions that WRAP a child agent run — the agent row
      // already represents that work (and handles stuck/question states
      // inline). This requires BOTH strict time containment AND the same
      // workflow identity: an unrelated workflow (e.g. the IOC/observable
      // enrichment run) that merely happens to span an agent run is NOT its
      // parent and must stay visible in the timeline.
      const wfStart = r.started_at ? normalizeToMs(r.started_at) : 0;
      const wfEnd = r.completed_at ? normalizeToMs(r.completed_at) : Date.now();
      const wfId = String(r.workflow_id || r.workflow?.id || "").trim();
      const nameKey = wfName.toLowerCase();
      if (wfStart > 0) {
        const tol = 5_000; // 5s tolerance either side
        const hasChildAgent = agentWindows.some((a) => {
          const sameFlow =
            (a.wfId && wfId && a.wfId === wfId) ||
            (a.name && nameKey && a.name === nameKey);
          if (!sameFlow) return false;
          // agent must start after the workflow began AND finish before it ended
          return a.start >= wfStart - tol && a.end <= wfEnd + tol;
        });
        if (hasChildAgent) return false;
      }

      // Duplicate of an agent run for the same workflow within an overlapping
      // window — prefer the agent row.

      const dupTol = 60_000;

      const isDuplicateOfAgent = agentActivities.some((a) => {
        const sameFlow =
          (a.wfId && wfId && a.wfId === wfId) ||
          (a.name && nameKey && a.name === nameKey);
        if (!sameFlow) return false;
        if (!a.start || !wfStart) return false;
        // overlapping (or near-adjacent) time ranges
        return a.start <= wfEnd + dupTol && wfStart <= a.end + dupTol;
      });
      if (isDuplicateOfAgent) return false;

      return true;
    });

    // Ingest Tickets typically runs on a schedule and will re-fire many times
    // within the incident window. Only surface the FIRST (earliest) execution
    // that touched this incident — the subsequent runs are noise for the
    // timeline.
    const ingestRuns = filtered
      .filter(
        (r: any) =>
          String(r.workflow?.name || r.workflow_name || "")
            .trim()
            .toLowerCase() === "ingest tickets",
      )
      .sort((a: any, b: any) => {
        const ta = new Date(a.started_at || a.completed_at || 0).getTime();
        const tb = new Date(b.started_at || b.completed_at || 0).getTime();
        return ta - tb;
      });
    const keepIngestId = ingestRuns[0]?.execution_id;
    return filtered.filter((r: any) => {
      const wfName = String(r.workflow?.name || r.workflow_name || "")
        .trim()
        .toLowerCase();
      if (wfName !== "ingest tickets") return true;
      return r.execution_id === keepIngestId;
    });
  }, [
    allIncidentWorkflowRuns,
    agentRuns,
    agentRunsLoading,
    workflowRunsLoading,
  ]);

  // Simple view: keep the timeline scrolled to the newest entry at the bottom,
  // and autoscroll when new objects (workflows, agent runs, tasks, comments, etc.) are discovered.
  useEffect(() => {
    const el = simpleFeedRef.current;
    if (!el) return;

    let prevChildCount = el.children.length;
    let prevScrollHeight = el.scrollHeight;

    const park = (smooth = false) => {
      try {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        });
      } catch {
        el.scrollTop = el.scrollHeight;
      }
    };

    // Initial park at bottom on mount/tab change
    park(false);
    const raf = requestAnimationFrame(() => park(false));
    const timer = setTimeout(() => park(false), 250);

    // Watch for new DOM objects discovered or rendered in the feed
    const observer = new MutationObserver((mutations) => {
      let hasAddedNodes = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          hasAddedNodes = true;
          break;
        }
      }
      const currentChildCount = el.children.length;
      const currentScrollHeight = el.scrollHeight;

      if (
        hasAddedNodes ||
        currentChildCount > prevChildCount ||
        currentScrollHeight > prevScrollHeight
      ) {
        prevChildCount = currentChildCount;
        prevScrollHeight = currentScrollHeight;
        requestAnimationFrame(() => park(true));
      }
    });

    observer.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [
    activeTab,
    revisions.length,
    commentActivity.length,
    activity.length,
    agentRuns?.length,
    workflowOnlyRuns.length,
    allIncidentWorkflowRuns?.length,
    tasks.length,
    editedObservables.length,
    correlations.length,
  ]);
  const [selectedAgentRun, setSelectedAgentRun] = useState<AgentRun | null>(
    null,
  );
  const [selectedWorkflowExecutionId, setSelectedWorkflowExecutionId] =
    useState<string | null>(null);

  // "Show agent run details" from an inline question: prefer the AI Agent run
  // for that execution, and only fall back to the raw workflow execution when
  // no agent run matches.
  const openAgentRunDetails = useCallback(
    (execId: string) => {
      const match = (agentRuns || []).find(
        (r: any) => String(r?.execution_id) === String(execId),
      );
      if (match) {
        setSelectedAgentRun(match as AgentRun);
        return;
      }
      setSelectedWorkflowExecutionId(String(execId));
    },
    [agentRuns],
  );

  // `workflow-run:open` window events are handled app-wide by
  // GlobalWorkflowRunDrawer, so no local listener is needed here.

  // Load incident function (reusable for refresh)
  const loadIncident = useCallback(
    async (showLoading = true) => {
      if (!id) {
        setLoadDebug({
          stage: "no-id",
          message: "No incident id present in URL",
          rawId,
          timestamp: new Date().toISOString(),
        });
        setLoading(false);
        return;
      }

      const loadStart = performance.now();
      // Only show the full-page skeleton when we truly have nothing to render.
      // If the list-row fallback already seeded the incident state, keep it
      // visible while the real fetch (which may take 10s+ on transient
      // recovery) runs quietly in the background.
      if (showLoading && !incident) setLoading(true);

      let result: Awaited<ReturnType<typeof getDatastoreItem>>;
      try {
        result = isPublicView
          ? await getDatastoreItemPublic(id, publicOrg!, publicAuth!)
          : await getDatastoreItem(
              id,
              DATASTORE_CATEGORIES.INCIDENTS,
              crossOrgId || undefined,
              { priority: true },
            );
      } catch (err) {
        console.error("[IncidentDetail] Failed to fetch incident:", err);
        if (listFallbackIncident) {
          setIncident(listFallbackIncident);
        }
        setLoadDebug({
          stage: "fetch-error",
          message: "Network/transport failure while fetching incident",
          rawId,
          id,
          crossOrgId,
          activeOrgId: userInfo?.active_org?.id,
          isPublicView,
          error:
            err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          timestamp: new Date().toISOString(),
        });
        setLoading(false);
        return;
      }
      const fetchTime = performance.now() - loadStart;
      console.log(
        `[Perf] Incident fetch: ${fetchTime.toFixed(1)}ms, size: ${((result.item?.value?.length || 0) / 1024).toFixed(1)}KB`,
      );

      // Some API responses come back as success=true with an empty stub item
      // (no key, empty value) when the requested key does not actually exist
      // in the datastore. Treat that as "no item found" instead of letting it
      // fall through to the parser and trip a misleading "parse-failed" error.
      const itemValueLen = result.item?.value?.length || 0;
      const itemKeyEmpty = !result.item?.key;
      const isEmptyStub =
        !!(result.success && result.item) && itemKeyEmpty && itemValueLen <= 2;

      if (result.success && result.item && !isEmptyStub) {
        setPublicAuthorization(
          result.item.public_authorization ||
            (result.item as { publicAuthorization?: string })
              .publicAuthorization ||
            (result.item as { PublicAuthorization?: string })
              .PublicAuthorization ||
            "",
        );

        const itemData = {
          key: result.item.key || id,
          value: result.item.value,
          created: result.item.created,
          edited: result.item.edited,
          enrichments: result.item.enrichments,
        };

        // Repair corrupted translation fields (e.g. literal JSONPath or header
        // arrays leaked into the title/assignee) before we display or persist.
        // This mutates the parsed payload in place and re-serializes it for the
        // parser so the corrected values become the stored values.
        let repairedRaw: any = null;
        let fieldRepairs: FieldRepair[] = [];
        if (!isPublicView) {
          try {
            repairedRaw = JSON.parse(itemData.value);
            fieldRepairs = repairCorruptedOcsfFields(repairedRaw);
            if (fieldRepairs.length > 0) {
              itemData.value = JSON.stringify(repairedRaw);
            }
          } catch (repairErr) {
            console.warn(
              "[IncidentDetail] Failed to pre-parse incident for translation repair:",
              repairErr,
            );
          }
        }

        const parseStart = performance.now();
        const parsed = parseIncidentFromDatastore(itemData);
        console.log(
          `[Perf] parseIncidentFromDatastore: ${(performance.now() - parseStart).toFixed(1)}ms`,
        );

        if (parsed) {
          const stateStart = performance.now();
          setIncident(parsed);
          setEditedTitle(parsed.title ?? "");
          // Use desc (new OCSF) first, fall back to message (legacy), convert HTML to readable text
          const rawDesc = parsed.rawOCSF?.desc || parsed.rawOCSF?.message || "";

          // Store the raw HTML for rendered view
          const rawDecoded = decodeIfBase64(rawDesc);
          const htmlSource = rawDecoded !== rawDesc ? rawDecoded : rawDesc;
          setRawDescriptionHtml(htmlSource);

          // Also create plain-text version for editing
          const processedDesc =
            rawDecoded !== rawDesc
              ? rawDecoded
              : decodeIfBase64(htmlToPlainText(rawDesc));
          setEditedMessage(htmlToPlainText(processedDesc));
          setEditedSeverity(parsed.severity);
          // Normalize assignee: must be a valid team member or AI Agent
          const rawAssignee = parsed.assignee || "";
          const normalizedAssignee = (() => {
            if (isAIAssignee(rawAssignee)) return "AI Agent";
            // Check if assignee is a valid team member (will be validated after users load)
            return rawAssignee;
          })();
          setEditedAssignee(normalizedAssignee);
          setEditedStatus(parsed.status);
          setEditedTlp(parsed.tlp || "TLP:AMBER");
          const rawRefs = parsed.references;
          setEditedReferences(
            Array.isArray(rawRefs)
              ? rawRefs
              : typeof rawRefs === "string"
                ? (() => {
                    try {
                      const p = JSON.parse(rawRefs);
                      return Array.isArray(p) ? p : [];
                    } catch {
                      return [];
                    }
                  })()
                : [],
          );
          setEditedObservables(parsed.observables || []);
          setEnrichments(parsed.enrichments || []);
          setEditedStakeholders(parsed.stakeholders || []);
          const customAttrs =
            parsed.rawOCSF?.metadata?.extensions?.custom_attributes;
          // Support both customFields and custom_fields naming at various levels
          let loadedCustomFields: any =
            (parsed.rawOCSF as any)?.customFields ||
            (parsed.rawOCSF as any)?.custom_fields ||
            customAttrs?.customFields ||
            (customAttrs as any)?.custom_fields ||
            parsed.customFields ||
            {};

          // If customFields resolved to a JSON string, parse it into an object
          if (typeof loadedCustomFields === "string") {
            console.warn(
              "[CustomFields] customFields was a string, parsing:",
              loadedCustomFields.substring(0, 200),
            );
            try {
              const parsed2 = JSON.parse(loadedCustomFields);
              if (
                parsed2 &&
                typeof parsed2 === "object" &&
                !Array.isArray(parsed2)
              ) {
                loadedCustomFields = parsed2;
              } else {
                console.warn(
                  "[CustomFields] Parsed value is not a plain object, ignoring",
                );
                loadedCustomFields = {};
              }
            } catch {
              console.warn(
                "[CustomFields] Failed to parse string as JSON, ignoring",
              );
              loadedCustomFields = {};
            }
          } else if (Array.isArray(loadedCustomFields)) {
            console.warn(
              "[CustomFields] customFields was an array, converting to empty object",
            );
            loadedCustomFields = {};
          }

          // Flatten object values to strings — APIs like Notion return nested objects
          const flattenedCustomFields: Record<
            string,
            string | number | boolean
          > = {};
          for (const [k, v] of Object.entries(loadedCustomFields)) {
            if (v === null || v === undefined) {
              flattenedCustomFields[k] = "";
            } else if (typeof v === "object") {
              // Try to extract a meaningful string from common patterns
              const obj = v as any;
              const meaningful =
                obj.name ||
                obj.title ||
                obj.label ||
                obj.value ||
                obj.display ||
                obj.text;
              if (typeof meaningful === "string") {
                flattenedCustomFields[k] = meaningful;
              } else {
                flattenedCustomFields[k] = JSON.stringify(v);
              }
              console.log(
                `[CustomFields] Flattened object field "${k}":`,
                typeof v,
                "->",
                flattenedCustomFields[k]?.toString().substring(0, 100),
              );
            } else {
              flattenedCustomFields[k] = v as string | number | boolean;
            }
          }

          // Log custom fields size — large custom_fields are a known perf bottleneck
          const cfStr = JSON.stringify(flattenedCustomFields);
          if (cfStr.length > 5_000) {
            console.warn(
              `[Perf] customFields is large: ${(cfStr.length / 1024).toFixed(1)}KB`,
            );
          }
          console.log(
            "[CustomFields] Loaded fields:",
            Object.keys(flattenedCustomFields),
          );

          setEditedCustomFields(flattenedCustomFields);
          setEditedLabels(parsed.labels || []);
          setActivity(mergePendingActivity(parsed.activity || []));
          const loadedTasks =
            parsed.tasks ||
            customAttrs?.tasks ||
            (parsed.rawOCSF as any)?.tasks ||
            [];
          // Ensure all tasks have unique IDs (but don't filter duplicates - just normalize IDs)
          const normalizedTasks = loadedTasks.map(
            (task: IncidentTask, index: number) => ({
              ...task,
              id: task.id || `task-${Date.now()}-${index}`,
            }),
          );
          setTasks(normalizedTasks);
          // Snapshot the normalized values so auto-save won't fire on load
          // Pre-stringify here (once) so auto-save comparisons are cheap
          const refsStr = JSON.stringify(parsed.references || []);
          const obsStr = JSON.stringify(parsed.observables || []);
          const stakeholdersStr = JSON.stringify(parsed.stakeholders || []);
          const tasksStr = JSON.stringify(normalizedTasks);
          const labelsStr = JSON.stringify(parsed.labels || []);
          initialValuesRef.current = {
            title: parsed.title ?? "",
            message: htmlToPlainText(processedDesc),
            severity: parsed.severity,
            assignee: normalizedAssignee,
            status: parsed.status,
            tlp: parsed.tlp || "TLP:AMBER",
            references: refsStr,
            observables: obsStr,
            customFields: cfStr,
            stakeholders: stakeholdersStr,
            tasks: tasksStr,
            labels: labelsStr,
          };
          console.log(
            `[Perf] State hydration: ${(performance.now() - stateStart).toFixed(1)}ms`,
          );
          // Persist any translation-field repairs so the stored OCSF reflects
          // the corrected values instead of the raw translation expression.
          if (!isPublicView && repairedRaw && fieldRepairs.length > 0) {
            console.log(
              "[IncidentDetail] Persisting repaired translation fields:",
              fieldRepairs,
            );
            writeIncidentSafe(id, repairedRaw, crossOrgId || undefined).catch(
              (err) =>
                console.warn(
                  "[IncidentDetail] Failed to persist repaired translation fields:",
                  err,
                ),
            );
          }
          // Details is now tab 0 (default), no auto-switch needed
          // If arriving with ?tab=raw, populate rawJsonText now that data is loaded
          if (
            (showLoading && searchParams.get("tab") === "raw") ||
            forceRawReloadRef.current
          ) {
            forceRawReloadRef.current = false;
            setRawJsonText(JSON.stringify(parsed.rawOCSF || {}, null, 2));
          }
          setLoading(false);
          setLoadDebug(null);
          console.log(
            `[Perf] Total loadIncident: ${(performance.now() - loadStart).toFixed(1)}ms`,
          );
          return;
        }
        // result.success && result.item, but parse returned null
        setLoadDebug({
          stage: "parse-failed",
          message:
            "Datastore item was returned but parseIncidentFromDatastore() returned null (likely invalid/empty JSON in value)",
          rawId,
          id,
          crossOrgId,
          activeOrgId: userInfo?.active_org?.id,
          isPublicView,
          httpSuccess: true,
          itemKey: result.item.key,
          valueLength: result.item.value?.length || 0,
          valuePreview: (result.item.value || "").slice(0, 500),
          timestamp: new Date().toISOString(),
        });
      } else {
        // Primary tenant lookup returned nothing. Before giving up, probe the
        // other tenants this user can see — the incident may have been moved
        // (or the URL was seeded before the source tenant existed) and only
        // lives elsewhere now. If found, redirect to the correct key so a
        // page refresh always lands on a real copy.
        if (!isPublicView && id && result.success) {
          const activeId = userInfo?.active_org?.id;
          const probeTargets: string[] = [];
          const seenProbe = new Set<string>();
          const addProbe = (oid?: string | null) => {
            if (!oid || seenProbe.has(oid)) return;
            if (oid === (crossOrgId || activeId)) return; // already checked
            seenProbe.add(oid);
            probeTargets.push(oid);
          };
          if (crossOrgId) addProbe(activeId); // if URL had crossOrg, also try active
          if (parentOrg) addProbe(parentOrg.id);
          for (const so of subOrgs) addProbe(so.id);

          if (probeTargets.length > 0) {
            try {
              const probeResults = await Promise.all(
                probeTargets.map(async (oid) => {
                  try {
                    const r = await getDatastoreItem(
                      id,
                      DATASTORE_CATEGORIES.INCIDENTS,
                      oid,
                    );
                    const valLen = r.item?.value?.length || 0;
                    const stub =
                      !!(r.success && r.item) && !r.item.key && valLen <= 2;
                    if (!(r.success && r.item && !stub)) return null;
                    let parsedValue: unknown = null;
                    try {
                      parsedValue = r.item.value
                        ? JSON.parse(r.item.value)
                        : null;
                    } catch {
                      /* ignore */
                    }
                    return { orgId: oid, value: parsedValue };
                  } catch {
                    return null;
                  }
                }),
              );
              const hits = probeResults.filter(
                (r): r is { orgId: string; value: unknown } => !!r,
              );
              // Pick authoritative stamp so we don't chase a ghost.
              let authStamp: TenantStamp | null = null;
              for (const h of hits) {
                const s = readTenantStamp(h.value);
                if (s && (!authStamp || s.updatedAt > authStamp.updatedAt))
                  authStamp = s;
              }
              const liveHits = hits.filter(
                (h) => !isTenantGhost(h.orgId, authStamp),
              );
              // Prefer a hit that matches the authoritative tenants list;
              // otherwise fall back to any live hit.
              const preferred = authStamp
                ? liveHits.find((h) => authStamp!.tenants.includes(h.orgId)) ||
                  liveHits[0]
                : liveHits[0];
              const foundOrgId = preferred?.orgId;
              if (foundOrgId) {
                const newKey =
                  foundOrgId === activeId ? id : `${foundOrgId}::${id}`;
                console.log(
                  `[IncidentDetail] primary lookup empty; found copy in tenant ${foundOrgId} — redirecting`,
                );
                navigate(`${entityBasePath}/${newKey}`, { replace: true });
                return;
              }
            } catch (err) {
              console.warn(
                "[IncidentDetail] cross-tenant fallback probe failed:",
                err,
              );
            }
          }
        }

        const stage = isEmptyStub
          ? "no-item"
          : result.success
            ? "no-item"
            : "no-success";
        if (listFallbackIncident) {
          setIncident(listFallbackIncident);
        }
        setLoadDebug({
          stage,
          message: isEmptyStub
            ? "API responded success=true but the item is an empty stub — no incident exists for this key in the active org"
            : result.success
              ? "API responded success=true but no item was returned"
              : "API responded success=false (no item present in datastore for this key)",
          rawId,
          id,
          crossOrgId,
          activeOrgId: userInfo?.active_org?.id,
          isPublicView,
          httpSuccess: !!result.success,
          reason: (result as { reason?: string }).reason,
          error: result.error,
          httpStatus: result.diagnostics?.status,
          httpStatusText: result.diagnostics?.statusText,
          responsePreview: result.diagnostics?.bodyPreview,
          valueLength: result.item?.value?.length || 0,
          timestamp: new Date().toISOString(),
        });
      }

      setLoading(false);
    },
    [
      id,
      rawId,
      isPublicView,
      publicOrg,
      publicAuth,
      crossOrgId,
      userInfo?.active_org?.id,
      parentOrg,
      subOrgs,
      navigate,
      entityBasePath,
      listFallbackIncident,
    ],
  );

  // Initial load. Only re-run when the underlying identity of the incident
  // changes (route id, cross-org override, or public-view auth). Depending on
  // `loadIncident` directly caused a spurious second fetch: dependencies like
  // `subOrgs`/`parentOrg` populate asynchronously after the first render and
  // change the callback identity, retriggering the effect a few seconds after
  // the initial load.
  const loadIncidentRef = useRef(loadIncident);
  useEffect(() => {
    loadIncidentRef.current = loadIncident;
  }, [loadIncident]);
  const transientLoadRetryRef = useRef(0);
  useEffect(() => {
    transientLoadRetryRef.current = 0;
    loadIncidentRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, crossOrgId, isPublicView, publicOrg, publicAuth]);

  // Retry once when sub-org / parent-org lists arrive after an empty first
  // load. Navigating from /incidents mounts this page before useSubOrgs has
  // resolved, so the initial cross-tenant probe has zero targets and reports
  // "not found". As soon as new probe targets become available, try again —
  // this makes click-through match the behaviour of a hard refresh.
  const suborgRetryRef = useRef(false);
  useEffect(() => {
    if (suborgRetryRef.current) return;
    if (loading || incident || isPublicView || !id) return;
    if (loadDebug?.stage !== "no-item" && loadDebug?.stage !== "no-success")
      return;
    if (subOrgs.length === 0 && !parentOrg) return;
    suborgRetryRef.current = true;
    loadIncidentRef.current?.();
  }, [
    loading,
    incident,
    isPublicView,
    id,
    loadDebug?.stage,
    subOrgs.length,
    parentOrg,
  ]);

  // Transport failures are not the same as a missing incident. Keep retrying a
  // few times before showing any terminal state so transient backend/circuit
  // breaker responses do not become a false "not found" screen.
  useEffect(() => {
    if (loading || incident || isPublicView || !id) return;
    const transient =
      loadDebug?.stage === "fetch-error" || loadDebug?.stage === "no-success";
    if (!transient) return;
    if (transientLoadRetryRef.current >= MAX_TRANSIENT_LOAD_RETRIES) return;
    transientLoadRetryRef.current += 1;
    // Fast first retries (circuit-breaker cooldowns are ~5-10s), then back off.
    const retryDelay = Math.min(
      800 * Math.pow(1.6, transientLoadRetryRef.current - 1),
      5000,
    );
    const timer = window.setTimeout(() => {
      loadIncidentRef.current?.();
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [
    loading,
    incident,
    isPublicView,
    id,
    loadDebug?.stage,
    loadDebug?.timestamp,
  ]);

  // Cross-org merge: once we know shared orgs and have the primary incident loaded,
  // fetch all other org versions and deep-merge them into the current data.
  const crossOrgMergedRef = useRef(false);
  useEffect(() => {
    if (
      !id ||
      !incident ||
      sharedOrgs.length === 0 ||
      isPublicView ||
      crossOrgMergedRef.current
    )
      return;
    crossOrgMergedRef.current = true;

    const mergeCrossOrg = async () => {
      console.log(
        `[CrossOrg] Merging data from ${sharedOrgs.length} other org(s)…`,
      );
      const primaryRaw = incident.rawOCSF || {};
      const primaryEdited = incident.editedTs || incident.createdTs || 0;
      let merged = { ...primaryRaw };

      const results = await Promise.allSettled(
        sharedOrgs.map((org) =>
          getDatastoreItem(id, DATASTORE_CATEGORIES.INCIDENTS, org.id),
        ),
      );

      for (const r of results) {
        if (
          r.status !== "fulfilled" ||
          !r.value.success ||
          !r.value.item?.value ||
          r.value.item.value.length <= 2
        )
          continue;
        try {
          const otherData = JSON.parse(r.value.item.value);
          const otherEdited = r.value.item.edited
            ? typeof r.value.item.edited === "number"
              ? r.value.item.edited
              : Number(r.value.item.edited)
            : 0;
          merged = deepMergeIncidents(
            merged,
            otherData,
            primaryEdited,
            otherEdited,
          );
          console.log(`[CrossOrg] Merged data from org, edited=${otherEdited}`);
        } catch (err) {
          console.warn("[CrossOrg] Failed to parse/merge org data:", err);
        }
      }

      // Re-parse merged data as if it came from the datastore
      const mergedItem = {
        key: id,
        value: JSON.stringify(merged),
        created: incident.createdTs
          ? Math.floor(incident.createdTs / 1000)
          : undefined,
        edited: incident.editedTs
          ? Math.floor(incident.editedTs / 1000)
          : undefined,
      };
      const reParsed = parseIncidentFromDatastore(mergedItem);
      if (reParsed) {
        console.log("[CrossOrg] Merged incident applied");
        setIncident(reParsed);
        setEditedTitle(reParsed.title ?? "");
        const rawDesc =
          reParsed.rawOCSF?.desc || reParsed.rawOCSF?.message || "";
        const rawDecoded = decodeIfBase64(rawDesc);
        setRawDescriptionHtml(rawDecoded !== rawDesc ? rawDecoded : rawDesc);
        setEditedMessage(
          htmlToPlainText(
            rawDecoded !== rawDesc
              ? rawDecoded
              : decodeIfBase64(htmlToPlainText(rawDesc)),
          ),
        );
        setEditedSeverity(reParsed.severity);
        const rawAssignee = reParsed.assignee || "";
        setEditedAssignee(isAIAssignee(rawAssignee) ? "AI Agent" : rawAssignee);
        setEditedStatus(reParsed.status);
        setEditedTlp(reParsed.tlp || "TLP:AMBER");
        setEditedReferences(
          Array.isArray(reParsed.references) ? reParsed.references : [],
        );
        setEditedObservables(reParsed.observables || []);
        setEnrichments(reParsed.enrichments || []);
        setEditedStakeholders(reParsed.stakeholders || []);
        setEditedLabels(reParsed.labels || []);
        setActivity(mergePendingActivity(reParsed.activity || []));
        const loadedTasks = reParsed.tasks || [];
        const normalizedTasks = loadedTasks.map(
          (task: IncidentTask, index: number) => ({
            ...task,
            id: task.id || `task-${Date.now()}-${index}`,
          }),
        );
        setTasks(normalizedTasks);
        // Update initial snapshot so auto-save doesn't fire from merge
        initialValuesRef.current = {
          title: reParsed.title ?? "",
          message: htmlToPlainText(
            rawDecoded !== rawDesc
              ? rawDecoded
              : decodeIfBase64(htmlToPlainText(rawDesc)),
          ),
          severity: reParsed.severity,
          assignee: isAIAssignee(rawAssignee) ? "AI Agent" : rawAssignee,
          status: reParsed.status,
          tlp: reParsed.tlp || "TLP:AMBER",
          references: JSON.stringify(reParsed.references || []),
          observables: JSON.stringify(reParsed.observables || []),
          customFields: JSON.stringify(reParsed.customFields || {}),
          stakeholders: JSON.stringify(reParsed.stakeholders || []),
          tasks: JSON.stringify(normalizedTasks),
          labels: JSON.stringify(reParsed.labels || []),
        };
      }
    };
    mergeCrossOrg();
  }, [id, incident?.id, sharedOrgs, isPublicView]);

  // Auto-resync untitled incidents immediately on load
  const autoResyncTriggeredRef = useRef(false);
  useEffect(() => {
    if (
      autoResyncTriggeredRef.current ||
      loading ||
      !incident ||
      isResyncing ||
      isPublicView
    )
      return;
    // Only trigger if incident has no meaningful title and has a resyncable source
    if (incident.title && incident.title !== incident.id) return;
    const source = incident.source || "";
    if (getResyncBlockedReason(incident)) return;

    autoResyncTriggeredRef.current = true;
    setIsResyncing(true);
    resyncState.add(incident.id);
    toast.success(`Resyncing from ${source}…`, { duration: 30000 });

    (async () => {
      try {
        const preResult = await getDatastoreItem(
          incident.id,
          DATASTORE_CATEGORIES.INCIDENTS,
          crossOrgId || undefined,
        );
        const previousEdited = preResult.item?.edited || 0;

        const response = await fetch(getApiUrl("/api/v1/apps/categories/run"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
            ...crossOrgHeaders,
          },
          body: JSON.stringify({
            action: "get_ticket",
            category: "cases",
            fields: [{ key: "id", value: incident.id }],
            app_name: source,
          }),
        });
        const responseBody = await response.json().catch(() => null);
        const failureReason = extractResyncFailureReason(responseBody);
        if (!response.ok || responseBody?.success === false) {
          toast.error(
            failureReason
              ? `Auto-resync failed: ${failureReason}`
              : "Auto-resync failed",
            { duration: 10000 },
          );
          setIsResyncing(false);
          resyncState.remove(incident.id);
          return;
        }
        // Poll every 5s for up to 30s checking if the item was updated
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          const postResult = await getDatastoreItem(
            incident.id,
            DATASTORE_CATEGORIES.INCIDENTS,
            crossOrgId || undefined,
          );
          const newEdited = postResult.item?.edited || 0;
          if (newEdited && newEdited !== previousEdited) {
            clearInterval(pollInterval);
            await loadIncident(false);
            setIsResyncing(false);
            resyncState.remove(incident.id);
            toast.success("Resync complete — update found");
          } else if (pollCount >= 6) {
            clearInterval(pollInterval);
            await loadIncident(false);
            setIsResyncing(false);
            resyncState.remove(incident.id);
            toast.info("Resync complete — no changes detected");
          }
        }, 5000);
      } catch {
        toast.error("Auto-resync failed");
        setIsResyncing(false);
        resyncState.remove(incident.id);
      }
    })();
  }, [loading, incident, isResyncing, isPublicView, loadIncident]);

  // Reconcile related_incidents from revisions. If a stale write elsewhere
  // dropped a pointer on this primary, walk revisions and union any prior
  // `related_incidents` / `_merged_data_from` back into the current row,
  // then persist. Runs once per incident load after revisions land.
  const relationsReconcileRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPublicView) return;
    if (revisionRestoredRef.current) return; // explicit rollback wins
    if (!id || !incident || !revisionsLoaded) return;
    if (relationsReconcileRef.current === id) return;
    relationsReconcileRef.current = id;
    const currentRaw = incident.rawOCSF;
    if (!currentRaw || typeof currentRaw !== "object") return;
    // Skip children — they only hold one pointer (to primary) which is
    // written atomically by linkMergePair and never dropped.
    if (currentRaw.merged_into || currentRaw.status_id === 6) return;
    const { raw: reconciled, changed } = reconcileRelatedFromRevisions(
      currentRaw,
      revisions,
    );
    if (!changed) return;
    const before = getLinkedPointers(currentRaw).length;
    const after = getLinkedPointers(reconciled).length;
    console.log(
      `[IncidentRelations] Reconciled from revisions: ${before} -> ${after} linked pointers`,
    );
    setIncident((prev) => (prev ? { ...prev, rawOCSF: reconciled } : prev));
    writeIncidentSafe(id, reconciled, crossOrgId || undefined).catch((err) =>
      console.warn("[IncidentRelations] persist reconciliation failed:", err),
    );
  }, [id, incident, revisionsLoaded, revisions, isPublicView, crossOrgId]);

  // Agents (and some ingest pipelines) can append tasks or activity entries
  // without a timestamp. Those render as "Invalid date" / sort to the epoch,
  // so we stamp them silently: an entry inherits the timestamp of the closest
  // preceding stamped sibling, falling back to the incident's edited/created
  // time. The repair is persisted so it only ever happens once.
  const timestampRepairRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPublicView) return;
    if (revisionRestoredRef.current) return;
    if (!id || !incident || loading) return;
    if (timestampRepairRef.current === id) return;
    const raw = incident.rawOCSF;
    if (!raw || typeof raw !== "object") return;
    timestampRepairRef.current = id;

    const fallbackTs = incident.editedTs || incident.createdTs || Date.now();
    const isMissing = (v: unknown) =>
      v === undefined ||
      v === null ||
      v === 0 ||
      v === "" ||
      (typeof v === "string" && Number.isNaN(Date.parse(v)));

    let repaired = 0;

    const stampTasks = (list: any[]): any[] => {
      let prev = incident.createdTs || fallbackTs;
      return list.map((task) => {
        if (!task || typeof task !== "object") return task;
        if (!isMissing(task.createdAt)) {
          const parsed = normalizeToMs(task.createdAt);
          if (parsed) prev = parsed;
          return task;
        }
        repaired++;
        return { ...task, createdAt: prev || fallbackTs };
      });
    };

    // Activity entries are appended when they happen, so an entry that is
    // missing (or has an unresolved template) timestamp was added *now*, not
    // back when its preceding sibling was written. Stamp it with the current
    // time so it sorts to the top of the timeline instead of the bottom.
    const stampActivity = (list: any[]): any[] => {
      const now = Date.now();
      let prev = incident.createdTs || fallbackTs;
      return list.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        if (!isMissing(entry.timestamp)) {
          const parsed = normalizeToMs(entry.timestamp);
          if (parsed) prev = parsed;
          return entry;
        }
        repaired++;
        return { ...entry, timestamp: Math.max(now, prev + 1) };
      });
    };

    const nextRaw: any = { ...raw };
    if (Array.isArray(raw.tasks)) nextRaw.tasks = stampTasks(raw.tasks);
    if (Array.isArray(raw.activity))
      nextRaw.activity = stampActivity(raw.activity);

    const customAttrs = raw?.metadata?.extensions?.custom_attributes;
    if (customAttrs && typeof customAttrs === "object") {
      const nextAttrs: any = { ...customAttrs };
      if (Array.isArray(customAttrs.tasks))
        nextAttrs.tasks = stampTasks(customAttrs.tasks);
      if (Array.isArray((customAttrs as any).activity)) {
        nextAttrs.activity = stampActivity((customAttrs as any).activity);
      }
      if (repaired > 0) {
        nextRaw.metadata = {
          ...(raw.metadata || {}),
          extensions: {
            ...((raw.metadata as any)?.extensions || {}),
            custom_attributes: nextAttrs,
          },
        };
      }
    }

    if (repaired === 0) return;

    console.log(
      `[IncidentDetail] Stamped ${repaired} task/activity entr(ies) missing a timestamp`,
    );

    setIncident((prev) => (prev ? { ...prev, rawOCSF: nextRaw } : prev));
    if (Array.isArray(nextRaw.tasks)) {
      setTasks(nextRaw.tasks as IncidentTask[]);
      if (initialValuesRef.current) {
        initialValuesRef.current.tasks = JSON.stringify(nextRaw.tasks);
      }
    }
    if (Array.isArray(nextRaw.activity)) setActivity(nextRaw.activity as any);

    writeIncidentSafe(id, nextRaw, crossOrgId || undefined).catch((err) =>
      console.warn("[IncidentDetail] Failed to persist timestamp repair:", err),
    );
  }, [id, incident, loading, isPublicView, crossOrgId]);

  // Show toast for invalid data incidents (no title + no source). We wait for
  // revisions to finish loading and for the OCSF-recovery fallback to attempt
  // a merge — if recovery succeeds, the inline banner replaces the toast.
  const invalidDataToastShown = useRef(false);
  useEffect(() => {
    if (invalidDataToastShown.current || loading || !incident) return;
    if (!revisionsLoaded || !ocsfFallbackAttemptedRef.current) return;
    if (ocsfFallbackInfo) return; // Recovery succeeded — banner explains it
    const hasTitle = !!incident.title;
    const hasSource = !!incident.source;
    if (!hasTitle && !hasSource) {
      invalidDataToastShown.current = true;
      toast.error(
        t(
          "This incident is not in a valid OCSF format. Validate your ingest pipeline or contact support@shuffler.io",
        ),
        { duration: 8000 },
      );
    }
  }, [loading, incident, revisionsLoaded, ocsfFallbackInfo, t]);

  // OCSF-recovery fallback. Triggered once revisions have loaded for an incident
  // whose live payload is NOT OCSF-shaped. Strategy:
  //   1. Walk revisions newest → oldest, find the most recent OCSF-valid one.
  //   2. If the newest revision (or live payload) is also valid JSON, overlay
  //      its top-level fields onto the OCSF base so newer edits aren't lost.
  //   3. Re-parse and apply the merged data into the page state.
  // This is purely a display fallback — the underlying datastore item is not
  // modified.
  useEffect(() => {
    if (loading || !incident || !revisionsLoaded) return;
    if (ocsfFallbackAttemptedRef.current) return;
    if (revisionRestoredRef.current) {
      // The user deliberately rolled back to an older snapshot — never fold
      // newer revisions back on top of it.
      ocsfFallbackAttemptedRef.current = true;
      return;
    }

    const liveIsOcsf = isOcsfShapedData(incident.rawOCSF);
    const missingFields = liveIsOcsf
      ? getMissingCriticalFields(incident.rawOCSF)
      : [];
    const needsRecovery = !liveIsOcsf || missingFields.length > 0;

    if (!needsRecovery) {
      ocsfFallbackAttemptedRef.current = true;
      return;
    }

    ocsfFallbackAttemptedRef.current = true;

    // Walk ALL revisions oldest → newest and fold every OCSF-shaped one into
    // an accumulator. A single bad revision can drop a field that an earlier
    // (and a later) revision still has — folding the whole chain lets us
    // recover from any of them instead of stopping at the first hit.
    // `revisions` is sorted newest-first, so iterate in reverse.
    const ocsfRevisions: Array<{ data: any; ts: number; index: number }> = [];
    for (let i = revisions.length - 1; i >= 0; i--) {
      const rev = revisions[i];
      const parsed = parseRevisionValue(rev?.value);
      if (!parsed || !isOcsfShapedData(parsed)) continue;
      ocsfRevisions.push({
        data: parsed,
        ts: normalizeToMs(rev?.edited ?? rev?.created),
        index: i,
      });
    }
    if (ocsfRevisions.length === 0) return; // Nothing to recover from

    let ocsfBase: any = ocsfRevisions[0].data;
    let ocsfBaseTs = ocsfRevisions[0].ts;
    for (let i = 1; i < ocsfRevisions.length; i++) {
      const next = ocsfRevisions[i];
      try {
        ocsfBase = deepMergeIncidents(ocsfBase, next.data, ocsfBaseTs, next.ts);
        ocsfBaseTs = next.ts || ocsfBaseTs;
      } catch (err) {
        console.warn(
          "[OCSF Fallback] Skipping revision merge at index",
          next.index,
          err,
        );
      }
    }
    const recoveredRevisionCount = ocsfRevisions.length;
    const newestRevisionTs =
      ocsfRevisions[ocsfRevisions.length - 1].ts || ocsfBaseTs;

    // Overlay the live payload last so the freshest edits win on conflicts,
    // while any field still missing from live gets backfilled from the merged
    // revision history.
    const liveData = incident.rawOCSF || {};
    const liveTs = incident.editedTs || incident.createdTs || 0;
    let merged: any;
    let overlaidFieldCount = 0;
    if (liveData && typeof liveData === "object" && !Array.isArray(liveData)) {
      try {
        merged = deepMergeIncidents(ocsfBase, liveData, ocsfBaseTs, liveTs);
        overlaidFieldCount = liveIsOcsf
          ? missingFields.length
          : Object.keys(liveData).filter((k) => !(k in ocsfBase)).length;
      } catch (err) {
        console.warn(
          "[OCSF Fallback] deepMergeIncidents failed, using base only:",
          err,
        );
        merged = ocsfBase;
      }
    } else {
      merged = ocsfBase;
    }

    const reParsed = parseIncidentFromDatastore({
      key: incident.id,
      value: JSON.stringify(merged),
      created: incident.createdTs
        ? Math.floor(incident.createdTs / 1000)
        : undefined,
      edited: incident.editedTs
        ? Math.floor(incident.editedTs / 1000)
        : undefined,
    });
    if (!reParsed) return;

    console.log(
      "[OCSF Fallback] Recovered by folding",
      recoveredRevisionCount,
      "OCSF revision(s); newest at",
      new Date(newestRevisionTs).toISOString(),
      `— ${overlaidFieldCount} field(s) overlaid from live`,
    );

    setIncident(reParsed);
    setEditedTitle(reParsed.title ?? "");
    const rawDesc = reParsed.rawOCSF?.desc || reParsed.rawOCSF?.message || "";
    const rawDecoded = decodeIfBase64(rawDesc);
    setRawDescriptionHtml(rawDecoded !== rawDesc ? rawDecoded : rawDesc);
    setEditedMessage(
      htmlToPlainText(
        rawDecoded !== rawDesc
          ? rawDecoded
          : decodeIfBase64(htmlToPlainText(rawDesc)),
      ),
    );
    setEditedSeverity(reParsed.severity);
    const rawAssignee = reParsed.assignee || "";
    setEditedAssignee(isAIAssignee(rawAssignee) ? "AI Agent" : rawAssignee);
    setEditedStatus(reParsed.status);
    setEditedTlp(reParsed.tlp || "TLP:AMBER");
    setEditedReferences(
      Array.isArray(reParsed.references) ? reParsed.references : [],
    );
    setEditedObservables(reParsed.observables || []);
    setEnrichments(reParsed.enrichments || []);
    setEditedStakeholders(reParsed.stakeholders || []);
    setEditedLabels(reParsed.labels || []);
    setActivity(mergePendingActivity(reParsed.activity || []));

    // Compute what is STILL missing after we folded revisions into the base
    // and overlaid live edits. Only these should surface as "missing" in the
    // UI — anything the recovery could refill is not the reader's problem.
    const stillMissing = isOcsfShapedData(merged)
      ? getMissingCriticalFields(merged)
      : [];

    setOcsfFallbackInfo({
      revisionTimestamp: newestRevisionTs,
      overlaidFieldCount,
      reason: liveIsOcsf ? "missing-fields" : "not-ocsf",
      missingFields,
      stillMissingFields: stillMissing,
      recoveredValue: JSON.stringify(ocsfBase),
    });
  }, [loading, incident, revisionsLoaded, revisions]);

  // Validate assignee against team members once users finish loading
  useEffect(() => {
    if (usersLoading || !editedAssignee) return;

    // AI Agent is always valid
    if (isAIAssignee(editedAssignee)) {
      if (editedAssignee !== "AI Agent") {
        setEditedAssignee("AI Agent");
        // Update snapshot so this normalization isn't treated as a user change
        if (initialValuesRef.current) {
          initialValuesRef.current.assignee = "AI Agent";
        }
      }
      return;
    }

    // Check if assignee is a valid team member
    const validUsernames = users.map((u) => u.username.toLowerCase());
    if (!validUsernames.includes(editedAssignee.toLowerCase())) {
      // Invalid assignee - clear it
      setEditedAssignee("");
      // Update snapshot so this normalization isn't treated as a user change
      if (initialValuesRef.current) {
        initialValuesRef.current.assignee = "";
      }
    }
  }, [usersLoading, users, editedAssignee]);

  // Auto-refresh every 30 seconds to keep incident up-to-date
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Only refresh if not currently saving
      if (!pendingSaveRef.current && !isSaving) {
        loadIncident(false);
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [loadIncident, isSaving]);

  // Refresh when the tab becomes visible again so the user always sees the
  // latest content after switching away and back.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (pendingSaveRef.current || isSaving) return;
      loadIncident(false);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadIncident, isSaving]);

  // External refresh trigger: components that mutate the current incident
  // out-of-band (e.g. the retroactive routing-rule scanner in
  // SelectionRuleChip) dispatch `incident:refresh` with the target id so
  // the detail view reflects the change immediately instead of waiting for
  // the 30s poll.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!id) return;
      if (detail?.id && String(detail.id) !== String(id)) return;
      if (pendingSaveRef.current || isSaving) return;
      loadIncident(false);
    };
    window.addEventListener("incident:refresh", handler as EventListener);
    return () =>
      window.removeEventListener("incident:refresh", handler as EventListener);
  }, [id, loadIncident, isSaving]);

  // Fetch correlations — extracted into a callback so the "Re-run" button on
  // the Correlations tab header can refresh on demand. Deferred until the
  // incident is loaded to avoid blocking the UI.
  const fetchCorrelations = useCallback(async () => {
    if (!id) return;

    setCorrelationsLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/v2/correlations"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
          ...crossOrgHeaders,
        },
        body: JSON.stringify({
          type: "datastore",
          key: id,
          category: DATASTORE_CATEGORIES.INCIDENTS,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // API returns array directly with { key, amount, ref[] }
        const correlationData = Array.isArray(data)
          ? data
          : data.correlations || data.data || [];
        // Filter out noise: current incident key, status values, severity values, and common non-meaningful keys
        const noiseKeys = new Set(
          [
            "new",
            "in_progress",
            "resolved",
            "escalated",
            "closed",
            "open",
            "pending",
            "critical",
            "high",
            "medium",
            "low",
            "informational",
            "info",
            "warning",
            "error",
            "unknown",
            "none",
            "null",
            "undefined",
            "true",
            "false",
            id?.toLowerCase(),
          ].filter(Boolean),
        );
        const currentIdLower = (id || "").toLowerCase();
        const filteredCorr = correlationData.filter(
          (c: { key: string; ref?: string[] }) => {
            if (noiseKeys.has(c.key.toLowerCase())) return false;
            // Exclude correlations whose only reference is the current incident itself —
            // a correlation needs at least one OTHER incident to be meaningful.
            const refs = Array.isArray(c.ref) ? c.ref : [];
            const otherRefs = refs.filter((r) => {
              const tail =
                (r.includes("|") ? r.split("|").pop() : r.split("/").pop()) ||
                "";
              return tail.toLowerCase() !== currentIdLower;
            });
            return otherRefs.length > 0;
          },
        );
        setCorrelations(filteredCorr);

        // Stamp NEW correlation keys with a first-seen timestamp and persist
        // a tiny `{ key: epochMs }` map under metadata.extensions.custom_attributes.
        // We deliberately store ONLY the timestamp (not the full correlation
        // payload) — the live data is always re-fetched from the API.
        if (filteredCorr.length > 0) {
          setCorrelationFirstSeen((prev) => {
            const now = Date.now();
            const next = { ...prev };
            let added = 0;
            for (const c of filteredCorr) {
              if (!c?.key) continue;
              if (next[c.key] === undefined) {
                next[c.key] = now;
                added += 1;
              }
            }
            if (added === 0) return prev;
            // Fire-and-forget persist of the tiny first-seen map. We update
            // ONLY the correlation_first_seen field — everything else is
            // copied through verbatim so we don't clobber concurrent edits.
            const snap = incidentRef.current?.rawOCSF as
              Record<string, unknown> | undefined;
            if (snap && id) {
              const meta =
                (snap.metadata as Record<string, unknown> | undefined) || {};
              const exts =
                (meta.extensions as Record<string, unknown> | undefined) || {};
              const custom =
                (exts.custom_attributes as
                  Record<string, unknown> | undefined) || {};
              const updated = {
                ...snap,
                metadata: {
                  ...meta,
                  extensions: {
                    ...exts,
                    custom_attributes: {
                      ...custom,
                      correlation_first_seen: next,
                    },
                  },
                },
              };
              writeIncidentSafe(id, updated, crossOrgId || undefined).catch(
                (err) =>
                  console.warn("[Correlations] persist first-seen failed", err),
              );
            }
            // Anchor the timeline pill at the earliest stamp we know about.
            const earliest = Math.min(...Object.values(next));
            setCorrelationsDiscoveredAt(earliest);
            return next;
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch correlations:", error);
    } finally {
      setCorrelationsLoading(false);
    }
  }, [id, crossOrgHeaders, crossOrgId]);

  useEffect(() => {
    if (loading) return;
    fetchCorrelations();
  }, [fetchCorrelations, loading]);

  // Hydrate correlation_first_seen from the persisted incident payload so the
  // timeline shows the original discovery time across reloads, and keep the
  // incidentRef pointed at the latest snapshot for the persist path inside
  // fetchCorrelations.
  useEffect(() => {
    incidentRef.current = incident as {
      rawOCSF?: Record<string, unknown>;
    } | null;
    const raw = incident?.rawOCSF as Record<string, unknown> | undefined;
    const persisted = (
      (
        (raw?.metadata as Record<string, unknown> | undefined)?.extensions as
          Record<string, unknown> | undefined
      )?.custom_attributes as Record<string, unknown> | undefined
    )?.correlation_first_seen as Record<string, number> | undefined;
    if (persisted && typeof persisted === "object") {
      setCorrelationFirstSeen((prev) => {
        // Only seed missing keys — don't overwrite stamps we set this session.
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(persisted)) {
          if (typeof v === "number" && next[k] === undefined) {
            next[k] = v;
            changed = true;
          }
        }
        if (!changed) return prev;
        const earliest = Math.min(...Object.values(next));
        setCorrelationsDiscoveredAt((d) => d ?? earliest);
        return next;
      });
    }
  }, [incident]);

  // ── Pivot landing: when arriving via ?correlation=…&focus=… (clicked a
  // chip on another incident's Correlations tab), flash the matching row and
  // scroll to it once the correlations have loaded. The `focus` param is
  // surfaced separately so the originating-incident chip pulses inside the
  // row, making the bidirectional link obvious.
  const focusedReferrerIncidentKey = searchParams.get("focus") || undefined;
  useEffect(() => {
    const targetCorrKey = searchParams.get("correlation");
    if (!targetCorrKey) return;
    if (correlationsLoading) return;
    if (!correlations.some((c) => c.key === targetCorrKey)) return;
    focusCorrelationFromTimeline(targetCorrKey);
    // Run only when the resolved correlations array changes, not on every
    // searchParams tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correlations, correlationsLoading]);

  // Tick periodically while the incident is "fresh" (created within the last
  // 2 minutes) so the observables area can show a loading state until the
  // background enrichment window has elapsed.
  useEffect(() => {
    const createdTs = incident?.createdTs || 0;
    if (!createdTs) return;
    const age = Date.now() - createdTs;
    if (age >= FRESH_OBS_WINDOW_MS) return;
    const tickId = window.setInterval(() => setNowTick(Date.now()), 2000);
    const expireId = window.setTimeout(
      () => setNowTick(Date.now()),
      FRESH_OBS_WINDOW_MS - age + 50,
    );
    return () => {
      window.clearInterval(tickId);
      window.clearTimeout(expireId);
    };
  }, [incident?.createdTs]);

  // ── Keystroke tracker ──────────────────────────────────────────────────
  // The background poll defers when the user has typed in the last 1.5s so
  // we never disrupt active typing in a textfield.
  useEffect(() => {
    const onKey = () => {
      lastKeystrokeRef.current = Date.now();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ── Background incident poll ───────────────────────────────────────────
  // Periodically re-fetches the incident from the datastore so freshly
  // computed observables / enrichments / activity stream in without a
  // page reload. Carefully avoids touching any field the user is editing.
  useEffect(() => {
    if (!incident || !id || isPublicView || loading) return;
    // Poll faster while the incident is "fresh" (just created), then slow
    // down to a gentle background heartbeat for the rest of the session.
    const ageMs = Date.now() - (incident.createdTs || 0);
    const intervalMs = ageMs < FRESH_OBS_WINDOW_MS ? 5000 : 15000;

    let cancelled = false;
    const tick = async () => {
      // Defer if the user is actively typing — we'll catch up on the next tick.
      if (Date.now() - lastKeystrokeRef.current < 1500) return;
      // Defer if a save is queued / in flight to avoid a stale overwrite.
      if (pendingSaveRef.current || isSaving) return;
      try {
        const result = await getDatastoreItem(
          id,
          DATASTORE_CATEGORIES.INCIDENTS,
          crossOrgId || undefined,
        );
        if (cancelled || !result.success || !result.item) return;
        const reParsed = parseIncidentFromDatastore({
          key: result.item.key || id,
          value: result.item.value,
          created: result.item.created,
          edited: result.item.edited,
          enrichments: result.item.enrichments,
        });
        if (!reParsed) return;

        // ─ Enrichments: always replace, these are server-managed ───────
        const newEnrichments = reParsed.enrichments || [];
        setEnrichments((prev) => {
          const prevKeys = new Set(
            prev.map(
              (e) =>
                `${(e.type || "").toLowerCase()}::${(e.value || e.data || "").toLowerCase()}`,
            ),
          );
          const added: string[] = [];
          for (const e of newEnrichments) {
            const k = `${(e.type || "").toLowerCase()}::${(e.value || e.data || "").toLowerCase()}`;
            if (!prevKeys.has(k)) added.push(k);
          }
          if (added.length > 0) {
            setNewlyArrivedObservables((s) => {
              const next = new Set(s);
              added.forEach((k) => next.add(k));
              return next;
            });
            // Fade out the highlight after the animation completes.
            window.setTimeout(() => {
              setNewlyArrivedObservables((s) => {
                const next = new Set(s);
                added.forEach((k) => next.delete(k));
                return next;
              });
            }, 6000);
          }
          return newEnrichments;
        });

        // ─ Manual observables: only adopt if not dirty (user hasn't edited)
        const newObs = reParsed.observables || [];
        const obsDirty =
          obsJsonRef.current !== initialValuesRef.current?.observables;
        if (!obsDirty) {
          setEditedObservables((prev) => {
            const prevKeys = new Set(
              prev.map(
                (o) =>
                  `${(o.type || "").toLowerCase()}::${(o.value || "").toLowerCase()}`,
              ),
            );
            const added: string[] = [];
            for (const o of newObs) {
              const k = `${(o.type || "").toLowerCase()}::${(o.value || "").toLowerCase()}`;
              if (!prevKeys.has(k)) added.push(k);
            }
            if (added.length > 0) {
              setNewlyArrivedObservables((s) => {
                const next = new Set(s);
                added.forEach((k) => next.add(k));
                return next;
              });
              window.setTimeout(() => {
                setNewlyArrivedObservables((s) => {
                  const next = new Set(s);
                  added.forEach((k) => next.delete(k));
                  return next;
                });
              }, 6000);
            }
            return newObs;
          });
          // Keep snapshot in sync so auto-save doesn't fire from background poll.
          if (initialValuesRef.current) {
            initialValuesRef.current.observables = JSON.stringify(newObs);
          }
        }

        // ─ Activity feed: only adopt if not dirty ──────────────────────
        const newActivity = mergePendingActivity(reParsed.activity || []);
        setActivity((prev) => {
          // Only replace if the server has more / different items, otherwise
          // we'd risk wiping an optimistic local addition (e.g. a comment
          // posted milliseconds before the poll completed).
          if (newActivity.length <= prev.length) return prev;
          const prevIds = new Set(prev.map((a) => a.id));
          const added: string[] = [];
          for (const a of newActivity) {
            if (a.id && !prevIds.has(a.id)) added.push(a.id);
          }
          if (added.length > 0) {
            setNewlyArrivedActivity((s) => {
              const next = new Set(s);
              added.forEach((k) => next.add(k));
              return next;
            });
            window.setTimeout(() => {
              setNewlyArrivedActivity((s) => {
                const next = new Set(s);
                added.forEach((k) => next.delete(k));
                return next;
              });
            }, 6000);
          }
          return newActivity;
        });

        // ─ incident.editedTs / lightweight metadata refresh ────────────
        setIncident((curr) => {
          if (!curr) return curr;
          if ((reParsed.editedTs || 0) <= (curr.editedTs || 0)) return curr;
          // Only refresh server-managed fields; preserve any in-flight user edits.
          return {
            ...curr,
            editedTs: reParsed.editedTs,
            enrichments: newEnrichments,
            observables: obsDirty ? curr.observables : newObs,
            activity:
              (reParsed.activity || []).length > (curr.activity?.length || 0)
                ? reParsed.activity
                : curr.activity,
            rawOCSF: reParsed.rawOCSF,
          };
        });
      } catch (err) {
        // Silent: this is a background heartbeat, not a user action.
        console.debug("[IncidentPoll] tick failed:", err);
      }
    };

    const intervalId = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    incident?.id,
    id,
    isPublicView,
    loading,
    crossOrgId,
    isSaving,
    FRESH_OBS_WINDOW_MS,
    incident?.createdTs,
  ]);

  // Fetch per-observable correlations as soon as the incident is loaded.
  // Previously this was gated behind `activeTab === 2` (Observables tab), but
  // the timeline / chat needs these lookups too — without them the IOC red
  // highlight never appears unless the user manually opens Observables. Run
  // eagerly so the timeline lights up correlations on first paint.
  useEffect(() => {
    if (loading) return;
    const manualObs = editedObservables.filter((o) => !o.archived);
    const enrichObs = enrichments.map((e) => ({
      type: e.type || "unknown",
      value: e.value || e.data || "",
    }));
    const allObs = [...manualObs, ...enrichObs].filter((o) => o.value);
    // Limit to 20
    const toFetch = allObs.slice(0, 20);
    if (toFetch.length === 0) return;

    const noiseKeys = new Set(
      [
        "new",
        "in_progress",
        "resolved",
        "escalated",
        "closed",
        "open",
        "pending",
        "critical",
        "high",
        "medium",
        "low",
        "informational",
        "info",
        "warning",
        "error",
        "unknown",
        "none",
        "null",
        "undefined",
        "true",
        "false",
        id?.toLowerCase(),
      ].filter(Boolean),
    );

    toFetch.forEach(async (obs) => {
      // Normalize to lowercase so case-only duplicates (e.g. an email-body
      // URL with capital letters vs. the backend-lowercased enrichment of
      // the same URL) share a single correlations entry, and so the lookup
      // hits IOC datastore keys which are stored lowercased.
      const lowerValue = String(obs.value || "").toLowerCase();
      const obsKey = `${String(obs.type || "").toLowerCase()}::${lowerValue}`;
      // Skip if already fetched (with data or empty) or currently loading
      if (obsCorrelations[obsKey] !== undefined) return;

      setObsCorrelations((prev) => {
        if (prev[obsKey] !== undefined) return prev;
        return { ...prev, [obsKey]: { loading: true, data: [] } };
      });
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(getApiUrl("/api/v2/correlations"), {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
            ...crossOrgHeaders,
          },
          body: JSON.stringify({
            type: "value",
            key: lowerValue,
          }),
        });
        clearTimeout(timeout);
        if (resp.ok) {
          const data = await resp.json();
          const corrData = Array.isArray(data)
            ? data
            : data.correlations || data.data || [];
          const filtered = corrData.filter(
            (c: { key: string }) => !noiseKeys.has(c.key.toLowerCase()),
          );
          setObsCorrelations((prev) => ({
            ...prev,
            [obsKey]: {
              loading: false,
              data: filtered,
              discoveredAt: filtered.length > 0 ? Date.now() : undefined,
            },
          }));
        } else {
          setObsCorrelations((prev) => ({
            ...prev,
            [obsKey]: { loading: false, data: [] },
          }));
        }
      } catch {
        setObsCorrelations((prev) => ({
          ...prev,
          [obsKey]: { loading: false, data: [] },
        }));
      }
    });
  }, [loading, editedObservables, enrichments, id]);

  // Re-run correlation lookup for a single observable on demand. Used by the
  // small refresh button next to each observable's "Correlations" header so
  // the user can poke at it without leaving the row.
  const refetchObsCorrelation = useCallback(
    async (obs: { type: string; value: string }) => {
      if (!obs?.value) return;
      const lowerValue = String(obs.value || "").toLowerCase();
      const obsKey = `${String(obs.type || "").toLowerCase()}::${lowerValue}`;
      const noiseKeys = new Set(
        [
          "new",
          "in_progress",
          "resolved",
          "escalated",
          "closed",
          "open",
          "pending",
          "critical",
          "high",
          "medium",
          "low",
          "informational",
          "info",
          "warning",
          "error",
          "unknown",
          "none",
          "null",
          "undefined",
          "true",
          "false",
          id?.toLowerCase(),
        ].filter(Boolean),
      );
      setObsCorrelations((prev) => ({
        ...prev,
        [obsKey]: { loading: true, data: prev[obsKey]?.data || [] },
      }));
      try {
        const resp = await fetch(getApiUrl("/api/v2/correlations"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
            ...crossOrgHeaders,
          },
          body: JSON.stringify({ type: "value", key: lowerValue }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const corrData = Array.isArray(data)
            ? data
            : data.correlations || data.data || [];
          const filtered = corrData.filter(
            (c: { key: string }) => !noiseKeys.has(c.key.toLowerCase()),
          );
          setObsCorrelations((prev) => ({
            ...prev,
            [obsKey]: {
              loading: false,
              data: filtered,
              discoveredAt:
                filtered.length > 0 ? Date.now() : prev[obsKey]?.discoveredAt,
            },
          }));
        } else {
          setObsCorrelations((prev) => ({
            ...prev,
            [obsKey]: { loading: false, data: [] },
          }));
        }
      } catch {
        setObsCorrelations((prev) => ({
          ...prev,
          [obsKey]: { loading: false, data: [] },
        }));
      }
    },
    [id, crossOrgHeaders],
  );

  const saveToDatastore = useCallback(async () => {
    if (!incident?.id) return;

    setIsSaving(true);
    pendingSaveRef.current = false;

    const severityOption = severityOptions.find(
      (s) => s.value === editedSeverity,
    );
    const { label: statusLabel, id: statusId } = getOCSFStatus(editedStatus);

    // Get existing finding info from list (new) or direct (legacy)
    const existingFindingInfo =
      incident.rawOCSF?.finding_info_list?.[0] ||
      (incident.rawOCSF as any)?.finding_info;

    // CRITICAL: Never use undefined - always use empty values to prevent field deletion
    const updatedData = incident.rawOCSF
      ? {
          ...incident.rawOCSF,
          // Keep top-level title in sync with finding_info_list[0].title so
          // re-fetches (which read ocsf.title first) reflect the edit.
          title: editedTitle,
          desc: editedMessage || editedTitle,
          severity_id: severityOption?.id || 3,
          severity: severityOption?.label || "Medium",
          status_id: statusId,
          status: statusLabel,
          assignee: editedAssignee.trim() || "",
          types: editedLabels, // OCSF types[] field for labels
          observables: editedObservables,
          stakeholders: editedStakeholders,
          // Mirror references at the top level so the loader's primary path
          // (ocsf.references) reflects edits — finding_info_list[0].references
          // is only the secondary store.
          references: editedReferences,
          // Store tasks and activity at top level (primary location)
          tasks: tasks, // Always include, even if empty array
          activity: activity, // Always include, even if empty array
          finding_info_list: [
            {
              ...existingFindingInfo,
              title: editedTitle,
              references: editedReferences, // Always include, even if empty array
              src_url: editedReferences[0] || "",
            },
          ],
          metadata: {
            ...incident.rawOCSF.metadata,
            extensions: {
              ...incident.rawOCSF.metadata?.extensions,
              custom_attributes: {
                ...incident.rawOCSF.metadata?.extensions?.custom_attributes,
                tlp: editedTlp,
                assignee: editedAssignee.trim() || "", // Sync metadata assignee with top-level
                customFields: editedCustomFields,
                stakeholders: editedStakeholders,
                // Mirror observables here — the loader prefers this path first,
                // so a stale legacy value would otherwise win over the
                // top-level edit.
                observables: editedObservables,
              },
            },
          },
        }
      : {
          id: incident.id,
          title: editedTitle,
          source: incident.source,
          severity: editedSeverity,
          status: editedStatus,
          assignee: editedAssignee.trim() || "",
          tlp: editedTlp,
          references: editedReferences,
          stakeholders: editedStakeholders,
          observables: editedObservables,
          customFields: editedCustomFields,
          activity: activity,
          tasks: tasks,
        };

    try {
      const saveResult = await writeIncidentSafe(
        incident.id,
        updatedData,
        crossOrgId || undefined,
      );
      const saveSuccess = saveResult.success;
      if (!saveSuccess) {
        toast.error("Failed to save changes");
        return;
      }

      // Sync to shared orgs (fire-and-forget to avoid blocking primary save)
      if (sharedOrgs.length > 0) {
        Promise.allSettled(
          sharedOrgs.map((org) =>
            writeIncidentSafe(incident.id, updatedData, org.id),
          ),
        ).then((results) => {
          const failed = results.filter(
            (r) =>
              r.status === "rejected" ||
              (r.status === "fulfilled" && !r.value.success),
          );
          if (failed.length > 0) {
            console.warn(
              `[CrossOrgSync] ${failed.length}/${sharedOrgs.length} org saves failed`,
            );
          }
        });
      }
      // Update local incident state so OCSF tab reflects the latest saved data
      setIncident((prev) => (prev ? { ...prev, rawOCSF: updatedData } : prev));
      // Also update the raw JSON text if the user has the raw tab open
      setRawJsonText(JSON.stringify(updatedData, null, 2));

      // Update the initial snapshot so future comparisons are against the saved state
      // Use cached JSON refs to avoid redundant serialization
      initialValuesRef.current = {
        title: editedTitle,
        message: editedMessage,
        severity: editedSeverity,
        assignee: editedAssignee,
        status: editedStatus,
        tlp: editedTlp,
        references: refsJsonRef.current,
        observables: obsJsonRef.current,
        customFields: cfJsonRef.current,
        tasks: tasksJsonRef.current,
        stakeholders: stakeholdersJsonRef.current,
        labels: labelsJsonRef.current,
      };

      // Post-save verification: pull back the data after a short delay and verify key fields
      setTimeout(async () => {
        try {
          // Fetch-back can transiently fail (circuit breaker, eventual
          // consistency). Retry once before giving up, and never alarm the
          // user — the save itself already reported success/failure.
          let verified = await getItem(incident.id);
          if (!verified) {
            await new Promise((r) => setTimeout(r, 2000));
            verified = await getItem(incident.id);
          }
          if (!verified) {
            console.warn(
              "[SaveVerify] Could not fetch back saved incident (transient, ignored)",
            );
            return;
          }

          const savedData =
            typeof verified.value === "string"
              ? JSON.parse(verified.value)
              : verified.value;
          const issues: string[] = [];

          // Verify observables
          const savedObs =
            savedData?.observables ||
            savedData?.metadata?.extensions?.custom_attributes?.observables ||
            [];
          const expectedObs = editedObservables;
          if (JSON.stringify(savedObs) !== JSON.stringify(expectedObs)) {
            issues.push("observables");
          }

          // Verify tasks
          const savedTasks =
            savedData?.tasks ||
            savedData?.metadata?.extensions?.custom_attributes?.tasks ||
            [];
          if (JSON.stringify(savedTasks) !== JSON.stringify(tasks)) {
            issues.push("tasks");
          }

          // Verify activity
          const savedActivity = savedData?.activity || [];
          if (JSON.stringify(savedActivity) !== JSON.stringify(activity)) {
            issues.push("activity");
          }

          if (issues.length > 0) {
            // Suppressed user-facing toast — rapid sequential updates often
            // cause the verify snapshot to lag behind the latest in-memory
            // state, producing false-positive mismatches. Keep the console
            // warning for debugging but do not alarm the user.
            console.warn("[SaveVerify] Mismatch detected in:", issues);
          } else {
            console.log("[SaveVerify] Verified successfully");
          }
        } catch (verifyErr) {
          console.warn("[SaveVerify] Verification error:", verifyErr);
        }
      }, 1500);

      // Refresh revisions after a short delay so the Activity feed shows the new change
      setTimeout(() => {
        loadRevisions();
      }, 3000);

      // Schedule observable/enrichment refresh ~7s after save
      // Backend may update enrichments asynchronously after the save
      if (obsRefreshTimerRef.current) clearTimeout(obsRefreshTimerRef.current);
      setRefreshingObservables(true);
      obsCheckStartedAtRef.current = Date.now();
      setObsCheckTick((t) => t + 1);
      const refreshId = Date.now();
      (obsRefreshTimerRef as any)._activeId = refreshId;
      // Hard wall-clock safety: even if the refresh fetch hangs (the
      // datastore fetch has no abort signal), force the spinner off after
      // 20s so the UI never gets stuck. Stored on the ref so a subsequent
      // refresh can clear it.
      const hardTimeout = setTimeout(() => {
        if ((obsRefreshTimerRef as any)._activeId === refreshId) {
          console.warn(
            "[ObsRefresh] Hard timeout reached — forcing spinner off",
          );
          setRefreshingObservables(false);
        }
      }, 20000);
      (obsRefreshTimerRef as any)._hardTimeout = hardTimeout;
      obsRefreshTimerRef.current = setTimeout(async () => {
        try {
          const refreshResult = isPublicView
            ? await getDatastoreItemPublic(incident.id, publicOrg!, publicAuth!)
            : await getDatastoreItem(
                incident.id,
                DATASTORE_CATEGORIES.INCIDENTS,
                crossOrgId || undefined,
              );
          if (refreshResult.success && refreshResult.item) {
            const refreshData = {
              key: refreshResult.item.key || incident.id,
              value: refreshResult.item.value,
              created: refreshResult.item.created,
              edited: refreshResult.item.edited,
              enrichments: refreshResult.item.enrichments,
            };
            const reParsed = parseIncidentFromDatastore(refreshData);
            if (reParsed) {
              const prevCount =
                editedObservables.filter((o) => !o.archived).length +
                enrichments.length;
              const newEnrichments = reParsed.enrichments || [];
              const newObservables = reParsed.observables || [];
              const newCount =
                newObservables.filter((o: any) => !o.archived).length +
                newEnrichments.length;
              setEnrichments(newEnrichments);
              // Only update manual observables if server added new ones (don't overwrite user edits)
              if (newObservables.length > editedObservables.length) {
                setEditedObservables(newObservables);
              }
              // Silently refresh observables — no toast needed
              console.log(
                `[ObsRefresh] Refreshed observables: ${prevCount} → ${newCount}`,
              );
            }
          }
        } catch (err) {
          console.warn("[ObsRefresh] Failed to refresh observables:", err);
        } finally {
          clearTimeout(hardTimeout);
          // Only clear loading if this is still the active refresh
          if ((obsRefreshTimerRef as any)._activeId === refreshId) {
            setRefreshingObservables(false);
          }
        }
      }, 7000);
    } finally {
      setIsSaving(false);
    }
  }, [
    incident,
    editedTitle,
    editedMessage,
    editedSeverity,
    editedAssignee,
    editedStatus,
    editedTlp,
    editedReferences,
    editedObservables,
    editedCustomFields,
    editedLabels,
    editedStakeholders,
    activity,
    tasks,
    getItem,
    sharedOrgs,
    loadRevisions,
    crossOrgId,
  ]);

  // Cache stringified complex values to avoid re-serializing on every render
  const tasksJsonRef = useRef("");
  const refsJsonRef = useRef("");
  const obsJsonRef = useRef("");
  const cfJsonRef = useRef("");
  const labelsJsonRef = useRef("");
  const stakeholdersJsonRef = useRef("");
  useEffect(() => {
    tasksJsonRef.current = JSON.stringify(tasks);
  }, [tasks]);
  useEffect(() => {
    refsJsonRef.current = JSON.stringify(editedReferences);
  }, [editedReferences]);
  useEffect(() => {
    obsJsonRef.current = JSON.stringify(editedObservables);
  }, [editedObservables]);
  useEffect(() => {
    labelsJsonRef.current = JSON.stringify(editedLabels);
  }, [editedLabels]);
  useEffect(() => {
    stakeholdersJsonRef.current = JSON.stringify(editedStakeholders);
  }, [editedStakeholders]);
  useEffect(() => {
    const start = performance.now();
    cfJsonRef.current = JSON.stringify(editedCustomFields);
    const elapsed = performance.now() - start;
    if (elapsed > 5) {
      console.warn(
        `[Perf] JSON.stringify(customFields) took ${elapsed.toFixed(1)}ms (${(cfJsonRef.current.length / 1024).toFixed(1)}KB)`,
      );
    }
  }, [editedCustomFields]);

  // Debounced auto-save
  useEffect(() => {
    if (!incident || !initialValuesRef.current || isPublicView) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Compare against the initial normalized values, not raw data
    // Uses cached JSON strings to avoid re-serializing large objects every render
    const init = initialValuesRef.current;
    const changedFields: string[] = [];
    if (editedTitle !== init.title)
      changedFields.push(`title: "${editedTitle}" vs "${init.title}"`);
    if (editedMessage !== init.message)
      changedFields.push(
        `message: "${editedMessage.slice(0, 60)}..." vs "${init.message.slice(0, 60)}..."`,
      );
    if (editedSeverity !== init.severity)
      changedFields.push(`severity: "${editedSeverity}" vs "${init.severity}"`);
    if (editedAssignee !== init.assignee)
      changedFields.push(`assignee: "${editedAssignee}" vs "${init.assignee}"`);
    if (editedStatus !== init.status)
      changedFields.push(`status: "${editedStatus}" vs "${init.status}"`);
    if (editedTlp !== init.tlp)
      changedFields.push(`tlp: "${editedTlp}" vs "${init.tlp}"`);
    if (refsJsonRef.current !== init.references)
      changedFields.push("references");
    if (obsJsonRef.current !== init.observables)
      changedFields.push("observables");
    if (cfJsonRef.current !== init.customFields)
      changedFields.push("customFields");
    if (tasksJsonRef.current !== init.tasks) changedFields.push("tasks");
    if (labelsJsonRef.current !== init.labels) changedFields.push("labels");
    if (stakeholdersJsonRef.current !== init.stakeholders)
      changedFields.push("stakeholders");
    const hasChanges = changedFields.length > 0;

    if (hasChanges) {
      console.log("[AutoSave] Changes detected:", changedFields);
      pendingSaveRef.current = true;
      saveTimeoutRef.current = setTimeout(() => {
        saveToDatastore();
      }, 800);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (obsRefreshTimerRef.current) {
        clearTimeout(obsRefreshTimerRef.current);
      }
    };
  }, [
    incident,
    editedTitle,
    editedMessage,
    editedSeverity,
    editedAssignee,
    editedStatus,
    editedTlp,
    editedReferences,
    editedObservables,
    editedCustomFields,
    editedLabels,
    editedStakeholders,
    tasks,
    saveToDatastore,
  ]);

  // Metrics calculation with MTTD and MTTR
  const metrics = useMemo(() => {
    if (!incident) return null;

    const createdAt = incident.createdTs;
    const now = Date.now();
    const age = now - createdAt;

    // MTTD (Mean Time to Detect): Time from event creation to first status change or activity
    const firstActivity = incident.activity?.find((a) => a.type !== "created");
    const mttdMs = firstActivity ? firstActivity.timestamp - createdAt : age;

    // MTTR (Mean Time to Resolve): Time from creation to resolution
    const resolvedAt =
      incident.status === "resolved" ? incident.editedTs || now : null;
    const mttrMs = resolvedAt ? resolvedAt - createdAt : null;

    // Progress bars: Max thresholds for visualization
    const maxMttd = 4 * 60 * 60 * 1000; // 4 hours target for detection
    const maxMttr = 24 * 60 * 60 * 1000; // 24 hours target for resolution
    const maxAge = 24 * 60 * 60 * 1000;

    const mttdProgress = Math.min((mttdMs / maxMttd) * 100, 100);
    const mttrProgress = mttrMs
      ? Math.min((mttrMs / maxMttr) * 100, 100)
      : Math.min((age / maxMttr) * 100, 100);
    const ageProgress = Math.min((age / maxAge) * 100, 100);

    // Determine color based on performance
    const getMttdColor = (progress: number) =>
      progress < 50 ? "#22c55e" : progress < 80 ? "#f59e0b" : "#ef4444";
    const getMttrColor = (progress: number) =>
      progress < 50 ? "#22c55e" : progress < 80 ? "#f59e0b" : "#ef4444";

    return {
      age: formatDuration(age),
      ageMs: age,
      ageProgress,
      mttd: formatDuration(mttdMs),
      mttdMs,
      mttdProgress,
      mttdColor: getMttdColor(mttdProgress),
      mttr: mttrMs ? formatDuration(mttrMs) : null,
      mttrMs,
      mttrProgress,
      mttrColor: getMttrColor(mttrProgress),
      isResolved: !!resolvedAt,
    };
  }, [incident]);

  // Load known stakeholders from the users datastore for autocomplete.
  // Uses the real list_cache endpoint via getDatastoreByCategory — the
  // earlier /api/v1/datastores/<category> path was fictional.
  useEffect(() => {
    const loadKnownStakeholders = async () => {
      try {
        const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.USERS);
        if (!res.success || !Array.isArray(res.data)) return;
        const all: Stakeholder[] = [];
        for (const item of res.data) {
          try {
            const parsed =
              typeof item.value === "string"
                ? JSON.parse(item.value)
                : item.value;
            // Only show external stakeholders (not internal platform users)
            const customAttrs = parsed?.metadata?.extensions?.custom_attributes;
            const isExternal = customAttrs?.external === true;
            if (!isExternal) continue;
            all.push({
              id: item.key || parsed?.user?.uid || `sh-${Date.now()}`,
              name: parsed?.user?.name || item.key,
              email: customAttrs?.email || "",
              type: customAttrs?.stakeholder_type || "technical",
              role: parsed?.actor?.user?.type || "",
              location: customAttrs?.location || "",
              phone: customAttrs?.phone || "",
            });
          } catch {
            /* skip */
          }
        }
        setKnownStakeholders(all);
      } catch {
        /* silent */
      }
    };
    loadKnownStakeholders();
  }, []);

  // Save a stakeholder to the users datastore (OCSF format)
  const saveStakeholderToRegistry = useCallback(async (s: Stakeholder) => {
    const key = s.email || s.name.toLowerCase().replace(/\s+/g, "_");
    const ocsfUser = {
      class_uid: 3002,
      class_name: "Authentication",
      category_uid: 3,
      is_mfa: false,
      user: {
        name: s.name,
        uid: key,
      },
      org: {
        name: "",
      },
      actor: {
        user: {
          type: s.role || "",
        },
      },
      status: "Success",
      status_id: 1,
      metadata: {
        version: "1.0.0",
        product: {
          name: "Shuffle",
          vendor_name: "Shuffle",
        },
        extensions: {
          custom_attributes: {
            external: true,
            stakeholder_type: s.type,
            email: s.email || "",
            location: s.location || "",
            phone: s.phone || "",
          },
        },
      },
    };
    try {
      await setDatastoreItem(key, ocsfUser, DATASTORE_CATEGORIES.USERS);
    } catch (err) {
      console.warn("[Stakeholder] Failed to save to registry:", err);
    }
  }, []);

  // Filter suggestions based on search input
  const stakeholderSuggestions = useMemo(() => {
    if (!stakeholderSearch.trim()) return [];
    const q = stakeholderSearch.toLowerCase();
    return knownStakeholders.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.role && s.role.toLowerCase().includes(q)),
    );
  }, [stakeholderSearch, knownStakeholders]);

  // Auto-transition status to "in_progress" when any action is taken
  const autoProgressStatus = useCallback(() => {
    if (editedStatus === "new") {
      setEditedStatus("in_progress");
    }
  }, [editedStatus]);

  const handleAddReference = () => {
    if (newReference.trim()) {
      autoProgressStatus();
      setEditedReferences([...editedReferences, newReference.trim()]);
      setNewReference("");
    }
  };

  const handleRemoveReference = (index: number) => {
    autoProgressStatus();
    setEditedReferences(editedReferences.filter((_, i) => i !== index));
  };

  const handleAddObservable = () => {
    if (newObservableValue.trim()) {
      autoProgressStatus();
      const trimmed = newObservableValue.trim();
      const existingIdx = editedObservables.findIndex(
        (o) =>
          !o.archived &&
          o.type === newObservableType &&
          o.value.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existingIdx >= 0) {
        // Merge: update last_seen on existing observable
        const updated = [...editedObservables];
        updated[existingIdx] = {
          ...updated[existingIdx],
          last_seen: Date.now(),
        };
        setEditedObservables(updated);
        toast.info(`Observable already exists — updated last seen`);
      } else {
        const now = Date.now();
        setEditedObservables([
          ...editedObservables,
          {
            type: newObservableType,
            value: trimmed,
            first_seen: now,
            last_seen: now,
          },
        ]);
      }
      setNewObservableValue("");
    }
  };

  const handleRemoveObservable = (index: number) => {
    autoProgressStatus();
    const updated = [...editedObservables];
    updated[index] = { ...updated[index], archived: true };
    setEditedObservables(updated);
  };

  const handleAddComment = async (overrideText?: string) => {
    const effectiveText =
      typeof overrideText === "string" ? overrideText : newComment;
    if (
      (!effectiveText.trim() && commentAttachments.length === 0) ||
      !incident?.rawOCSF
    )
      return;

    autoProgressStatus();

    const commentActivity: ActivityItem = {
      id: `comment-${Date.now()}`,
      type: "comment",
      user: currentUsername,
      timestamp: Date.now(),
      content:
        effectiveText.trim() ||
        (commentAttachments.length > 0
          ? `Attached ${commentAttachments.length} file(s)`
          : ""),
      details: {},
      attachments: commentAttachments.length > 0 ? [...commentAttachments] : [],
      // Default to unprocessed so AI agents pick up new human comments
      // exactly once. Agents flip this to true after acting on the comment.
      ai_handled: false,
      ...(replyingTo
        ? {
            replyToId: replyingTo.id,
            replyToLabel: replyingTo.label,
            replyToPreview: replyingTo.preview,
          }
        : {}),
    };

    const updatedActivity = [...activity, commentActivity];
    // Hold the local entry so a background poll that raced our write cannot
    // remove it before the backend echoes it back.
    trackPendingActivity(commentActivity);
    setActivity(updatedActivity);
    setNewComment("");
    debouncedCommentInputRef.current?.clear();
    if (commentDraftKey) {
      try {
        window.localStorage.removeItem(commentDraftKey);
      } catch {
        /* no-op */
      }
    }
    setCommentAttachments([]);
    setReplyingTo(null);

    // Move focus to the newly created message instead of leaving it on the comment field.
    const newCommentId = commentActivity.id;
    setTimeout(() => {
      const el = document.getElementById(`activity-item-${newCommentId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Make it focusable then focus, so screen readers/keyboard users land on the new message.
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        try {
          (el as HTMLElement).focus({ preventScroll: true });
        } catch {
          /* no-op */
        }
      }
    }, 50);

    // CRITICAL: Never delete fields - always preserve existing structure
    const updatedOCSF = {
      ...incident.rawOCSF!,
      // Store activity at top level (primary location)
      activity: updatedActivity,
      metadata: {
        ...incident.rawOCSF!.metadata,
        extensions: {
          ...incident.rawOCSF!.metadata?.extensions,
          custom_attributes: {
            ...incident.rawOCSF!.metadata?.extensions?.custom_attributes,
            // Preserve all existing custom attributes
          },
        },
      },
    };
    const commentWrite = await writeIncidentSafe(
      incident.id,
      updatedOCSF,
      crossOrgId || undefined,
    );
    if (!commentWrite?.success) {
      // The backend rejected the comment — stop protecting the local entry so
      // the next refresh reflects what actually got stored.
      dropPendingActivity(commentActivity.id);
    }
    // No success toast — the new comment renders immediately in the timeline.
    // Demo Mode signal — lets the tour mark "ask the agent" as complete.
    try {
      window.dispatchEvent(new CustomEvent("demo:incident-comment-sent"));
    } catch {
      /* no-op */
    }

    if (
      isDemoActive() &&
      /@\s*ai[\s_-]*agent\b|@\s*agent\b/i.test(effectiveText)
    ) {
      void handleDemoAgentComment(
        incident.id,
        effectiveText,
        commentActivity.id,
      );
    }

    // Schedule observable/enrichment refresh ~7s after comment save
    // Backend may extract IOCs from comment text and create enrichments
    if (obsRefreshTimerRef.current) clearTimeout(obsRefreshTimerRef.current);
    setRefreshingObservables(true);
    obsCheckStartedAtRef.current = Date.now();
    setObsCheckTick((t) => t + 1);
    obsRefreshBaselineRef.current =
      editedObservables.filter((o) => !o.archived).length + enrichments.length;
    const refreshId = Date.now();
    (obsRefreshTimerRef as any)._activeId = refreshId;
    // Hard wall-clock safety: force the spinner off after 20s even if the
    // datastore fetch hangs. The original safety timer here was a no-op
    // (`setTimeout(() => {}, 15000)`), which let the spinner run forever
    // when the backend was slow.
    const hardTimeout = setTimeout(() => {
      if ((obsRefreshTimerRef as any)._activeId === refreshId) {
        console.warn(
          "[ObsRefresh/Comment] Hard timeout reached — forcing spinner off",
        );
        setRefreshingObservables(false);
      }
    }, 20000);
    (obsRefreshTimerRef as any)._hardTimeout = hardTimeout;
    obsRefreshTimerRef.current = setTimeout(async () => {
      try {
        const refreshResult = isPublicView
          ? await getDatastoreItemPublic(incident.id, publicOrg!, publicAuth!)
          : await getDatastoreItem(
              incident.id,
              DATASTORE_CATEGORIES.INCIDENTS,
              crossOrgId || undefined,
            );
        if (refreshResult.success && refreshResult.item) {
          const refreshData = {
            key: refreshResult.item.key || incident.id,
            value: refreshResult.item.value,
            created: refreshResult.item.created,
            edited: refreshResult.item.edited,
            enrichments: refreshResult.item.enrichments,
          };
          const reParsed = parseIncidentFromDatastore(refreshData);
          if (reParsed) {
            const prevCount =
              editedObservables.filter((o) => !o.archived).length +
              enrichments.length;
            const newEnrichments = reParsed.enrichments || [];
            const newObservables = reParsed.observables || [];
            const newCount =
              newObservables.filter((o: any) => !o.archived).length +
              newEnrichments.length;
            setEnrichments(newEnrichments);
            if (newObservables.length > editedObservables.length) {
              setEditedObservables(newObservables);
            }
            // Silently refresh observables — no toast needed
            console.log(
              `[ObsRefresh/Comment] Refreshed observables: ${prevCount} → ${newCount}`,
            );
          }
        }
      } catch (err) {
        console.warn(
          "[ObsRefresh/Comment] Failed to refresh observables:",
          err,
        );
      } finally {
        clearTimeout(hardTimeout);
        if ((obsRefreshTimerRef as any)._activeId === refreshId) {
          setRefreshingObservables(false);
        }
      }
    }, 7000);
  };

  /**
   * Human name for a tenant id, using every tenant list we already hold.
   */
  const tenantDisplayName = useCallback(
    (orgId: string): string =>
      subOrgs.find((o) => o.id === orgId)?.name ||
      (parentOrg?.id === orgId ? parentOrg.name || orgId : undefined) ||
      (userInfo?.active_org?.id === orgId
        ? userInfo.active_org.name || orgId
        : undefined) ||
      sharedOrgs.find((o) => o.id === orgId)?.name ||
      orgId.slice(0, 8),
    [
      subOrgs,
      parentOrg,
      userInfo?.active_org?.id,
      userInfo?.active_org?.name,
      sharedOrgs,
    ],
  );

  /**
   * Datastore options that address a tenant in its OWN region. A tenant in
   * another region (ca./us./eu2.) is not reachable through the region this
   * session is logged into — the Org-Id header does not cross regions — so
   * every read/write/delete for it must be sent to that region's host.
   * Returns undefined when the tenant lives in the current region.
   */
  const tenantRegionOptions = useCallback(
    (orgId: string): { regionUrl: string } | undefined => {
      if (!orgId || isDevEnvironment()) return undefined;
      const raw =
        subOrgs.find((o) => o.id === orgId)?.region_url ||
        (parentOrg?.id === orgId ? parentOrg.region_url : undefined);
      if (!raw) return undefined;
      const mapped = mapCloudRegionUrl(raw);
      if (!mapped) return undefined;
      const normalized = mapped.replace(/\/+$/, "");
      const current = (API_CONFIG.baseUrl || "").replace(/\/+$/, "");
      if (!normalized || normalized === current) return undefined;
      return { regionUrl: normalized };
    },
    [subOrgs, parentOrg],
  );

  /**
   * Stamp the authoritative tenant set onto the payload we are about to write
   * and log the move in the incident timeline. The stamp is what lets the
   * incident list hide ghost copies the datastore backend auto-recovers in
   * tenants the incident was explicitly moved out of.
   */
  const stampTenantMove = useCallback(
    (value: any, tenants: string[], removed: string[]): any => {
      if (!value || typeof value !== "object") return value;
      const nextTenants = Array.from(new Set(tenants.filter(Boolean)));
      const prevRemoved: string[] = Array.isArray(
        value?.metadata?.extensions?.custom_attributes?._tenants_removed,
      )
        ? value.metadata.extensions.custom_attributes._tenants_removed.filter(
            (t: unknown) => typeof t === "string",
          )
        : [];
      const nextRemoved = Array.from(
        new Set([...prevRemoved, ...removed.filter(Boolean)]),
      ).filter((t) => !nextTenants.includes(t));

      const entries: any[] = [];
      if (removed.length > 0 || nextTenants.length > 0) {
        const from = removed.map(tenantDisplayName).join(", ");
        const to = nextTenants.map(tenantDisplayName).join(", ");
        entries.push({
          id: `tenant-move-${Date.now()}`,
          type: "change",
          user: currentUsername,
          timestamp: Date.now(),
          content:
            removed.length > 0
              ? `Moved this incident from ${from} to ${to}`
              : `Added this incident to ${to}`,
          details: { field: "tenants", from: removed, to: nextTenants },
        });
      }

      return {
        ...value,
        activity: [
          ...(Array.isArray(value.activity) ? value.activity : []),
          ...entries,
        ],
        metadata: {
          ...value.metadata,
          extensions: {
            ...value.metadata?.extensions,
            custom_attributes: {
              ...value.metadata?.extensions?.custom_attributes,
              _tenants: nextTenants,
              _tenants_removed: nextRemoved,
              _tenants_updated_at: Date.now(),
            },
          },
        },
      };
    },
    [tenantDisplayName, currentUsername],
  );

  const moveIncidentToTenant = async (
    targetOrgId: string,
    updatedValue?: any,
  ) => {
    if (!incident?.id) throw new Error("No incident loaded");
    const sourceOrgId = crossOrgId || userInfo?.active_org?.id;
    if (!sourceOrgId) throw new Error("Could not determine source tenant");
    const targetName = tenantDisplayName(targetOrgId);

    const presentOrgIds = new Set<string>([
      sourceOrgId,
      ...sharedOrgs.map((o) => o.id),
    ]);
    let value = updatedValue || incident.rawOCSF || incident;
    if (!value) {
      const fresh = await getDatastoreItem(
        incident.id,
        DATASTORE_CATEGORIES.INCIDENTS,
        sourceOrgId,
        tenantRegionOptions(sourceOrgId),
      );
      if (fresh?.success && fresh.item?.value) {
        value =
          typeof fresh.item.value === "string"
            ? JSON.parse(fresh.item.value)
            : fresh.item.value;
      }
    }

    if (targetOrgId !== sourceOrgId) {
      const removedTenants = Array.from(presentOrgIds).filter(
        (o) => o !== targetOrgId,
      );
      const stamped = stampTenantMove(value, [targetOrgId], removedTenants);
      const targetRegion = tenantRegionOptions(targetOrgId);
      const write = await writeIncidentSafe(
        incident.id,
        stamped as object,
        targetOrgId,
        targetRegion,
      );
      if (!write.success)
        throw new Error(`Could not write incident to ${targetName}`);
      const check = await getDatastoreItem(
        incident.id,
        DATASTORE_CATEGORIES.INCIDENTS,
        targetOrgId,
        targetRegion,
      );
      if (!(check?.success && check.item?.value))
        throw new Error(`Could not verify incident in ${targetName}`);
    }

    const deleteFailures: string[] = [];
    for (const oldOrgId of presentOrgIds) {
      if (oldOrgId === targetOrgId) continue;
      const deleted = await deleteDatastoreItem(
        incident.id,
        DATASTORE_CATEGORIES.INCIDENTS,
        oldOrgId,
        tenantRegionOptions(oldOrgId),
      );
      if (!deleted.success) deleteFailures.push(oldOrgId);
    }
    if (deleteFailures.length > 0) {
      throw new Error(
        `Incident moved, but ${deleteFailures.length} old tenant copy could not be removed`,
      );
    }

    setSharedOrgs([]);
    if (searchParams.get("shared_orgs")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("shared_orgs");
      setSearchParams(nextParams, { replace: true });
    }
    if (targetOrgId !== sourceOrgId) {
      const activeId = userInfo?.active_org?.id;
      const newKey =
        targetOrgId === activeId
          ? incident.id
          : `${targetOrgId}::${incident.id}`;
      navigate(`${entityBasePath}/${newKey}`, { replace: true });
    }
  };

  const applyRoutingActions = async (actions: RoutingAction[]) => {
    if (!incident?.id || !incident.rawOCSF) return;

    const actionable = actions.filter((a) => a && a.type);
    if (actionable.length === 0) return;

    let nextTitle = editedTitle;
    let nextMessage = editedMessage;
    let nextSeverity = editedSeverity;
    let nextStatus = editedStatus;
    let nextAssignee = editedAssignee;
    let nextLabels = [...editedLabels];
    let nextCustomFields = { ...editedCustomFields };
    let nextActivity = [...activity];
    let nextRaw: any = structuredClone(incident.rawOCSF);
    const moveActions: RoutingAction[] = [];
    let changed = false;

    for (const action of actionable) {
      switch (action.type) {
        case "suggest_move":
          if (action.targetOrgId) moveActions.push(action);
          break;
        case "set_severity": {
          const next = normalizeRoutingSeverityValue(action.value);
          if (next && nextSeverity !== next) {
            nextSeverity = next;
            changed = true;
          }
          break;
        }
        case "set_status": {
          const next = normalizeStatus(action.value);
          if (next && nextStatus !== next) {
            nextStatus = next;
            changed = true;
          }
          break;
        }
        case "set_priority": {
          const priority = String(action.value || "").trim();
          if (priority) {
            nextRaw.priority = priority;
            changed = true;
          }
          break;
        }
        case "add_label": {
          const label = String(action.value || "").trim();
          if (label && !nextLabels.includes(label)) {
            nextLabels = [...nextLabels, label];
            changed = true;
          }
          break;
        }
        case "assign_to": {
          const assignee = String(action.value || "").trim();
          if (assignee && nextAssignee !== assignee) {
            nextAssignee = assignee;
            changed = true;
          }
          break;
        }
        case "add_comment": {
          const text = String(action.value || "").trim();
          const alreadyPosted = nextActivity.some(
            (it: any) =>
              it?.type === "comment" &&
              typeof it?.content === "string" &&
              it.content.trim() === text,
          );
          if (text && !alreadyPosted) {
            nextActivity = [
              ...nextActivity,
              {
                id: `routing-comment-${Date.now()}-${nextActivity.length}`,
                type: "comment",
                user: "Incident Routing Rules",
                timestamp: Date.now(),
                content: text,
                details: { source: "incident_routing_rule" },
                attachments: [],
                ai_handled: true,
              } as ActivityItem,
            ];
            changed = true;
          }
          break;
        }
        case "run_agent": {
          const prompt = String(action.value || "").trim();
          if (!prompt) break;
          const content = `@AIAgent ${prompt}${buildAskAgentContext()}`;
          const alreadyAsked = nextActivity.some(
            (it: any) =>
              it?.type === "comment" &&
              typeof it?.content === "string" &&
              it.content.trim().startsWith(`@AIAgent ${prompt}`),
          );
          if (!alreadyAsked) {
            nextActivity = [
              ...nextActivity,
              {
                id: `routing-agent-${Date.now()}-${nextActivity.length}`,
                type: "comment",
                user: "Incident Routing Rules",
                timestamp: Date.now(),
                content,
                details: { source: "incident_routing_rule", run_agent: true },
                attachments: [],
                ai_handled: true,
              } as ActivityItem,
            ];
            changed = true;
          }
          break;
        }
        case "set_field": {
          const field = String(action.field || "").trim();
          if (!field) break;
          const value = parseRoutingActionValue(action.value);
          const canonicalField = field.startsWith("rawOCSF.")
            ? field.slice("rawOCSF.".length)
            : field;
          if (canonicalField === "title") nextTitle = String(value);
          else if (
            canonicalField === "description" ||
            canonicalField === "desc"
          )
            nextMessage = String(value);
          else if (canonicalField === "severity")
            nextSeverity = normalizeRoutingSeverityValue(String(value));
          else if (canonicalField === "status")
            nextStatus = normalizeStatus(String(value));
          else if (canonicalField === "assignee") nextAssignee = String(value);
          else if (canonicalField === "priority")
            nextRaw.priority = String(value);
          else if (canonicalField === "labels" || canonicalField === "types") {
            const label = String(value).trim();
            if (label && !nextLabels.includes(label))
              nextLabels = [...nextLabels, label];
          } else if (field.startsWith("rawOCSF."))
            setDeepValue(nextRaw, field.slice("rawOCSF.".length), value);
          else {
            const key = field
              .replace(/^customFields\./, "")
              .replace(/^custom_fields\./, "");
            nextCustomFields = { ...nextCustomFields, [key]: value };
          }
          changed = true;
          break;
        }
      }
    }

    // Auto-resolving via routing rule: always leave a comment so the audit
    // trail is clear about why the incident was closed automatically.
    const RESOLVING_STATUSES = new Set(["resolved", "closed"]);
    const wasResolving = RESOLVING_STATUSES.has(
      String(editedStatus).toLowerCase(),
    );
    const nowResolving = RESOLVING_STATUSES.has(
      String(nextStatus).toLowerCase(),
    );
    if (!wasResolving && nowResolving) {
      const statusLabel =
        nextStatus === "resolved"
          ? "Resolved"
          : nextStatus === "closed"
            ? "Closed"
            : String(nextStatus);
      const commentText = `Auto-${statusLabel.toLowerCase()} by routing rule`;
      const alreadyPosted = nextActivity.some(
        (it: any) =>
          it?.type === "comment" &&
          typeof it?.content === "string" &&
          it.content.trim() === commentText,
      );
      if (!alreadyPosted) {
        nextActivity = [
          ...nextActivity,
          {
            id: `routing-autoresolve-${Date.now()}-${nextActivity.length}`,
            type: "comment",
            user: "Incident Routing Rules",
            timestamp: Date.now(),
            content: commentText,
            details: { source: "incident_routing_rule", auto_resolve: true },
            attachments: [],
            ai_handled: true,
          } as ActivityItem,
        ];
        changed = true;
      }
    }

    const severityOption = severityOptions.find(
      (s) => s.value === nextSeverity,
    );
    const { label: statusLabel, id: statusId } = getOCSFStatus(nextStatus);
    const existingFindingInfo =
      nextRaw?.finding_info_list?.[0] || nextRaw?.finding_info;
    const customAttrs = nextRaw?.metadata?.extensions?.custom_attributes || {};
    const updatedData = {
      ...nextRaw,
      title: nextTitle,
      desc: nextMessage || nextTitle,
      severity_id: severityOption?.id || nextRaw.severity_id || 3,
      severity: severityOption?.label || nextRaw.severity || "Medium",
      status_id: statusId,
      status: statusLabel,
      assignee: nextAssignee.trim() || "",
      types: nextLabels,
      observables: editedObservables,
      stakeholders: editedStakeholders,
      references: editedReferences,
      tasks,
      activity: nextActivity,
      finding_info_list: [
        {
          ...existingFindingInfo,
          title: nextTitle,
          types: nextLabels,
          references: editedReferences,
          src_url: editedReferences[0] || "",
        },
      ],
      metadata: {
        ...nextRaw.metadata,
        extensions: {
          ...nextRaw.metadata?.extensions,
          custom_attributes: {
            ...customAttrs,
            tlp: editedTlp,
            assignee: nextAssignee.trim() || "",
            customFields: nextCustomFields,
            stakeholders: editedStakeholders,
            observables: editedObservables,
            priority: nextRaw.priority ?? customAttrs.priority,
          },
        },
      },
    };

    if (changed) {
      const ok = (
        await writeIncidentSafe(
          incident.id,
          updatedData,
          crossOrgId || undefined,
        )
      ).success;
      if (!ok) throw new Error("Failed to apply routing rule actions");
      if (sharedOrgs.length > 0) {
        await Promise.allSettled(
          sharedOrgs.map((org) =>
            writeIncidentSafe(incident.id, updatedData, org.id),
          ),
        );
      }
      setEditedTitle(nextTitle);
      setEditedMessage(nextMessage);
      setEditedSeverity(nextSeverity);
      setEditedStatus(nextStatus);
      setEditedAssignee(nextAssignee);
      setEditedLabels(nextLabels);
      setEditedCustomFields(nextCustomFields);
      setActivity(nextActivity);
      setIncident((prev) =>
        prev
          ? {
              ...prev,
              title: nextTitle,
              severity: nextSeverity,
              status: nextStatus,
              assignee: nextAssignee,
              labels: nextLabels,
              customFields: nextCustomFields,
              activity: nextActivity,
              rawOCSF: updatedData,
            }
          : prev,
      );
      setRawJsonText(JSON.stringify(updatedData, null, 2));
      initialValuesRef.current = {
        title: nextTitle,
        message: nextMessage,
        severity: nextSeverity,
        assignee: nextAssignee,
        status: nextStatus,
        tlp: editedTlp,
        references: JSON.stringify(editedReferences),
        observables: JSON.stringify(editedObservables),
        customFields: JSON.stringify(nextCustomFields),
        tasks: JSON.stringify(tasks),
        stakeholders: JSON.stringify(editedStakeholders),
        labels: JSON.stringify(nextLabels),
      };
    }

    for (const action of moveActions) {
      if (action.targetOrgId) {
        await moveIncidentToTenant(action.targetOrgId, updatedData);
      }
    }
    toast.success(
      `Applied ${actionable.length} routing action${actionable.length === 1 ? "" : "s"}`,
    );
  };

  const handleResolve = async (resolutionData: ResolutionData) => {
    if (!incident) return;

    // Immediately update local status so auto-save won't revert it
    setEditedStatus("resolved");
    setIsSaving(true);

    const reasonLabel =
      RESOLUTION_REASONS.find((r) => r.value === resolutionData.reason)
        ?.label || resolutionData.reason;
    // GA: track single-incident resolve
    import("@/lib/analytics").then(({ trackPredefinedEvent, GA_EVENTS }) => {
      trackPredefinedEvent(GA_EVENTS.INCIDENT_RESOLVE, resolutionData.reason);
    });

    const resolveActivity: ActivityItem = {
      id: `status-${Date.now()}`,
      type: "status",
      user: currentUsername,
      timestamp: Date.now(),
      content: `Resolved: ${reasonLabel}${resolutionData.notes ? ` - ${resolutionData.notes}` : ""}`,
      details: {},
      attachments: [],
    };

    const updatedActivity = [...activity, resolveActivity];

    const existingFindingInfo =
      incident.rawOCSF?.finding_info_list?.[0] ||
      (incident.rawOCSF as any)?.finding_info;
    // CRITICAL: Never use undefined - always preserve existing structure
    const resolvedData = incident.rawOCSF
      ? {
          ...incident.rawOCSF,
          status_id: 3,
          status: "Resolved",
          status_detail: `${resolutionData.reason}${resolutionData.notes ? `: ${resolutionData.notes}` : ""}`,
          // Store activity at top level (primary location)
          activity: updatedActivity,
          metadata: {
            ...incident.rawOCSF.metadata,
            extensions: {
              ...incident.rawOCSF.metadata?.extensions,
              custom_attributes: {
                ...incident.rawOCSF.metadata?.extensions?.custom_attributes,
                // Preserve all existing custom attributes
              },
            },
          },
        }
      : {
          id: incident.id,
          title: editedTitle,
          source: incident.source,
          severity: editedSeverity,
          status: "resolved",
          status_detail: `${resolutionData.reason}${resolutionData.notes ? `: ${resolutionData.notes}` : ""}`,
          assignee: editedAssignee.trim() || "",
          activity: updatedActivity,
          tasks: tasks,
          observables: editedObservables,
          customFields: editedCustomFields,
        };

    await writeIncidentSafe(incident.id, resolvedData, crossOrgId || undefined);
    setActivity(updatedActivity);
    setIsSaving(false);
    setShowResolveDialog(false);
    toast.success(t("Incident resolved"));
    // Stay on the incident after resolving — the resolution shows up in the
    // timeline and the Overview rail instead of bouncing back to the list.
  };

  const handleCustomFieldChange = (
    field: CustomField,
    value: string | number | boolean,
  ) => {
    setEditedCustomFields((prev) => ({
      ...prev,
      [field.key]: value,
    }));
  };

  // Task handlers
  const handleAddTask = (customTitle?: string, category?: string) => {
    const titleToAdd = (
      customTitle !== undefined ? customTitle : newTaskTitle
    ).trim();
    if (!titleToAdd) return;
    autoProgressStatus();
    const newTask: IncidentTask = {
      id: `task-${Date.now()}`,
      title: titleToAdd,
      description: "",
      category: category || "",
      completed: false,
      assignee: "",
      dueDate: "",
      dependsOn: "",
      createdAt: Date.now(),
      completedAt: 0,
      createdBy: currentUsername,
      attachments: [],
    };
    setTasks([...tasks, newTask]);
    if (customTitle === undefined) {
      setNewTaskTitle("");
    }
  };

  const TIMELINE_DEDUP_WINDOW_MS = 5 * 60 * 1000;

  const handleToggleTask = (taskId: string) => {
    autoProgressStatus();
    const laneKeys = taskStatuses.map((s) => s.key);
    const defaultOpenLane =
      laneKeys.find((k) => k !== "done") || laneKeys[0] || "todo";
    const now = Date.now();
    setTasks(
      tasks.map((task) => {
        if (String(task.id) !== String(taskId) && task.title !== taskId)
          return task;
        const becomingDone = !task.completed;
        const previousLane = task.completed
          ? "done"
          : task._lane && laneKeys.includes(task._lane)
            ? task._lane
            : defaultOpenLane;
        const nextLane = becomingDone ? "done" : defaultOpenLane;

        const prevHistory = task.statusHistory || [];
        const lastEntry =
          prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;
        let nextHistory: typeof prevHistory;

        if (
          lastEntry &&
          now - (lastEntry.at || 0) <= TIMELINE_DEDUP_WINDOW_MS
        ) {
          if (nextLane === lastEntry.from) {
            // Reverted back to the state before the last transition within the dedup window
            nextHistory = prevHistory.slice(0, -1);
          } else {
            // Transitioned to another lane within the window - merge the transition
            nextHistory = [
              ...prevHistory.slice(0, -1),
              {
                ...lastEntry,
                to: nextLane,
                at: now,
                by: currentUsername || lastEntry.by,
              },
            ];
          }
        } else {
          nextHistory = [
            ...prevHistory,
            {
              from: previousLane,
              to: nextLane,
              at: now,
              by: currentUsername || undefined,
            },
          ];
        }

        return {
          ...task,
          completed: becomingDone,
          completedAt: becomingDone ? task.completedAt || now : 0,
          _lane: nextLane,
          statusHistory: nextHistory,
        };
      }),
    );
  };

  const handleUpdateTaskAssignee = (taskId: string, assignee: string) => {
    setTasks(
      tasks.map((task) => (task.id === taskId ? { ...task, assignee } : task)),
    );
  };

  const handleUpdateTaskDueDate = (taskId: string, dueDate: string) => {
    setTasks(
      tasks.map((task) => (task.id === taskId ? { ...task, dueDate } : task)),
    );
  };

  const handleUpdateTaskDescription = (taskId: string, description: string) => {
    setTasks(
      tasks.map((task) =>
        task.id === taskId ? { ...task, description } : task,
      ),
    );
  };

  const handleUpdateTaskTitle = (taskId: string, title: string) => {
    setTasks(
      tasks.map((task) => (task.id === taskId ? { ...task, title } : task)),
    );
  };

  const handleUpdateTaskCategory = (taskId: string, category: string) => {
    setTasks(
      tasks.map((task) => (task.id === taskId ? { ...task, category } : task)),
    );
  };

  const handleUpdateTaskAttachments = (
    taskId: string,
    attachments: FileAttachment[],
  ) => {
    setTasks(
      tasks.map((task) =>
        task.id === taskId ? { ...task, attachments } : task,
      ),
    );
  };

  const handleDeleteTask = (taskId: string) => {
    // Soft delete: mark as disabled instead of removing (preserved for backend persistence)
    setTasks(
      tasks.map((task) =>
        task.id === taskId ? { ...task, disabled: true } : task,
      ),
    );
  };

  const handleApplyTemplate = async (template: CaseTemplate) => {
    autoProgressStatus();
    const newTasks: IncidentTask[] = template.tasks.map((t, index) => ({
      id: `task-${Date.now()}-${index}`,
      title: t.title,
      description: t.description || "",
      category: t.category || "",
      completed: false,
      completedAt: 0,
      assignee: t.assignee || "",
      dependsOn: t.dependsOn || "",
      dueDate: "",
      createdAt: Date.now(),
      createdBy: currentUsername,
      attachments: [],
    }));
    setTasks([...tasks, ...newTasks]);
    setShowTemplateMenu(false);
    await trackTemplateUsage(template.id);
    toast.success(`Applied "${template.name}" template`);
  };

  // Pre-build dependency lookup map to avoid O(n²) searches
  const taskDependencyMap = useMemo(() => {
    const map = new Map<string, IncidentTask>();
    for (const t of tasks) {
      map.set(t.title, t);
    }
    return map;
  }, [tasks]);

  const isTaskBlocked = useCallback(
    (task: IncidentTask): boolean => {
      if (!task.dependsOn) return false;
      const dependencyTask = taskDependencyMap.get(task.dependsOn);
      return dependencyTask ? !dependencyTask.completed : false;
    },
    [taskDependencyMap],
  );

  // Deduplicate tasks for display only — full list is preserved for API persistence
  const visibleTasks = useMemo(() => deduplicateTasks(tasks), [tasks]);

  const taskProgress = useMemo(() => {
    if (visibleTasks.length === 0) return 0;
    const completedCount = visibleTasks.filter((t) => t.completed).length;
    return Math.round((completedCount / visibleTasks.length) * 100);
  }, [visibleTasks]);

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      bgcolor: "hsl(var(--input))",
      "& fieldset": { borderColor: "hsl(var(--border))" },
      "&:hover fieldset": { borderColor: "hsl(var(--muted-foreground) / 0.4)" },
      "&.Mui-focused fieldset": { borderColor: "hsl(var(--primary))" },
    },
  };

  const transparentInputSx = {
    "& .MuiOutlinedInput-root": {
      bgcolor: "transparent",
      backgroundImage: "none",
      "& fieldset": { borderColor: "hsl(var(--border))" },
      "&:hover fieldset": { borderColor: "hsl(var(--muted-foreground) / 0.4)" },
      "&.Mui-focused fieldset": { borderColor: "hsl(var(--primary))" },
    },
  };

  // Share (RBAC) for the incident itself — same access model as datastore keys
  // on /admin/datastore. The RBAC lives on the datastore item, so read the
  // stored item on open and write it back untouched apart from the rbac block.
  const [simpleShareOpen, setSimpleShareOpen] = useState(false);
  const [simpleShareLoading, setSimpleShareLoading] = useState(false);
  const [simpleShareItem, setSimpleShareItem] = useState<DatastoreItem | null>(
    null,
  );
  const shareTargetOrgId = crossOrgId || userInfo?.active_org?.id || "";

  const openSimpleShare = async () => {
    if (!id) return;
    setSimpleShareLoading(true);
    try {
      const result = await getDatastoreItem(
        id,
        DATASTORE_CATEGORIES.INCIDENTS,
        crossOrgId || undefined,
      );
      const item = result.item || result.data?.[0] || null;
      if (!item) {
        toast.error("Could not load access settings for this incident");
        return;
      }
      setSimpleShareItem(item);
      setSimpleShareOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load access settings",
      );
    } finally {
      setSimpleShareLoading(false);
    }
  };

  const handleSaveSimpleShare = async (rbac: RBACConfig | null) => {
    if (!simpleShareItem || !shareTargetOrgId)
      throw new Error("Incident is not loaded yet");
    const response = await fetch(
      getApiUrl(`/api/v1/orgs/${shareTargetOrgId}/set_cache`),
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getAuthHeader(shareTargetOrgId),
        },
        body: JSON.stringify({
          org_id: shareTargetOrgId,
          key: simpleShareItem.key,
          value: simpleShareItem.value,
          category: simpleShareItem.category || DATASTORE_CATEGORIES.INCIDENTS,
          rbac: rbac || undefined,
        }),
      },
    );
    if (!response.ok) {
      const errData = await response
        .json()
        .catch(() => ({}) as Record<string, string>);
      throw new Error(
        errData.reason || `Failed to update access: ${response.status}`,
      );
    }
    setSimpleShareItem((prev) =>
      prev ? { ...prev, rbac: rbac || undefined } : prev,
    );
    toast.success("Access updated");
  };

  const renderCustomField = (field: CustomField) => {
    const value = editedCustomFields[field.key];

    const FieldLabel = (
      <Box
        sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mb: 0.75 }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "hsl(var(--foreground))",
            fontWeight: 600,
            fontSize: "0.75rem",
            letterSpacing: 0.2,
          }}
        >
          {field.name}
        </Typography>
        {field.required && (
          <Typography
            variant="caption"
            sx={{ color: "hsl(var(--destructive))", fontSize: "0.75rem" }}
          >
            *
          </Typography>
        )}
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontSize: "0.7rem", ml: "auto" }}
        >
          {field.type}
        </Typography>
      </Box>
    );

    const placeholder =
      field.description || `Enter ${field.name.toLowerCase()}`;

    const wrap = (input: React.ReactNode) => (
      <Box key={field.key}>
        {FieldLabel}
        {input}
        {field.description && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.5,
              color: "text.secondary",
              fontSize: "0.7rem",
            }}
          >
            {field.description}
          </Typography>
        )}
      </Box>
    );

    switch (field.type) {
      case "text":
        return wrap(
          <DeferredTextField
            value={
              typeof value === "string"
                ? value
                : value == null
                  ? ""
                  : String(value)
            }
            onCommit={(next) => handleCustomFieldChange(field, next)}
            placeholder={placeholder}
            fullWidth
            size="small"
            sx={inputSx}
          />,
        );
      case "number":
        return wrap(
          <DeferredTextField
            type="number"
            value={value == null ? "" : String(value)}
            onCommit={(next) =>
              handleCustomFieldChange(field, next === "" ? "" : Number(next))
            }
            placeholder={placeholder}
            fullWidth
            size="small"
            sx={inputSx}
          />,
        );
      case "select":
        return wrap(
          <FormControl fullWidth size="small">
            <Select
              value={value || ""}
              displayEmpty
              onChange={(e) => handleCustomFieldChange(field, e.target.value)}
              sx={inputSx["& .MuiOutlinedInput-root"]}
              renderValue={(selected) =>
                selected ? (
                  String(selected)
                ) : (
                  <Typography variant="body2" sx={{ color: "text.disabled" }}>
                    Select {field.name.toLowerCase()}
                  </Typography>
                )
              }
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {field.options?.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </Select>
          </FormControl>,
        );
      case "date":
        return wrap(
          <TextField
            type="date"
            value={value || ""}
            onChange={(e) => handleCustomFieldChange(field, e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={inputSx}
          />,
        );
      case "boolean":
        return (
          <Box key={field.key}>
            {FieldLabel}
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(value)}
                  onChange={(e) =>
                    handleCustomFieldChange(field, e.target.checked)
                  }
                />
              }
              label={
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {value ? "Enabled" : "Disabled"}
                </Typography>
              }
              sx={{ color: "hsl(var(--foreground))", ml: 0 }}
            />
          </Box>
        );
      default:
        return null;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "comment":
        return <PersonIcon size={20} />;
      case "change":
        return <EditIcon size={20} />;
      case "status":
        return <CheckCircleIcon size={20} />;
      case "assignment":
        return <PersonIcon size={20} />;
      case "created":
        return <AddIcon size={20} />;
      case "agent":
        return <AutoFixHighIcon size={20} />;
      default:
        return <HistoryIcon size={20} />;
    }
  };

  // Agent runs are rendered separately using AgentActivityFeed component

  // Demo-aware self-heal: if loading finished without an incident, the URL
  // looks like a demo focus key, and demo mode is active, recreate the focus
  // incident under a fresh key and navigate the user to it. This avoids the
  // dead-end "Incident not found" screen on tour step 4 when the user clicks
  // a row whose datastore entry was rotated out underneath them.
  useEffect(() => {
    if (loading || incident || demoRecoveryTriedRef.current) return;
    if (!demoActive || isPublicView || !id) return;
    const isDemoFocusKey = /^demo-inc-phish-.*-focus$/.test(id);
    if (!isDemoFocusKey) return;
    demoRecoveryTriedRef.current = true;
    setDemoRecovering(true);
    (async () => {
      try {
        const newKey = await forceCreateSingleDemoIncidentReturningKey();
        if (newKey) {
          // Replace the URL so the back button does not bounce the user back
          // to the dead key.
          navigate(`${entityBasePath}/${newKey}`, { replace: true });
        } else {
          setDemoRecovering(false);
        }
      } catch {
        setDemoRecovering(false);
      }
    })();
  }, [
    loading,
    incident,
    demoActive,
    isPublicView,
    id,
    navigate,
    entityBasePath,
  ]);

  // A "full retry" replays exactly what mounting the page from scratch does:
  // reset every "run once per mount" guard, clear the retry counter, and
  // re-invoke the primary loader. This is what the Refresh button should do
  // when we are on the not-found screen — otherwise the button ends up
  // strictly weaker than a hard reload because the guarded effects (suborg
  // retry, cross-org merge, demo recovery) never get a second chance.
  const retryFullLoad = useCallback(() => {
    transientLoadRetryRef.current = 0;
    suborgRetryRef.current = false;
    crossOrgMergedRef.current = false;
    demoRecoveryTriedRef.current = false;
    notFoundRevisionCheckedRef.current = false;
    setLoadDebug(null);
    setLoading(true);
    loadIncidentRef.current?.();
  }, []);

  const isTransientLoadFailure =
    !incident &&
    (loadDebug?.stage === "fetch-error" || loadDebug?.stage === "no-success");
  const retryingTransientLoad =
    isTransientLoadFailure &&
    transientLoadRetryRef.current < MAX_TRANSIENT_LOAD_RETRIES;

  // Render the same skeleton for both the initial load AND the transient
  // auto-retry window. From the user's perspective these are the same state
  // ("we are still trying to fetch this incident"), so we show a layout-true
  // skeleton instead of a spinner + "Loading …" text.
  if (loading || demoRecovering || retryingTransientLoad) {
    return <IncidentDetailSkeleton />;
  }

  if (!incident) {
    const isSupport = userInfo?.support === true;
    return (
      <Box sx={{ p: 4, textAlign: "center", maxWidth: 900, mx: "auto" }}>
        <Typography variant="h6" sx={{ color: "text.secondary", mb: 2 }}>
          {isTransientLoadFailure
            ? `Loading ${entitySingular.toLowerCase()}`
            : `${entitySingular} not found`}
        </Typography>
        {isTransientLoadFailure && (
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            The API is still not responding after several retries. This is
            usually temporary — refresh to try again.
          </Typography>
        )}
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={retryFullLoad}
          sx={{ mr: 1 }}
        >
          Refresh
        </Button>
        <Button
          component={Link}
          to={entityBasePath}
          variant="outlined"
          startIcon={<ArrowBackIcon />}
        >
          Back to {entityPlural}
        </Button>

        {!isTransientLoadFailure && notFoundRevisionLoading && (
          <Box
            sx={{
              mt: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            <CircularProgress size={14} thickness={5} />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Checking the revision history for this key…
            </Typography>
          </Box>
        )}

        {!isTransientLoadFailure &&
          !notFoundRevisionLoading &&
          notFoundRevision && (
            <Box
              sx={{
                mt: 4,
                textAlign: "left",
                p: 2,
                border: "1px solid hsl(var(--border))",
                borderRadius: 1,
                bgcolor: "hsl(var(--card))",
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ mb: 0.5, color: "hsl(var(--foreground))" }}
              >
                A previous version of this {entitySingular.toLowerCase()} exists
                in the revision history
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mb: 1.5 }}
              >
                The stored item is missing, which usually means the last write
                timed out.
                {notFoundRevision.title
                  ? ` Last known title: "${notFoundRevision.title}".`
                  : ""}
                {notFoundRevision.timestamp
                  ? ` Last revision: ${new Date(notFoundRevision.timestamp).toLocaleString()}.`
                  : ""}
                {` ${notFoundRevision.count} revision${notFoundRevision.count === 1 ? "" : "s"} found.`}{" "}
                Nothing has been restored — you decide whether to bring it back.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                disabled={notFoundRestoring}
                onClick={handleRestoreFromNotFoundRevision}
                startIcon={
                  notFoundRestoring ? (
                    <CircularProgress size={14} thickness={5} />
                  ) : (
                    <RefreshIcon />
                  )
                }
              >
                {notFoundRestoring ? "Restoring…" : "Restore this version"}
              </Button>
            </Box>
          )}

        {isSupport && loadDebug && (
          <Box
            sx={{
              mt: 4,
              textAlign: "left",
              p: 2,
              border: "1px solid hsl(var(--border))",
              borderRadius: 1,
              bgcolor: "hsl(var(--muted) / 0.4)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 1,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontWeight: 600,
              }}
            >
              Support debug — load failure ({loadDebug.stage})
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.5,
                color: "hsl(var(--foreground))",
                bgcolor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 1,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(loadDebug, null, 2)}
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  const isResolved = incident.status === "resolved";

  // ===========================================================================
  // Shared Timeline panel — used in two places:
  //  1. Right sidebar (on Tasks / Observables / Correlations tabs)
  //  2. Inline below the Description (Details tab) where it reads as a true
  //     timeline with a vertical rail. Single source of truth so behaviour
  //     stays in sync everywhere.
  // ===========================================================================
  // Filter chip rendered in the IncidentSection `actions` slot. Extracted so
  // both call sites (inline + sidebar) get the exact same control.
  const renderTimelineActionsChip = (simple: boolean = false) => {
    if (timelineCollapsed) return null;
    const filterDefs = [
      {
        key: "revisions" as const,
        label: "Changes",
        count: visibleRevisionCount,
      },
      { key: "agent" as const, label: "Agent", count: agentRuns.length },
      {
        key: "workflows" as const,
        label: "Workflow runs",
        count: workflowOnlyRuns.length,
      },
      {
        key: "manual" as const,
        label: "Comments",
        count: commentActivity.length,
      },
      {
        key: "merges" as const,
        label: "Threading",
        count: mergeActivity.length,
      },
      { key: "tasks" as const, label: "Tasks", count: visibleTasks.length },
      {
        key: "observables" as const,
        label: "Observables",
        count: visibleObservablesCount,
      },
      {
        key: "correlations" as const,
        label: "Correlations",
        count: visibleCorrelations.length,
      },
    ];
    const totalCount = filterDefs.reduce((sum, f) => sum + f.count, 0);
    const shownCount = filterDefs
      .filter((f) => isFilterActive(f.key))
      .reduce((sum, f) => sum + f.count, 0);
    const allActive = activeTimelineFilters.size === filterDefs.length;
    return (
      <Tooltip title="Filter timeline" arrow>
        <Chip
          icon={
            <FilterListIcon size={14} style={{ color: "inherit !important" }} />
          }
          label={
            <Box
              component="span"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              <span>Filters</span>
              <Box
                component="span"
                sx={{
                  fontSize: "0.65rem",
                  opacity: 0.8,
                  fontVariantNumeric: "tabular-nums",
                  px: 0.5,
                  borderRadius: "4px",
                  bgcolor: allActive
                    ? "transparent"
                    : "rgba(255, 102, 0, 0.18)",
                  border: allActive
                    ? "none"
                    : "1px solid rgba(255, 102, 0, 0.35)",
                }}
              >
                {allActive ? `${totalCount}` : `${shownCount}/${totalCount}`}
              </Box>
            </Box>
          }
          size="small"
          onClick={(e) => setTimelineFilterAnchor(e.currentTarget)}
          sx={{
            height: 24,
            fontSize: "0.7rem",
            borderRadius: "6px",
            cursor: "pointer",
            border: simple ? "none" : "1px solid hsl(var(--border))",
            bgcolor: "transparent",
            color: "text.secondary",
            "& .MuiChip-label": { px: 0.875 },
            "&:hover": { bgcolor: "hsl(var(--muted))" },
          }}
        />
      </Tooltip>
    );
  };

  // Loading spinner shown next to the "Timeline" title in the IncidentSection
  // `badge` slot. Used to indicate revisions are still being fetched.
  const renderTimelineBadge = () =>
    revisionsLoading ? (
      <CircularProgress size={14} sx={{ color: "hsl(var(--primary))" }} />
    ) : null;

  const renderTimelineInputArea = (isSimple: boolean) => {
    if (primaryPointer) {
      return (
        <Box
          sx={{
            p: 2,
            borderBottom: isSimple
              ? "none"
              : "1px solid hsl(var(--border-subtle))",
            bgcolor: "hsl(var(--muted) / 0.25)",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", flex: 1 }}
          >
            Comments and AI actions are disabled on merged incidents. Open the
            primary to continue the conversation.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              navigate(`/incidents/${encodeURIComponent(primaryPointer.id)}`)
            }
            sx={{ textTransform: "none", fontSize: "0.7rem", height: 26 }}
          >
            Open primary
          </Button>
        </Box>
      );
    }
    return (
      <Box
        sx={{
          p: isSimple ? 0 : { xs: 1, sm: 2 },
          borderBottom: isSimple
            ? "none"
            : "1px solid hsl(var(--border-subtle))",
        }}
      >
        <Box sx={{ display: "flex", gap: 1 }}>
          {/* The simple view drops the avatar next to the input — the column is
              narrow and the spacing-first layout reads cleaner without it. */}
          {!isSimple && (
            <Avatar
              src={resolveUserAvatar(currentUsername, users).src || undefined}
              alt={currentUsername || "You"}
              sx={{
                width: 28,
                height: 28,
                bgcolor: "hsl(var(--primary) / 0.2)",
              }}
            >
              <PersonIcon size={16} style={{ color: "hsl(var(--primary))" }} />
            </Avatar>
          )}

          <Box
            sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}
            ref={commentInputRef}
          >
            {/* The reply reference is shown in both views so it is always clear
                which entry the comment will attach to. */}
            {replyingTo && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1,
                  bgcolor: "hsl(var(--primary) / 0.08)",
                  border: "1px solid hsl(var(--primary) / 0.25)",
                }}
              >
                <ReplyIcon size={14} style={{ color: "hsl(var(--primary))" }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: "hsl(var(--primary))",
                      lineHeight: 1.2,
                    }}
                  >
                    Replying to {replyingTo.label}
                  </Typography>
                  {replyingTo.preview && (
                    <Typography
                      sx={{
                        fontSize: "0.68rem",
                        color: "text.secondary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.3,
                      }}
                    >
                      {replyingTo.preview}
                    </Typography>
                  )}
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setReplyingTo(null)}
                  sx={{
                    width: 20,
                    height: 20,
                    color: "text.secondary",
                    "&:hover": { color: "#ff6600" },
                  }}
                >
                  <DeleteIcon size={12} />
                </IconButton>
              </Box>
            )}
            {!agentReadiness.isLoading &&
              !agentReadiness.active &&
              /@\s*ai[\s_-]*agent\b/i.test(newComment) && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    mb: 1,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    bgcolor: "rgba(251, 146, 60, 0.08)",
                    border: "1px solid rgba(251, 146, 60, 0.18)",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#fb923c",
                      fontWeight: 500,
                      flex: 1,
                      lineHeight: 1.3,
                    }}
                  >
                    AI Agent automation is not active. The "Assign & Escalate"
                    workflow needs to be enabled for the agent to respond to
                    mentions.
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={agentReadiness.isEnabling}
                    onClick={agentReadiness.enable}
                    sx={{
                      textTransform: "none",
                      fontSize: "0.72rem",
                      height: 26,
                      minWidth: 70,
                      bgcolor: "#fb923c",
                      color: "#fff",
                      boxShadow: "none",
                      "&:hover": { bgcolor: "#f97316", boxShadow: "none" },
                    }}
                  >
                    {agentReadiness.isEnabling ? (
                      <CircularProgress size={14} sx={{ color: "#fff" }} />
                    ) : (
                      "Enable"
                    )}
                  </Button>
                </Box>
              )}
            {isSimple &&
              showEnrichmentInlineCTA &&
              renderEnrichmentInlineCTA(true)}
            <Box
              data-tour="incident-comment-input"
              sx={{ position: "relative" }}
            >
              <DebouncedMentionInput
                ref={debouncedCommentInputRef}
                value={newComment}
                onChangeDebounced={setNewComment}
                onSubmitValue={(text) => {
                  if (text.trim() || commentAttachments.length > 0) {
                    handleAddComment(text);
                  }
                }}
                size="small"
                fullWidth
                multiline
                minRows={2}
                maxRows={15}
                placeholder={
                  replyingTo
                    ? `Reply to ${replyingTo.label}…`
                    : "Add comment... (@ to tag)"
                }
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "hsl(var(--input))",
                    fontSize: "0.8rem",
                    pr: 9,
                    "& fieldset": { borderColor: "rgba(255,255,255,0.08)" },
                    "&:hover fieldset": {
                      borderColor: "rgba(255,255,255,0.15)",
                    },
                    "&.Mui-focused fieldset": { borderColor: "#FF6600" },
                  },
                }}
              />
              <input
                type="file"
                ref={commentFileInputRef}
                onChange={handleCommentAttach}
                style={{ display: "none" }}
                multiple
              />
              <Tooltip title="Attach file">
                <IconButton
                  size="small"
                  onClick={() => commentFileInputRef.current?.click()}
                  disabled={commentUploading}
                  sx={{
                    position: "absolute",
                    right: 36,
                    bottom: 8,
                    color: "text.secondary",
                    "&:hover": {
                      color: "#ff6600",
                      bgcolor: "rgba(255, 102, 0, 0.08)",
                    },
                  }}
                >
                  {commentUploading ? (
                    <CircularProgress
                      size={14}
                      sx={{ color: "text.secondary" }}
                    />
                  ) : (
                    <AttachFileIcon size={16} />
                  )}
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={() => {
                  if (debouncedCommentInputRef.current) {
                    debouncedCommentInputRef.current.submit();
                  } else {
                    handleAddComment();
                  }
                }}
                disabled={!newComment.trim() && commentAttachments.length === 0}
                sx={{
                  position: "absolute",
                  right: 8,
                  bottom: 8,
                  bgcolor:
                    newComment.trim() || commentAttachments.length > 0
                      ? "rgba(255, 102, 0, 0.15)"
                      : "transparent",
                  color:
                    newComment.trim() || commentAttachments.length > 0
                      ? "#ff6600"
                      : "text.disabled",
                  "&:hover": { bgcolor: "rgba(255, 102, 0, 0.25)" },
                }}
              >
                <SendIcon size={16} />
              </IconButton>
            </Box>
            {commentAttachments.length > 0 && (
              <FileAttachments
                attachments={commentAttachments}
                onChange={setCommentAttachments}
                namespace="incidents"
                labels={[incident.id, "comments"]}
                compact
                hideAddButton
              />
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  // Body of the Timeline panel (everything below the header). The header,
  // chevron and collapse behaviour are owned by the surrounding
  // <IncidentSection> at each call site so it stays visually identical to
  // Description / Email Thread / Metadata.
  const renderTimelinePanel = (
    variant: "sidebar" | "inline" | "simple" = "sidebar",
  ) => {
    const isSimple = variant === "simple";
    return (
      <>
        {/* Agent runs loading indicator */}
        {agentRunsLoading && (
          <LinearProgress
            sx={{
              height: 2,
              bgcolor: "transparent",
              "& .MuiLinearProgress-bar": { bgcolor: "hsl(var(--primary))" },
            }}
          />
        )}

        {/* Timeline filters dropdown — single menu replacing the chip row. */}
        <Menu
          anchorEl={timelineFilterAnchor}
          open={Boolean(timelineFilterAnchor)}
          onClose={() => {
            setTimelineFilterAnchor(null);
            handleFilterHover(null);
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{
            onMouseLeave: () => handleFilterHover(null),
            sx: {
              bgcolor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              minWidth: 220,
            },
          }}
        >
          {[
            {
              key: "revisions" as const,
              label: "Changes",
              count: visibleRevisionCount,
              icon: <EditIcon size={14} />,
            },
            {
              key: "agent" as const,
              label: "Agent",
              count: agentRuns.length,
              icon: <AgentIcon size={14} />,
            },
            {
              key: "workflows" as const,
              label: "Workflow runs",
              count: workflowOnlyRuns.length,
              icon: <ZapIcon size={14} />,
            },
            {
              key: "manual" as const,
              label: "Comments",
              count: commentActivity.length,
              icon: <MessageSquare size={14} />,
            },
            {
              key: "merges" as const,
              label: "Threading",
              count: mergeActivity.length,
              icon: <CallMergeIcon size={14} />,
            },
            {
              key: "tasks" as const,
              label: "Tasks",
              count: visibleTasks.length,
              icon: <TaskAltIcon size={14} />,
            },
            {
              key: "observables" as const,
              label: "Observables",
              count: visibleObservablesCount,
              icon: <FingerprintIcon size={14} />,
            },
            {
              key: "correlations" as const,
              label: "Correlations",
              count: visibleCorrelations.length,
              icon: <Network size={14} />,
            },
          ].map(({ key, label, count, icon }) => {
            const active = isFilterActive(key);
            const isHovered = hoveredTimelineFilter === key;
            return (
              <MenuItem
                key={key}
                dense
                onClick={() => toggleTimelineFilter(key)}
                onMouseEnter={() => handleFilterHover(key)}
                onMouseLeave={() =>
                  setHoveredTimelineFilter((prev) =>
                    prev === key ? null : prev,
                  )
                }
                sx={{
                  fontSize: "0.8rem",
                  gap: 1,
                  py: 0.5,
                  bgcolor: isHovered
                    ? "hsl(var(--primary) / 0.12)"
                    : "transparent",
                  "&:hover": {
                    bgcolor: "hsl(var(--primary) / 0.18)",
                  },
                }}
              >
                <Checkbox
                  checked={active}
                  size="small"
                  sx={{
                    p: 0.25,
                    color: "hsl(var(--border))",
                    "&.Mui-checked": { color: "hsl(var(--primary))" },
                  }}
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    color: active
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </Box>
                <Box sx={{ flex: 1 }}>{label}</Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: "0.7rem",
                    color: isHovered ? "hsl(var(--primary))" : "text.secondary",
                    fontVariantNumeric: "tabular-nums",
                    ml: 1,
                  }}
                >
                  {count}
                </Box>
              </MenuItem>
            );
          })}
        </Menu>

        {/* Body content. Collapse is handled by the surrounding IncidentSection. */}
        {/* OCSF drift is auto-repaired silently (see the auto-restore effect) —
          no warning banner is shown to the user. */}

        {/* Inline enrichment CTA — mirrors the Observables-tab banner so users
          can enable automatic extraction without leaving the timeline. Shown
          while the incident is fresh, just after a comment, or while the
          user is typing a new comment. */}
        {isSimple ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <Box
              ref={simpleFeedRef}
              data-simple-timeline-feed="true"
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overscrollBehavior: "contain",
                pb: 1.25,
              }}
            >
              {renderTimelineFeedItems(variant)}
            </Box>
            {renderTimelineInputArea(isSimple)}
          </Box>
        ) : (
          <>
            {showEnrichmentInlineCTA && renderEnrichmentInlineCTA()}
            {renderTimelineInputArea(isSimple)}
            {/* Unified Timeline Feed — when inline, render with a vertical rail behind the items */}
            <Box
              ref={defaultFeedRef}
              sx={{
                p: { xs: 0, sm: 1.5 },
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
                overflow: "auto",
                ...(variant === "inline" && {
                  position: "relative",
                  pl: { xs: 0, sm: 4.5 },
                  py: 2,
                  // Vertical rail — anchored at the bottom (oldest) and growing
                  // upward toward the newest item, matching the timeline direction
                  // (newest-first / top). A subtle fade at the top reinforces that
                  // the latest events are the "growing edge" of the thread.
                  // Hidden on mobile: the rail and dots eat horizontal space.
                  "&::before": {
                    content: '""',
                    display: { xs: "none", sm: "block" },
                    position: "absolute",
                    left: 19,
                    top: 18,
                    bottom: 18,
                    width: "2px",
                    background:
                      "linear-gradient(to top, hsl(var(--border)) 0%, hsl(var(--border)) 70%, hsl(var(--border) / 0.15) 100%)",
                    borderRadius: 1,
                  },
                  // Each direct child gets a dot anchored to the rail. Default
                  // alignment matches taller cards (avatar at top: 12, size 24 →
                  // visual centre ~24px). Compact step pills (Observable/Correlation/
                  // Task markers) opt-in to a higher dot via data-timeline-compact.
                  "& > *": {
                    position: "relative",
                    "&::before": {
                      content: '""',
                      display: { xs: "none", sm: "block" },
                      position: "absolute",
                      left: -22,
                      top: 21,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: "hsl(var(--card))",
                      border: "2px solid #ff6600",
                      zIndex: 1,
                      boxShadow: "0 0 0 3px hsl(var(--background))",
                    },
                    '&[data-timeline-compact="true"]::before': {
                      // Pill content centre is roughly 12px from its top
                      // (py: 0.5 = 4px + 12px icon / 2). Dot half-height = 6.
                      top: 9,
                    },
                    // Quiet rows (e.g. completed executions) should not scream from
                    // the rail. Muted dot by default; parent hover restores accent.
                    '&[data-timeline-quiet="true"]::before': {
                      border: "2px solid hsl(var(--muted-foreground) / 0.35)",
                    },
                    '&[data-timeline-quiet="true"]:hover::before': {
                      border: "2px solid #ff6600",
                    },
                  },
                }),
              }}
            >
              {/* Indicator-check loader is now rendered inline under the comment that
                triggered it — see renderIndicatorCheckPlaceholder() inside renderThread().
                Standardised to match the "AI Agent processing" pill so loaders attach
                to the message they relate to instead of floating at the top. */}
              {renderTimelineFeedItems(variant)}
            </Box>
          </>
        )}
      </>
    );
  };

  // Builder for the unified timeline items (revisions + agent runs + comments).
  // Returns an array of JSX nodes (or a single empty-state node).
  const renderTimelineFeedItems = (
    variant: "sidebar" | "inline" | "simple" = "sidebar",
  ) => {
    const isSimple = variant === "simple";
    type StepKind =
      | "task-created"
      | "task-completed"
      | "task-status-changed"
      | "observable-added"
      | "correlation-found"
      | "incident-created"
      | "routing-matched"
      | "attribute-changed";
    type TimelineItem = (
      | {
          type: "revision";
          timestamp: number;
          data: any;
          idx: number;
          parsedCurrent: any;
          parsedPrevious: any | null;
        }
      | { type: "agent"; timestamp: number; data: (typeof agentRuns)[number] }
      | {
          type: "workflow-exec";
          timestamp: number;
          data: (typeof agentRuns)[number];
        }
      | { type: "manual"; timestamp: number; data: ActivityItem }
      | {
          type: "step";
          timestamp: number;
          kind: StepKind;
          id: string;
          label: string;
          detail?: string;
          actor?: string;
          count?: number;
          corrCount?: number;
          corrObsKeys?: string[];
          obsKeys?: string[];
          obsType?: string;
          obsValue?: string;
          taskId?: string;
          taskStatusLabel?: string;
          attrField?: string;
          attrBefore?: any;
          attrAfter?: any;
          addedTags?: string[];
          removedTags?: string[];
        }
    ) & { isPreview?: boolean };

    const getItemFilterKey = (it: TimelineItem): TimelineFilterKey | null => {
      if (it.type === "revision") return "revisions";
      if (it.type === "agent") return "agent";
      if (it.type === "workflow-exec") return "workflows";
      if (it.type === "manual") {
        return isMergeActivityItem(it.data) ? "merges" : "manual";
      }
      if (it.type === "step") {
        if (it.kind === "routing-matched") return "agent";
        if (it.kind === "attribute-changed") return "revisions";
        if (
          it.kind === "task-created" ||
          it.kind === "task-completed" ||
          it.kind === "task-status-changed"
        )
          return "tasks";
        if (it.kind === "observable-added") return "observables";
        if (it.kind === "correlation-found") return "correlations";
      }
      return null;
    };

    const items: TimelineItem[] = [];

    const parsedRevisions = revisions.map((rev) => {
      try {
        return typeof rev.value === "string"
          ? JSON.parse(rev.value)
          : rev.value;
      } catch {
        return null;
      }
    });

    const NOISE_FIELDS = new Set([
      "activity",
      "updated_by",
      "edited_time",
      "updated_at",
      "last_updated",
      "comments",
    ]);

    const computeDiff = (
      current: any,
      previous: any,
    ): {
      added: string[];
      removed: string[];
      changed: { field: string; from: any; to: any }[];
    } => {
      const diff: {
        added: string[];
        removed: string[];
        changed: { field: string; from: any; to: any }[];
      } = { added: [], removed: [], changed: [] };
      if (!current || !previous) return diff;
      const allKeys = new Set([
        ...Object.keys(current),
        ...Object.keys(previous),
      ]);
      for (const key of allKeys) {
        if (NOISE_FIELDS.has(key)) continue;
        const inCurrent = key in current;
        const inPrevious = key in previous;
        if (inCurrent && !inPrevious) diff.added.push(key);
        else if (!inCurrent && inPrevious) diff.removed.push(key);
        else if (
          inCurrent &&
          inPrevious &&
          JSON.stringify(current[key]) !== JSON.stringify(previous[key])
        ) {
          diff.changed.push({
            field: key,
            from: previous[key],
            to: current[key],
          });
        }
      }
      return diff;
    };

    const truncateValue = (val: any, maxLen = 140): string => {
      const str = typeof val === "string" ? val : JSON.stringify(val);
      return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
    };

    // Revisions: when the Changes filter is on, render all revisions.
    // When it's off, we still always render the OLDEST revision as the
    // "Incident created" full-height card so users get the full creation
    // context (title, source, click-to-open email/description) regardless
    // of filter state.
    const revisionsFilterOn = isFilterActive("revisions");

    // ── Datastore revisions ───────────────────────────────────────────────
    parsedRevisions.forEach((rev, idx) => {
      if (!rev) return;
      const isOldest = idx === parsedRevisions.length - 1;
      if (!revisionsFilterOn && !isOldest) return;
      const ts =
        isOldest && incident?.createdTs
          ? normalizeToMs(incident.createdTs)
          : normalizeToMs(revisions[idx]?.edited ?? revisions[idx]?.created);
      items.push({
        type: "revision",
        timestamp: ts,
        data: revisions[idx],
        idx,
        parsedCurrent: parsedRevisions[idx],
        parsedPrevious:
          idx < revisions.length - 1 ? parsedRevisions[idx + 1] : null,
      });
    });

    // ── Attribute-change steps ────────────────────────────────────────────
    // Severity / status / assignee / tags / title / TLP edits DO produce revisions,
    // but the raw "Changes" diff cards are off by default so those edits were
    // invisible in the timeline. Derive a readable step per changed
    // attribute from consecutive revisions with native platform components.
    if (!revisionsFilterOn && revisions.length > 1) {
      const ATTRIBUTE_LABELS: Record<string, string> = {
        severity: "severity",
        status: "status",
        assignee: "assignee",
        labels: "tags",
        title: "title",
        tlp: "TLP",
        description: "description",
      };
      const attributeText = (value: any, maxLen = 160): string => {
        const str =
          typeof value === "string"
            ? value.trim()
            : value == null
              ? ""
              : String(value);
        if (!str) return "none";
        return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
      };
      // The description is stored as message/desc on the raw record, so it
      // needs its own accessor rather than a plain field lookup.
      const attributeValue = (rev: any, field: string): any => {
        if (!rev) return undefined;
        if (field === "description")
          return rev.message ?? rev.desc ?? rev.description;
        if (field === "tlp")
          return rev.tlp ?? rev.metadata?.extensions?.custom_attributes?.tlp;
        if (field === "assignee")
          return (
            rev.assignee ??
            rev.metadata?.extensions?.custom_attributes?.assignee
          );
        if (field === "labels")
          return (
            rev.types ??
            rev.labels ??
            rev.metadata?.extensions?.custom_attributes?.types
          );
        return rev[field];
      };
      type AttrRawChange = {
        field: string;
        prevRaw: any;
        currRaw: any;
        ts: number;
        actor?: string;
        idx: number;
        fieldIdx: number;
      };
      const changesByField = new Map<string, AttrRawChange[]>();

      // Walk oldest → newest so changes are in chronological order
      for (let idx = revisions.length - 2; idx >= 0; idx--) {
        const current = parsedRevisions[idx];
        const previous = parsedRevisions[idx + 1];
        if (!current || !previous) continue;
        const ts = normalizeToMs(
          revisions[idx]?.edited ?? revisions[idx]?.created,
        );
        if (!(ts > 0)) continue;
        const actor = revisions[idx]?.updated_by
          ? String(revisions[idx].updated_by)
          : undefined;

        Object.keys(ATTRIBUTE_LABELS).forEach((field, fieldIdx) => {
          const prevRaw = attributeValue(previous, field);
          const currRaw = attributeValue(current, field);
          if (prevRaw === undefined && currRaw === undefined) return;

          const list = changesByField.get(field) || [];
          list.push({ field, prevRaw, currRaw, ts, actor, idx, fieldIdx });
          changesByField.set(field, list);
        });
      }

      changesByField.forEach((changes, field) => {
        // Cluster changes within TIMELINE_DEDUP_WINDOW_MS
        const clusters: AttrRawChange[][] = [];
        let currentCluster: AttrRawChange[] = [];

        changes.forEach((ch) => {
          if (currentCluster.length === 0) {
            currentCluster.push(ch);
          } else {
            const prev = currentCluster[currentCluster.length - 1];
            if (ch.ts - prev.ts <= TIMELINE_DEDUP_WINDOW_MS) {
              currentCluster.push(ch);
            } else {
              clusters.push(currentCluster);
              currentCluster = [ch];
            }
          }
        });
        if (currentCluster.length > 0) {
          clusters.push(currentCluster);
        }

        clusters.forEach((cluster) => {
          const initialPrev = cluster[0].prevRaw;
          const finalCurr = cluster[cluster.length - 1].currRaw;
          const lastEntry = cluster[cluster.length - 1];

          // Dedicated handling for tags (labels) array diffing
          if (field === "labels") {
            const normalizeTags = (val: any): string[] => {
              if (Array.isArray(val))
                return val
                  .map(String)
                  .map((s) => s.trim())
                  .filter(Boolean);
              if (typeof val === "string" && val.trim())
                return val
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
              return [];
            };
            const initialTags = normalizeTags(initialPrev);
            const finalTags = normalizeTags(finalCurr);
            const addedTags = finalTags.filter((t) => !initialTags.includes(t));
            const removedTags = initialTags.filter(
              (t) => !finalTags.includes(t),
            );
            if (addedTags.length === 0 && removedTags.length === 0) return;

            let label = "Changed tags";
            if (addedTags.length > 0 && removedTags.length === 0) {
              label = addedTags.length === 1 ? "Added tag" : "Added tags";
            } else if (removedTags.length > 0 && addedTags.length === 0) {
              label = removedTags.length === 1 ? "Removed tag" : "Removed tags";
            }

            items.push({
              type: "step",
              kind: "attribute-changed",
              timestamp: lastEntry.ts + lastEntry.fieldIdx,
              id: `step-attr-${lastEntry.idx}-${field}`,
              label,
              actor: lastEntry.actor,
              attrField: "labels",
              attrBefore: initialTags,
              attrAfter: finalTags,
              addedTags,
              removedTags,
            });
            return;
          }

          const before = attributeText(initialPrev);
          const after = attributeText(finalCurr);
          if (before === after) return;

          let label = `Changed ${ATTRIBUTE_LABELS[field]}`;
          let detail: string | undefined = after;

          if (field === "severity") {
            label = "Changed severity";
          } else if (field === "status") {
            const isResolved = String(finalCurr).toLowerCase() === "resolved";
            label = isResolved ? "Resolved incident" : "Changed status";
          } else if (field === "assignee") {
            const isUnassigned = !finalCurr || finalCurr === "none";
            label = isUnassigned ? "Unassigned incident" : "Changed assignment";
          } else if (field === "tlp") {
            label = "Changed TLP";
          } else if (field === "title") {
            label = "Changed title";
            detail = after;
          } else if (field === "description") {
            label = "Updated description";
            detail = after;
          }

          items.push({
            type: "step",
            kind: "attribute-changed",
            // Stagger so multiple attributes changed in one save keep order.
            timestamp: lastEntry.ts + lastEntry.fieldIdx,
            id: `step-attr-${lastEntry.idx}-${field}`,
            label,
            detail,
            actor: lastEntry.actor,
            attrField: field,
            attrBefore: initialPrev,
            attrAfter: finalCurr,
          });
        });
      });
    }

    // Synthetic "Incident created" step — fallback only when there are NO
    // revisions to render the full creation card from.
    if (revisions.length === 0 && incident?.createdTs) {
      const createdTs = normalizeToMs(incident.createdTs);
      if (createdTs > 0) {
        const sourceLabel = incident.source ? ` from ${incident.source}` : "";
        items.push({
          type: "step",
          kind: "incident-created",
          timestamp: createdTs,
          id: "step-incident-created",
          label: "Incident created",
          detail: `${incident.title || "Untitled incident"}${sourceLabel}`,
        });
      }
    }

    if (isFilterActive("agent")) {
      // Skipped runs (workflow-level decision_string.success === false) are
      // rendered quietly (greyed card + "Skipped" badge) rather than hidden —
      // the Agent filter count includes them, so hiding them made the count
      // disagree with what the timeline actually showed.
      agentRuns.forEach((run) => {
        const ts = normalizeToMs(run.started_at);
        items.push({ type: "agent", timestamp: ts, data: run });
      });
    }
    // Non-agent workflow executions that touched this incident. Independent
    // "Workflow runs" toggle so users can hide automation noise without also
    // hiding agent activity.
    if (isFilterActive("workflows")) {
      workflowOnlyRuns.forEach((run: any) => {
        const ts = normalizeToMs(run.started_at);
        items.push({ type: "workflow-exec", timestamp: ts, data: run });
      });
    }

    // Routing rule matches — synthetic step pills anchored to incident creation
    // so they appear at the bottom of the (newest-first) timeline. Rides along
    // with the Agent filter since routing decisions are automation events.
    if (isFilterActive("agent") && routingMatches.length > 0) {
      const ts = incident?.createdTs
        ? normalizeToMs(incident.createdTs)
        : Date.now();
      routingMatches.forEach((m, i) => {
        const firstAction = m.rule.actions[0];
        const actionLabel = firstAction
          ? `${ACTION_TYPE_LABELS[firstAction.type] || firstAction.type}${firstAction.value ? `: ${firstAction.value}` : ""}`
          : "no action";
        const more =
          m.rule.actions.length > 1
            ? ` (+${m.rule.actions.length - 1} more)`
            : "";
        items.push({
          type: "step",
          kind: "routing-matched",
          // Stagger by 1ms so multiple matches keep a stable order.
          timestamp: ts + i,
          id: `step-routing-${m.rule.id}`,
          label: `Routing rule matched: ${m.rule.name}`,
          detail: `${actionLabel}${more}`,
        });
      });
    }

    // Comments (user-authored activity) and merge/threading audit entries
    // are stored in the same `activity` array but gate on separate filters
    // so users can hide auto-merge noise without also hiding conversation.
    displayActivity.forEach((item) => {
      const isMerge = isMergeActivityItem(item);
      if (isMerge ? !isFilterActive("merges") : !isFilterActive("manual"))
        return;
      items.push({
        type: "manual",
        timestamp: normalizeToMs(item.timestamp),
        data: item,
      });
    });

    // ── Step injection ─────────────────────────────────────────────────────
    // Render Tasks, Observables and Correlations as small "step" markers in
    // the timeline so users can see *when* each artefact appeared. These are
    // injected purely on the frontend — no persistence needed. Each artefact
    // type gates on its own filter so the user can hide e.g. observables
    // without also hiding tasks.
    if (
      isFilterActive("tasks") ||
      isFilterActive("observables") ||
      isFilterActive("correlations")
    ) {
      const fallbackTs = incident?.createdTs
        ? normalizeToMs(incident.createdTs)
        : 0;

      // Tasks written by older clients have no `createdAt`. Rather than
      // pinning them to incident creation (which reads as "2h ago" for a task
      // added seconds ago), map each task to the timestamp of the OLDEST
      // revision that already contained it — that is when it first appeared.
      const taskFirstSeenTs = (() => {
        const map = new Map<string, number>();
        // `revisions` is newest-first; walk oldest → newest so the first hit wins.
        for (let i = revisions.length - 1; i >= 0; i--) {
          const parsed = parsedRevisions[i];
          const revTasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
          if (!revTasks.length) continue;
          const ts = normalizeToMs(
            revisions[i]?.edited ?? revisions[i]?.created,
          );
          if (!(ts > 0)) continue;
          revTasks.forEach((rt: any) => {
            const key = String(rt?.id ?? rt?.title ?? "");
            if (key && !map.has(key)) map.set(key, ts);
          });
        }
        return map;
      })();

      // Tasks — creation, status transitions, and completion each produce
      // a step so the user can see exactly when state changed and by whom.
      const laneLabel = (key: string): string =>
        taskStatuses.find((s) => s.key === key)?.label ||
        (key === "done" ? "Done" : key.replace(/[_-]+/g, " "));

      if (isFilterActive("tasks"))
        visibleTasks.forEach((t) => {
          // Current lane for the task, mirroring TaskKanbanBoard.getLane: an
          // explicit `_lane` wins, completed tasks are Done, everything else
          // falls back to the first open lane.
          const laneKeys = taskStatuses.map((s) => s.key);
          const currentLane = t.completed
            ? "done"
            : (t as any)._lane && laneKeys.includes((t as any)._lane)
              ? (t as any)._lane
              : laneKeys.find((k) => k !== "done") || laneKeys[0];
          const currentStatusLabel = laneLabel(currentLane);
          const revisionTs =
            taskFirstSeenTs.get(String(t.id)) ??
            taskFirstSeenTs.get(String(t.title)) ??
            0;
          const createdTs = t.createdAt
            ? normalizeToMs(t.createdAt)
            : revisionTs || fallbackTs;
          if (createdTs > 0) {
            items.push({
              type: "step",
              kind: "task-created",
              timestamp: createdTs,
              id: `step-task-created-${t.id}`,
              label: "Task created",
              detail: t.title,
              actor: t.createdBy || undefined,
              taskId: String(t.id),
              taskStatusLabel: currentStatusLabel,
            });
          }
          // Group and deduplicate status transitions on the same task.
          // If a task undergoes rapid transitions within TIMELINE_DEDUP_WINDOW_MS
          // (e.g. toggled done -> undone -> done -> undone repeatedly, or dragged
          // between columns quickly), cluster them and only emit the net/final change.
          const rawHistory = (t.statusHistory || [])
            .map((entry, hIdx) => ({
              from: entry.from,
              to: entry.to,
              at: normalizeToMs(entry.at),
              by: entry.by,
              hIdx,
            }))
            .filter((e) => e.at > 0 && e.from && e.to);

          // Sort ascending by timestamp
          rawHistory.sort((a, b) => a.at - b.at);

          const clusters: Array<typeof rawHistory> = [];
          let curCluster: typeof rawHistory = [];

          rawHistory.forEach((entry) => {
            if (curCluster.length === 0) {
              curCluster.push(entry);
            } else {
              const prev = curCluster[curCluster.length - 1];
              if (entry.at - prev.at <= TIMELINE_DEDUP_WINDOW_MS) {
                curCluster.push(entry);
              } else {
                clusters.push(curCluster);
                curCluster = [entry];
              }
            }
          });
          if (curCluster.length > 0) {
            clusters.push(curCluster);
          }

          let emittedCompletion = false;

          clusters.forEach((cluster) => {
            const startLane = cluster[0].from;
            const endLane = cluster[cluster.length - 1].to;
            const lastEntry = cluster[cluster.length - 1];

            // If the net lane is unchanged across the burst (e.g. done -> undone -> done -> undone),
            // nothing actually changed overall, so emit 0 steps.
            if (startLane === endLane) return;

            if (endLane === "done") {
              emittedCompletion = true;
              items.push({
                type: "step",
                kind: "task-completed",
                timestamp: lastEntry.at,
                id: `step-task-completed-${t.id}-${lastEntry.hIdx}`,
                label: "Task completed",
                detail: t.title,
                actor: lastEntry.by || t.assignee || undefined,
                taskId: String(t.id),
                taskStatusLabel: currentStatusLabel,
              });
            } else if (startLane === "done") {
              items.push({
                type: "step",
                kind: "task-status-changed",
                timestamp: lastEntry.at,
                id: `step-task-status-${t.id}-${lastEntry.hIdx}`,
                label: "Task reopened",
                detail: `${t.title} · Done → ${laneLabel(endLane)}`,
                actor: lastEntry.by || undefined,
                taskId: String(t.id),
                taskStatusLabel: currentStatusLabel,
              });
            } else {
              items.push({
                type: "step",
                kind: "task-status-changed",
                timestamp: lastEntry.at,
                id: `step-task-status-${t.id}-${lastEntry.hIdx}`,
                label: "Task moved",
                detail: `${t.title} · ${laneLabel(startLane)} → ${laneLabel(endLane)}`,
                actor: lastEntry.by || undefined,
                taskId: String(t.id),
                taskStatusLabel: currentStatusLabel,
              });
            }
          });

          // Fallback: If task is marked completed but no completed step was emitted
          // from history (e.g. legacy tasks with no statusHistory or imported completed tasks).
          if (t.completed && !emittedCompletion) {
            const completedTs =
              normalizeToMs(t.completedAt) ||
              normalizeToMs(incident?.editedTs) ||
              createdTs;
            if (completedTs > 0) {
              items.push({
                type: "step",
                kind: "task-completed",
                timestamp: completedTs,
                id: `step-task-completed-${t.id}`,
                label: "Task completed",
                detail: t.title,
                actor: t.assignee || undefined,
                taskId: String(t.id),
                taskStatusLabel: currentStatusLabel,
              });
            }
          }
        });

      if (isFilterActive("observables")) {
        // Observables — manual entries + automated enrichments. Dedupe by
        // type+value so the same indicator does not appear twice. Bulk
        // observables added within a ~3s window into a single summary pill so
        // a burst of enrichments does not flood the timeline. Known-IOC
        // observables are *always* kept as their own standalone pill so the
        // bad indicator visibly stands out.
        const seenObs = new Set<string>();
        const allObservables: Array<{
          type: string;
          value: string;
          first_seen?: string | number;
          source: "manual" | "enrichment";
        }> = [
          ...editedObservables
            .filter((o) => !o.archived)
            .map((o) => ({
              type: o.type,
              value: o.value,
              first_seen: o.first_seen,
              source: "manual" as const,
            })),
          ...enrichments.map((e) => ({
            type: e.type || "unknown",
            value: e.value || e.data || "",
            first_seen: e.first_seen,
            source: "enrichment" as const,
          })),
        ];
        type ObsEntry = {
          key: string;
          type: string;
          value: string;
          ts: number;
          isIoc: boolean;
        };
        const obsEntries: ObsEntry[] = [];
        allObservables.forEach((o) => {
          if (!o.value) return;
          // Hide ignored observables from the timeline as well — same source of
          // truth as the Observables tab badge so the counts agree.
          if (isObservableIgnored(o.type, o.value)) return;
          const k = `${o.type}::${o.value}`.toLowerCase();
          if (seenObs.has(k)) return;
          seenObs.add(k);
          const ts = o.first_seen ? normalizeToMs(o.first_seen) : fallbackTs;
          if (ts > 0) {
            obsEntries.push({
              key: k,
              type: o.type,
              value: o.value,
              ts,
              isIoc: iocObservableKeys.has(k),
            });
          }
        });
        // Sort oldest-first for deterministic bucketing.
        obsEntries.sort((a, b) => a.ts - b.ts);
        const OBS_BUCKET_MS = 3000;
        const obsBuckets: Array<{ ts: number; entries: ObsEntry[] }> = [];
        obsEntries.forEach((e) => {
          // Known-IOC observables never bulk — they always emit a standalone
          // pill so the bad indicator visibly stands out on the timeline.
          if (e.isIoc) {
            obsBuckets.push({ ts: e.ts, entries: [e] });
            return;
          }
          const last = obsBuckets[obsBuckets.length - 1];
          // Only merge into a bucket whose entries are all non-IOC.
          if (
            last &&
            !last.entries[0].isIoc &&
            Math.abs(e.ts - last.ts) <= OBS_BUCKET_MS
          ) {
            last.entries.push(e);
            last.ts = Math.max(last.ts, e.ts);
          } else {
            obsBuckets.push({ ts: e.ts, entries: [e] });
          }
        });
        obsBuckets.forEach((b, i) => {
          if (b.entries.length === 1) {
            const e = b.entries[0];
            const corr = obsCorrelations[e.key];
            const corrCount = corr?.data?.length || 0;
            items.push({
              type: "step",
              kind: "observable-added",
              timestamp: e.ts,
              id: `step-obs-${e.key}`,
              label: "Observable",
              obsType: e.type,
              obsValue: e.value,
              corrCount: corrCount > 0 ? corrCount : undefined,
              corrObsKeys: corrCount > 0 ? [e.key] : undefined,
            });
          } else {
            // Bulked → one pill summarising the burst. Detail lists the first
            // few values so the user still has a hint of what was added.
            const sample = b.entries
              .slice(0, 3)
              .map((e) => e.value)
              .join(", ");
            const more =
              b.entries.length > 3 ? ` +${b.entries.length - 3} more` : "";
            // Aggregate correlation matches across every observable in the bucket
            // so the user can see "N matches" inline without a separate pill.
            let corrCount = 0;
            const corrObsKeys: string[] = [];
            b.entries.forEach((e) => {
              const c = obsCorrelations[e.key]?.data?.length || 0;
              if (c > 0) {
                corrCount += c;
                corrObsKeys.push(e.key);
              }
            });
            items.push({
              type: "step",
              kind: "observable-added",
              timestamp: b.ts,
              id: `step-obs-bulk-${i}-${b.ts}`,
              label: `${b.entries.length} observables`,
              detail: `${sample}${more}`,
              corrCount: corrCount > 0 ? corrCount : undefined,
              corrObsKeys: corrObsKeys.length > 0 ? corrObsKeys : undefined,
              // Carry every observable key in the bulk so clicking the pill can
              // scroll the Observables tab to the first row from this burst,
              // not just swap tabs.
              obsKeys: b.entries.map((e) => e.key),
            });
          }
        });
      } // end isFilterActive('observables')

      // Incident-level correlations stay as their own pill (these are
      // shared-attribute matches across other incidents, not per-observable).
      // Per-observable correlations have moved inline onto the observable pill
      // itself so the user can see the match next to the indicator that
      // triggered it instead of as a separate timeline row.
      if (
        isFilterActive("correlations") &&
        correlationsDiscoveredAt &&
        visibleCorrelations.length > 0
      ) {
        items.push({
          type: "step",
          kind: "correlation-found",
          timestamp: correlationsDiscoveredAt,
          id: `step-corr-incident`,
          label: `${visibleCorrelations.length} Correlation${visibleCorrelations.length === 1 ? "" : "s"}`,
          detail: `shared attribute${visibleCorrelations.length === 1 ? "" : "s"} across other incidents`,
          count: visibleCorrelations.length,
        });
      }
    }

    // ── On-the-fly injection for hovered inactive filters ──────────────────
    if (
      hoveredTimelineFilter &&
      !activeTimelineFilters.has(hoveredTimelineFilter)
    ) {
      const candidates: TimelineItem[] = [];

      if (hoveredTimelineFilter === "revisions") {
        const existingRevisionIdxs = new Set(
          items
            .filter((it) => it.type === "revision")
            .map((it) => (it as any).idx),
        );
        for (let idx = 0; idx < revisions.length; idx++) {
          if (existingRevisionIdxs.has(idx)) continue;
          const rev = revisions[idx];
          const isOldest = idx === revisions.length - 1;
          const diff =
            idx < revisions.length - 1 &&
            parsedRevisions[idx] &&
            parsedRevisions[idx + 1]
              ? computeDiff(parsedRevisions[idx], parsedRevisions[idx + 1])
              : null;
          const totalChanges = diff
            ? diff.added.length + diff.removed.length + diff.changed.length
            : 0;
          if (!isOldest && diff && totalChanges === 0) continue;
          const ts = normalizeToMs(rev.edited ?? rev.created);
          if (ts > 0) {
            candidates.push({
              type: "revision",
              timestamp: ts,
              data: rev,
              idx,
              parsedCurrent: parsedRevisions[idx],
              parsedPrevious:
                idx < revisions.length - 1 ? parsedRevisions[idx + 1] : null,
              isPreview: true,
            });
          }
        }
      } else if (hoveredTimelineFilter === "agent") {
        agentRuns.forEach((run) => {
          const ts = normalizeToMs(run.started_at);
          if (ts > 0) {
            candidates.push({
              type: "agent",
              timestamp: ts,
              data: run,
              isPreview: true,
            });
          }
        });
      } else if (hoveredTimelineFilter === "workflows") {
        workflowOnlyRuns.forEach((run: any) => {
          const ts = normalizeToMs(run.started_at);
          if (ts > 0) {
            candidates.push({
              type: "workflow-exec",
              timestamp: ts,
              data: run,
              isPreview: true,
            });
          }
        });
      } else if (hoveredTimelineFilter === "manual") {
        commentActivity.forEach((act) => {
          const ts = normalizeToMs(act.timestamp);
          if (ts > 0) {
            candidates.push({
              type: "manual",
              timestamp: ts,
              data: act,
              isPreview: true,
            });
          }
        });
      } else if (hoveredTimelineFilter === "merges") {
        mergeActivity.forEach((act) => {
          const ts = normalizeToMs(act.timestamp);
          if (ts > 0) {
            candidates.push({
              type: "manual",
              timestamp: ts,
              data: act,
              isPreview: true,
            });
          }
        });
      } else if (hoveredTimelineFilter === "tasks") {
        const laneLabel = (key: string): string =>
          taskStatuses.find((s) => s.key === key)?.label ||
          (key === "done" ? "Done" : key.replace(/[_-]+/g, " "));
        visibleTasks.forEach((t) => {
          const currentStatusLabel = laneLabel(
            t.completed ? "done" : (t as any)._lane || "todo",
          );
          const ts = t.createdAt
            ? normalizeToMs(t.createdAt)
            : normalizeToMs(incident?.createdTs);
          if (ts > 0) {
            candidates.push({
              type: "step",
              kind: "task-created",
              timestamp: ts,
              id: `preview-task-created-${t.id}`,
              label: "Task created",
              detail: t.title,
              actor: t.createdBy || undefined,
              taskId: String(t.id),
              taskStatusLabel: currentStatusLabel,
              isPreview: true,
            });
          }
        });
      } else if (hoveredTimelineFilter === "observables") {
        editedObservables.slice(0, 5).forEach((o) => {
          const ts = o.first_seen
            ? normalizeToMs(o.first_seen)
            : normalizeToMs(incident?.createdTs);
          if (ts > 0 && o.value) {
            candidates.push({
              type: "step",
              kind: "observable-added",
              timestamp: ts,
              id: `preview-obs-${o.type}-${o.value}`,
              label: "Observable",
              obsType: o.type,
              obsValue: o.value,
              isPreview: true,
            });
          }
        });
      } else if (hoveredTimelineFilter === "correlations") {
        if (correlationsDiscoveredAt && visibleCorrelations.length > 0) {
          candidates.push({
            type: "step",
            kind: "correlation-found",
            timestamp: correlationsDiscoveredAt,
            id: `preview-corr-incident`,
            label: `${visibleCorrelations.length} Correlation${visibleCorrelations.length === 1 ? "" : "s"}`,
            detail: `shared attribute${visibleCorrelations.length === 1 ? "" : "s"} across other incidents`,
            count: visibleCorrelations.length,
            isPreview: true,
          });
        }
      }

      if (candidates.length > 0) {
        let selected: TimelineItem[] = [];
        if (timelineVisibleWindow) {
          const { minTs, maxTs } = timelineVisibleWindow;
          const centerTs = (minTs + maxTs) / 2;
          const bufferMs = 5 * 60 * 1000;
          const inWindow = candidates.filter(
            (c) =>
              c.timestamp >= minTs - bufferMs &&
              c.timestamp <= maxTs + bufferMs,
          );
          if (inWindow.length > 0) {
            inWindow.sort(
              (a, b) =>
                Math.abs(a.timestamp - centerTs) -
                Math.abs(b.timestamp - centerTs),
            );
            selected = inWindow.slice(0, 3);
          } else {
            candidates.sort(
              (a, b) =>
                Math.abs(a.timestamp - centerTs) -
                Math.abs(b.timestamp - centerTs),
            );
            selected = candidates.slice(0, 2);
          }
        } else {
          if (items.length > 0) {
            const itemTimestamps = items
              .map((it) => it.timestamp)
              .filter(Boolean);
            const avgTs =
              itemTimestamps.reduce((a, b) => a + b, 0) / itemTimestamps.length;
            candidates.sort(
              (a, b) =>
                Math.abs(a.timestamp - avgTs) - Math.abs(b.timestamp - avgTs),
            );
            selected = candidates.slice(0, 2);
          } else {
            selected = candidates.slice(0, 2);
          }
        }

        if (hoveredTimelineFilter === "revisions") {
          // If previewing revisions, replace any compact attribute-change step for those revision idxs
          const previewIdxs = new Set(
            selected
              .filter((s) => s.type === "revision")
              .map((s) => (s as any).idx),
          );
          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            if (it.type === "step" && it.id.startsWith("step-attr-")) {
              const match = it.id.match(/^step-attr-(\d+)-/);
              if (match && previewIdxs.has(Number(match[1]))) {
                items.splice(i, 1);
              }
            }
          }
        }

        selected.forEach((p) => items.push(p));
      }
    }

    // ── Deduplicate rapid changes on the same entity ────────────────────────
    // If the same task or incident attribute was changed multiple times within
    // TIMELINE_DEDUP_WINDOW_MS, only the latest relevant change in that window
    // should persist, discarding any intermediate noise.
    {
      const sortedByTs = [...items].sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = new Set<string>();

      type StepTimelineItem = Extract<TimelineItem, { type: "step" }>;
      const groups = new Map<string, StepTimelineItem[]>();
      sortedByTs.forEach((it) => {
        if (it.type !== "step") return;
        let key: string | null = null;
        if (
          it.taskId &&
          (it.kind === "task-status-changed" || it.kind === "task-completed")
        ) {
          key = `task:${it.taskId}`;
        } else if (it.kind === "attribute-changed") {
          const match = it.id.match(/^step-attr-\d+-(.+)$/);
          if (match) key = `attr:${match[1]}`;
        }
        if (!key) return;
        const list = groups.get(key) || [];
        list.push(it);
        groups.set(key, list);
      });

      groups.forEach((group) => {
        if (group.length <= 1) return;
        let curCluster: typeof group = [];
        group.forEach((item) => {
          if (curCluster.length === 0) {
            curCluster.push(item);
          } else {
            const prev = curCluster[curCluster.length - 1];
            if (item.timestamp - prev.timestamp <= TIMELINE_DEDUP_WINDOW_MS) {
              curCluster.push(item);
            } else {
              if (curCluster.length > 1) {
                for (let i = 0; i < curCluster.length - 1; i++) {
                  toRemove.add(curCluster[i].id);
                }
              }
              curCluster = [item];
            }
          }
        });
        if (curCluster.length > 1) {
          for (let i = 0; i < curCluster.length - 1; i++) {
            toRemove.add(curCluster[i].id);
          }
        }
      });

      if (toRemove.size > 0) {
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (it.type === "step" && toRemove.has(it.id)) {
            items.splice(i, 1);
          }
        }
      }
    }

    // Newest first. The "Incident created" marker is ALWAYS forced to the
    // bottom of the feed regardless of timestamp — creation is conceptually
    // the first event, even if upstream clock skew or trigger-vs-write gaps
    // make an agent run's `started_at` appear slightly earlier.
    const oldestRevisionIdx = revisions.length - 1;
    const isCreationItem = (it: TimelineItem) =>
      (it.type === "revision" && it.idx === oldestRevisionIdx) ||
      (it.type === "step" && it.id === "step-incident-created");
    items.sort((a, b) => {
      const aCreate = isCreationItem(a);
      const bCreate = isCreationItem(b);
      if (aCreate && !bCreate) return 1; // creation always goes last
      if (bCreate && !aCreate) return -1;
      // Backend execution timestamps are second-granular, so an automation
      // triggered BY a comment can normalize to a value slightly older than
      // the comment itself and sink below it. Within a 3s window, treat
      // automation rows as happening AFTER the manual message that caused
      // them so the causal order reads correctly (newest first).
      const isAutomation = (t: string) =>
        t === "workflow-exec" || t === "agent";
      if (Math.abs(a.timestamp - b.timestamp) <= 3000) {
        if (a.type === "manual" && isAutomation(b.type)) return 1;
        if (b.type === "manual" && isAutomation(a.type)) return -1;
      }
      return b.timestamp - a.timestamp; // otherwise newest first
    });

    // Simple-mode timeline reads bottom-to-top (oldest first, input at bottom).
    if (variant === "simple") {
      items.reverse();
    }

    if (items.length === 0) {
      const allHidden = activeTimelineFilters.size === 0;
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 4,
            gap: 1,
            color: "text.secondary",
          }}
        >
          <HistoryIcon size={32} style={{ opacity: 0.5 }} />
          <Typography variant="body2" sx={{ fontStyle: "italic" }}>
            {allHidden
              ? "All timeline filters are turned off"
              : "No activity yet"}
          </Typography>
          {allHidden && (
            <Chip
              label="Show all"
              size="small"
              variant="outlined"
              onClick={() =>
                setActiveTimelineFilters(new Set(ALL_TIMELINE_FILTERS))
              }
              sx={{
                height: 22,
                fontSize: "0.7rem",
                borderColor: "rgba(255, 102, 0, 0.5)",
                color: "#ff6600",
              }}
            />
          )}
        </Box>
      );
    }

    // Revisions with an empty diff (no-op writes) are not rendered. Numbering
    // them by raw index therefore produced visible gaps ("Change #5" followed
    // by "Change #4" then "#2"). Number them by their VISIBLE sequence
    // instead, oldest = 1, so the list always reads consecutively.
    const revisionDisplayNumbers = new Map<number, number>();
    {
      let visibleCount = 0;
      for (let i = revisions.length - 1; i >= 0; i--) {
        const prev = i < revisions.length - 1 ? parsedRevisions[i + 1] : null;
        const d = prev ? computeDiff(parsedRevisions[i], prev) : null;
        const total = d
          ? d.added.length + d.removed.length + d.changed.length
          : 0;
        const hidden =
          !isOnlyRevisionsFilter &&
          i !== revisions.length - 1 &&
          !!d &&
          total === 0;
        if (hidden) continue;
        visibleCount += 1;
        revisionDisplayNumbers.set(i, visibleCount);
      }
    }
    const revisionNumber = (idx: number) =>
      revisionDisplayNumbers.get(idx) ?? revisions.length - idx;

    // ─── Reply threading helpers ────────────────────────────────────────────
    // Each timeline item gets a stable canonical id; manual comments may carry
    // a `replyToId` pointing at one of those ids. We then group replies under
    // their parent and render them indented so users can pivot between
    // separate threads (one per parent) without losing the chronology.
    const getItemKey = (it: TimelineItem): string => {
      if (it.type === "revision") {
        const rev = it.data;
        const explicitId = rev?.revision_id || rev?.revisionId || rev?.id;
        const ts = normalizeToMs(rev?.edited ?? rev?.created) || 0;
        const valueHash = cheapHash(stableRevisionValueString(rev?.value));
        return `rev-${explicitId || `${ts}-${valueHash}`}-${it.idx}`;
      }
      if (it.type === "agent")
        return `agent-${it.data.execution_id || (it.data as any).id || it.timestamp}`;
      if (it.type === "workflow-exec")
        return `wfexec-${it.data.execution_id || (it.data as any).id || it.timestamp}`;
      if (it.type === "step") return it.id;
      return it.data.id;
    };
    const getItemLabel = (it: TimelineItem): string => {
      if (it.type === "revision") {
        if (it.idx === revisions.length - 1 && !isOnlyRevisionsFilter)
          return "Incident created";
        return `Change #${revisionNumber(it.idx)}`;
      }
      if (it.type === "agent") {
        const wfName = (it.data as any)?.workflow?.name;
        return wfName || "AI Agent";
      }
      if (it.type === "workflow-exec") {
        const wfName =
          (it.data as any)?.workflow?.name || (it.data as any)?.workflow_name;
        return wfName || "Workflow run";
      }
      if (it.type === "step") return it.label;
      return `${it.data.user || "Comment"}`;
    };
    const getItemPreview = (it: TimelineItem): string => {
      if (it.type === "revision") {
        const t =
          it.parsedCurrent?.title ||
          it.parsedCurrent?.finding_info?.title ||
          "";
        return String(t).slice(0, 80);
      }
      if (it.type === "agent") {
        const r: any = it.data;
        const title = getRunTitle(r);
        return String(
          title || r.run_input || r.summary || r.status || "",
        ).slice(0, 80);
      }
      if (it.type === "workflow-exec") {
        const r: any = it.data;
        const name = r.workflow?.name || r.workflow_name || "";
        const shortId = r.execution_id
          ? String(r.execution_id).slice(0, 8)
          : "";
        return String(
          name
            ? `${name}${shortId ? ` · ${shortId}` : ""}`
            : shortId || r.status || "",
        ).slice(0, 80);
      }
      if (it.type === "step") return (it.detail || "").slice(0, 80);
      const text =
        it.data.content && /<[a-z][\s\S]*>/i.test(it.data.content)
          ? htmlToPlainText(it.data.content).trim()
          : it.data.content || "";
      return text.slice(0, 80);
    };

    // Build canonical-id set first so reply targets can be resolved to the
    // root of their conversation.
    const allKeys = new Set(items.map(getItemKey));
    const parentByKey = new Map<string, string>();
    for (const it of items) {
      if (it.type !== "manual") continue;
      const parentId = (it.data as any)?.replyToId;
      if (parentId) parentByKey.set(getItemKey(it), String(parentId));
    }
    // Simple mode allows a single level of replies only: replying to a reply
    // attaches to the conversation's root item instead of nesting deeper.
    const resolveRootKey = (key: string): string => {
      let cur = key;
      for (let i = 0; i < 20; i++) {
        const parent = parentByKey.get(cur);
        if (!parent || !allKeys.has(parent)) break;
        cur = parent;
      }
      return cur;
    };
    const replyTargetKey = (it: TimelineItem): string => {
      const key = getItemKey(it);
      return variant === "simple" ? resolveRootKey(key) : key;
    };

    const startReplyTo = (it: TimelineItem) => {
      const targetKey = replyTargetKey(it);
      const target =
        items.find((candidate) => getItemKey(candidate) === targetKey) || it;
      setReplyingTo({
        id: targetKey,
        label: getItemLabel(target),
        preview: getItemPreview(target),
      });
      // Focus the comment box so the user can immediately type. The reply
      // banner re-renders the input, so retry for a few frames until the
      // textarea actually exists and takes focus.
      let attempts = 0;
      const tryFocus = () => {
        attempts += 1;
        const container = commentInputRef.current;
        const ta = (container?.querySelector("textarea:not([readonly])") ||
          container?.querySelector("textarea")) as HTMLTextAreaElement | null;
        if (ta) {
          ta.focus({ preventScroll: true });
          const len = ta.value.length;
          try {
            ta.setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
          if (document.activeElement === ta) {
            container?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
          }
        }
        if (attempts < 20) setTimeout(tryFocus, 50);
      };
      setTimeout(tryFocus, 0);
    };

    // Group replies under their parent. Only manual items can *be* replies;
    // any timeline item can be a parent. In simple mode every reply is pulled
    // up to the root of its conversation so threads stay one level deep.
    const repliesByParent = new Map<string, TimelineItem[]>();
    for (const it of items) {
      if (it.type !== "manual") continue;
      const rawParent = it.data.replyToId;
      if (!rawParent || !allKeys.has(rawParent)) continue;
      const parentId =
        variant === "simple"
          ? resolveRootKey(String(rawParent))
          : String(rawParent);
      if (parentId === getItemKey(it)) continue;
      const arr = repliesByParent.get(parentId) || [];
      arr.push(it);
      repliesByParent.set(parentId, arr);
    }
    // Replies render oldest-first inside their thread so the conversation
    // reads top-to-bottom even though the outer feed is newest-first.
    repliesByParent.forEach((arr) =>
      arr.sort((a, b) => a.timestamp - b.timestamp),
    );

    // Top-level items = anything that isn't a reply with a known parent.
    const topLevel = items.filter((it) => {
      if (it.type !== "manual") return true;
      const parentId = it.data.replyToId;
      return !parentId || !allKeys.has(parentId);
    });

    // Simple mode reads oldest-first, so a conversation that just received an
    // answer moves to the bottom: order threads by their newest reply.
    if (variant === "simple") {
      const threadTs = (it: TimelineItem): number => {
        const replies = repliesByParent.get(getItemKey(it)) || [];
        return replies.reduce(
          (max, r) => Math.max(max, r.timestamp),
          it.timestamp,
        );
      };
      topLevel.sort((a, b) => {
        const aCreate = isCreationItem(a);
        const bCreate = isCreationItem(b);
        if (aCreate && !bCreate) return -1;
        if (bCreate && !aCreate) return 1;
        return threadTs(a) - threadTs(b);
      });
    }

    const renderItem = (
      item: TimelineItem,
      opts: { isReply?: boolean } = {},
    ): React.ReactNode => {
      const { isReply = false } = opts;
      const isSimple = variant === "simple";
      const itemKey = getItemKey(item);
      const itemFilterKey = getItemFilterKey(item);
      const isHighlighted =
        hoveredTimelineFilter !== null &&
        itemFilterKey === hoveredTimelineFilter;
      const isDimmed = hoveredTimelineFilter !== null && !isHighlighted;

      const previewBadge = item.isPreview ? (
        <Chip
          label="Preview"
          size="small"
          sx={{
            height: 16,
            fontSize: "0.55rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            bgcolor: "rgba(255, 102, 0, 0.2)",
            color: "#ff6600",
            border: "1px solid rgba(255, 102, 0, 0.4)",
            ml: 0.5,
            flexShrink: 0,
            "& .MuiChip-label": { px: 0.6 },
          }}
        />
      ) : null;

      // Reply button — added to every item so users can start a thread off
      // any timeline event (revision, change step, agent run, or comment).
      // Invisible by default (opacity: 0) and revealed on row hover on the right.
      const makeReplyButton = (compact = false) => {
        if (item.isPreview) return null;
        const isCurrentReplyTarget = replyingTo?.id === itemKey;
        return (
          <Tooltip title="Reply to this in a new comment" arrow>
            <IconButton
              size="small"
              className="timeline-reply-btn reply-btn"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startReplyTo(item);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              sx={{
                width: compact ? 18 : 22,
                height: compact ? 18 : 22,
                flexShrink: 0,
                color: isCurrentReplyTarget ? "#ff6600" : "text.disabled",
                opacity: isCurrentReplyTarget ? 1 : 0,
                pointerEvents: isCurrentReplyTarget ? "auto" : "none",
                transition:
                  "opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease",
                "&:hover": {
                  color: "#ff6600",
                  bgcolor: "rgba(255, 102, 0, 0.08)",
                },
              }}
            >
              <ReplyIcon size={compact ? 12 : 14} />
            </IconButton>
          </Tooltip>
        );
      };
      const replyButton = makeReplyButton(false);
      const replyButtonCompact = makeReplyButton(true);

      if (item.type === "revision") {
        const rev = item.data;
        const isLatest = item.idx === 0;
        const isFirst = item.idx === revisions.length - 1;
        const diff = item.parsedPrevious
          ? computeDiff(item.parsedCurrent, item.parsedPrevious)
          : null;
        const totalChanges = diff
          ? diff.added.length + diff.removed.length + diff.changed.length
          : 0;

        if (!isOnlyRevisionsFilter && !isFirst && diff && totalChanges === 0)
          return null;

        const showAsCreation = isFirst && !isOnlyRevisionsFilter;
        const initialTitle = showAsCreation
          ? cleanInitialRevisionText(
              item.parsedCurrent?.title,
              item.parsedCurrent,
              "Subject",
            ) ||
            cleanInitialRevisionText(
              item.parsedCurrent?.finding_info?.title,
              item.parsedCurrent,
              "Subject",
            ) ||
            cleanInitialRevisionText(
              item.parsedCurrent?.message,
              item.parsedCurrent,
            )
          : "";
        const initialDescription = showAsCreation
          ? cleanInitialRevisionText(
              item.parsedCurrent?.desc,
              item.parsedCurrent,
            ) ||
            cleanInitialRevisionText(
              item.parsedCurrent?.description,
              item.parsedCurrent,
            ) ||
            cleanInitialRevisionText(
              item.parsedCurrent?.supporting_data,
              item.parsedCurrent,
            )
          : "";

        return (
          <Box
            key={itemKey}
            data-timeline-key={itemKey}
            data-timeline-timestamp={item.timestamp}
            data-timeline-filter="revisions"
            data-timeline-highlighted={isHighlighted ? "true" : undefined}
            data-timeline-dimmed={isDimmed ? "true" : undefined}
            data-timeline-preview={item.isPreview ? "true" : undefined}
            onClick={
              showAsCreation
                ? () => {
                    // The "Incident created" entry opens the source evidence:
                    // Email Thread for email-sourced incidents, otherwise the
                    // Description. Always expand the section if it's currently
                    // collapsed, then scroll it into view.
                    const emailEl = document.querySelector(
                      '[data-tour="incident-email-thread"]',
                    ) as HTMLElement | null;
                    const descEl = document.querySelector(
                      '[data-tour="incident-description"]',
                    ) as HTMLElement | null;
                    const target = emailEl
                      ? {
                          el: emailEl,
                          key: "shuffle-incident-email-thread-open",
                        }
                      : descEl
                        ? {
                            el: descEl,
                            key: "shuffle-incident-description-open",
                          }
                        : null;
                    if (!target) return;
                    try {
                      // Email Thread is always expanded on open, so only the
                      // Description needs a stored-state check before toggling.
                      if (target.key !== "shuffle-incident-email-thread-open") {
                        const isOpen = localStorage.getItem(target.key) === "1";
                        if (!isOpen) {
                          const header = target.el.querySelector(
                            ":scope > div",
                          ) as HTMLElement | null;
                          header?.click();
                        }
                      }
                    } catch {
                      /* ignore */
                    }

                    setTimeout(() => {
                      target.el.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }, 80);
                  }
                : undefined
            }
            className="timeline-hover-row"
            sx={{
              p: isSimple ? (isHighlighted ? 0.75 : 0.5) : 1.5,
              borderRadius: 1.5,
              bgcolor: isHighlighted
                ? "hsl(var(--primary) / 0.12)"
                : "transparent",
              border: isHighlighted
                ? item.isPreview
                  ? "1px dashed #ff6600"
                  : "1px solid #ff6600"
                : isSimple
                  ? "none"
                  : "1px solid hsl(var(--border-subtle))",
              boxShadow: isHighlighted
                ? "0 0 12px rgba(255, 102, 0, 0.25)"
                : "none",
              opacity: isDimmed ? 0.35 : 1,
              mb: isSimple ? 1.5 : 0,
              transition:
                "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
              "&:hover": {
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.18)"
                  : "hsl(var(--muted) / 0.4)",
                borderColor: isHighlighted ? "#ff6600" : "hsl(var(--border))",
              },
              "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                {
                  opacity: 1,
                  pointerEvents: "auto",
                },
              ...(showAsCreation && { cursor: "pointer" }),
            }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}
            >
              {!isSimple && (
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    bgcolor: "hsl(var(--muted) / 0.6)",
                  }}
                >
                  <HistoryIcon
                    size={14}
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  />
                </Avatar>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    flexWrap: "wrap",
                  }}
                >
                  {isSimple && rev.updated_by && (
                    <UserHoverCard
                      username={String(rev.updated_by)}
                      maxChars={12}
                    />
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: isSimple ? 500 : 600,
                      fontSize: "0.73rem",
                      color: isSimple ? "text.secondary" : undefined,
                      ...timelineClampSingleLineSx,
                    }}
                  >
                    {showAsCreation
                      ? "Incident created"
                      : isSimple
                        ? diff && diff.changed.length === 1
                          ? `changed ${diff.changed[0].field} to ${truncateValue(diff.changed[0].to)}`
                          : `made ${totalChanges || 0} change${totalChanges === 1 ? "" : "s"}`
                        : `Change #${revisionNumber(item.idx)}`}
                  </Typography>
                  {previewBadge}
                  {isLatest && !showAsCreation && !isSimple && (
                    <Chip
                      label="Latest"
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 16,
                        fontSize: "0.58rem",
                        bgcolor: "transparent",
                        borderColor: "hsl(var(--border))",
                        color: "text.secondary",
                        fontWeight: 600,
                      }}
                    />
                  )}
                  {isFirst && !isLatest && !showAsCreation && !isSimple && (
                    <Chip
                      label="Initial"
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 16,
                        fontSize: "0.58rem",
                        bgcolor: "transparent",
                        borderColor: "hsl(var(--border-subtle))",
                        color: "text.secondary",
                        fontWeight: 600,
                      }}
                    />
                  )}
                  {totalChanges > 0 && !showAsCreation && !isSimple && (
                    <Chip
                      label={`${totalChanges} change${totalChanges !== 1 ? "s" : ""}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 16,
                        fontSize: "0.58rem",
                        bgcolor: "transparent",
                        borderColor: "hsl(var(--border))",
                        color: "text.secondary",
                      }}
                    />
                  )}
                  {isSimple && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        ml: "auto",
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: "text.disabled", fontSize: "0.6rem" }}
                      >
                        {item.timestamp
                          ? formatCompactTime(item.timestamp)
                          : "Unknown"}
                      </Typography>
                      {replyButtonCompact}
                    </Box>
                  )}
                </Box>
                {!isSimple && (
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
                  >
                    {rev.updated_by && (
                      <UserHoverCard
                        username={String(rev.updated_by)}
                        maxChars={24}
                      />
                    )}
                    <Typography
                      variant="caption"
                      sx={{ color: "text.disabled", fontSize: "0.65rem" }}
                    >
                      {item.timestamp
                        ? formatRelativeTime(item.timestamp)
                        : "Unknown"}
                    </Typography>
                  </Box>
                )}
              </Box>
              {!isSimple && replyButton}
              {rev.value && (
                <Tooltip title="View revision data">
                  <IconButton
                    size="small"
                    onClick={() => {
                      try {
                        const parsed =
                          typeof rev.value === "string"
                            ? JSON.parse(rev.value)
                            : rev.value;
                        const changedKeys = new Set<string>();
                        if (diff) {
                          diff.added.forEach((k) => changedKeys.add(k));
                          diff.removed.forEach((k) => changedKeys.add(k));
                          diff.changed.forEach((c) => changedKeys.add(c.field));
                        }
                        setRevisionDialogData({
                          json: JSON.stringify(parsed, null, 2),
                          changedKeys,
                        });
                      } catch {
                        toast.error("Could not parse revision data");
                      }
                    }}
                    sx={{
                      color: "text.secondary",
                      width: 24,
                      height: 24,
                      "&:hover": { color: "#ff6600" },
                    }}
                  >
                    <VisibilityIcon size={14} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            {showAsCreation && (initialTitle || initialDescription) && (
              <Box
                sx={{
                  mt: 0.75,
                  ml: isSimple ? 0 : 4,
                  pl: isSimple ? 1.25 : 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                }}
              >
                {initialTitle && (
                  <Typography
                    sx={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "hsl(var(--foreground))",
                      lineHeight: 1.35,
                      ...timelineClampSingleLineSx,
                    }}
                  >
                    {decodeHtmlEntities(String(initialTitle))}
                  </Typography>
                )}
                {initialDescription && (
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: "hsl(var(--muted-foreground))",
                      lineHeight: 1.5,
                      ...timelineClampSingleLineSx,
                    }}
                  >
                    {decodeHtmlEntities(
                      String(initialDescription)
                        .replace(/<[^>]*>/g, "")
                        .trim(),
                    )}
                  </Typography>
                )}
              </Box>
            )}

            {diff && totalChanges > 0 && !showAsCreation && (
              <Box
                sx={{
                  mt: 0.75,
                  ml: isSimple ? 0 : 4,
                  pl: isSimple ? 1.25 : 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.25,
                }}
              >
                {diff.changed.map(({ field, from, to }) => (
                  <Box
                    key={field}
                    sx={{ display: "flex", flexDirection: "column", gap: 0.15 }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.63rem",
                        fontWeight: 600,
                        color: "hsl(var(--foreground))",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {field}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      <Typography
                        sx={{
                          fontSize: "0.6rem",
                          fontFamily: "JetBrains Mono, monospace",
                          color: "hsl(var(--destructive))",
                          bgcolor: "hsl(var(--destructive) / 0.08)",
                          px: 0.5,
                          py: 0.15,
                          borderRadius: 0.5,
                          lineHeight: 1.4,
                          textDecoration: "line-through",
                          opacity: 0.8,
                          ...timelineClampSingleLineSx,
                        }}
                      >
                        {truncateValue(from)}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "0.6rem",
                          fontFamily: "JetBrains Mono, monospace",
                          color: "hsl(var(--status-resolved))",
                          bgcolor: "hsl(var(--status-resolved) / 0.08)",
                          px: 0.5,
                          py: 0.15,
                          borderRadius: 0.5,
                          lineHeight: 1.4,
                          ...timelineClampSingleLineSx,
                        }}
                      >
                        {truncateValue(to)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {diff.added.map((field) => (
                  <Typography
                    key={field}
                    sx={{
                      fontSize: "0.63rem",
                      fontWeight: 600,
                      fontFamily: "JetBrains Mono, monospace",
                      color: "hsl(var(--status-resolved))",
                    }}
                  >
                    + {field}
                  </Typography>
                ))}
                {diff.removed.map((field) => (
                  <Typography
                    key={field}
                    sx={{
                      fontSize: "0.63rem",
                      fontWeight: 600,
                      fontFamily: "JetBrains Mono, monospace",
                      color: "hsl(var(--destructive))",
                    }}
                  >
                    − {field}
                  </Typography>
                ))}
              </Box>
            )}
            {isFirst && !diff && !showAsCreation && (
              <Typography
                variant="caption"
                sx={{
                  ml: 4,
                  color: "text.disabled",
                  fontSize: "0.6rem",
                  fontStyle: "italic",
                }}
              >
                Initial revision
              </Typography>
            )}
          </Box>
        );
      }

      if (item.type === "agent") {
        const run = item.data;
        const status = run.status?.toUpperCase() || "";
        const statusCfg = AGENT_STATUS_CONFIG[status];
        const skip = getAgentSkipInfo(run);
        const accent = skip.skipped
          ? "hsl(var(--muted-foreground))"
          : getRunIconColor(run);
        const title = getRunTitle(run);
        const duration = formatAgentRunDuration(run);
        const timeAgo = run.started_at ? getAgentTimeAgo(run.started_at) : "";
        const exactTs = run.started_at
          ? new Date(normalizeToMs(run.started_at)).toLocaleString()
          : "";
        // Status pill (Skipped / Running / Failed-needs-attention / Needs-attention / clean)
        // is rendered by the shared <AgentRunStatusBadge /> component so the
        // timeline, agent activity list, and drawer all show the same thing.
        // Completed/clean runs and skipped runs should be "quiet" on the timeline
        // — no loud orange dot, no grey card background, no bright text. Only
        // truly noteworthy states (failed / needs-attention) stand out.
        const isFailed =
          status === "FAILED" || status === "ERROR" || status === "ABORTED";
        const needsAttention = !!(
          statusCfg && (statusCfg as any).needsAttention
        );
        const isQuiet = !isFailed && !needsAttention;

        if (isSimple) {
          const actorName = run.workflow?.name || "AI Agent";
          const isRunning = status === "EXECUTING" || status === "RUNNING";
          const failureInfo = isFailed ? getAgentFailureInfo(run) : null;
          const outputDiagnosis =
            !skip.skipped &&
            !isRunning &&
            !isFailed &&
            hasAgentOutputWarning(run)
              ? diagnoseAgentOutputWarning(run)
              : null;
          const hasWarning =
            !skip.skipped && (isFailed || !!outputDiagnosis || needsAttention);
          const verb = skip.skipped
            ? "skipped"
            : isRunning
              ? "executing"
              : isFailed
                ? "failed"
                : hasWarning
                  ? "needs attention"
                  : "finished";
          const timeText = run.started_at
            ? formatCompactTime(normalizeToMs(run.started_at))
            : "";
          const detailText = skip.skipped
            ? skip.reason || "Skipped — agent did not run"
            : failureInfo
              ? failureInfo.reason || "Failed — needs attention"
              : outputDiagnosis
                ? outputDiagnosis.title
                : title && title !== actorName
                  ? `${title}${duration ? ` · ${duration}` : ""}`
                  : duration
                    ? `Execution · ${duration}`
                    : run.execution_id
                      ? `Execution ${String(run.execution_id).slice(0, 8)}`
                      : "";

          return (
            <Box
              key={itemKey}
              data-timeline-key={itemKey}
              data-timeline-timestamp={item.timestamp}
              data-timeline-filter="agent"
              data-timeline-compact="true"
              data-timeline-highlighted={isHighlighted ? "true" : undefined}
              data-timeline-dimmed={isDimmed ? "true" : undefined}
              data-timeline-preview={item.isPreview ? "true" : undefined}
              onClick={() => setSelectedAgentRun(run)}
              className="timeline-hover-row"
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 0.5,
                px: isHighlighted ? 0.75 : 0,
                py: 0.25,
                borderRadius: isHighlighted ? 1 : 0,
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.12)"
                  : "transparent",
                border: isHighlighted
                  ? item.isPreview
                    ? "1px dashed #ff6600"
                    : "1px solid #ff6600"
                  : "none",
                boxShadow: isHighlighted
                  ? "0 0 12px rgba(255, 102, 0, 0.25)"
                  : "none",
                opacity: isDimmed ? 0.35 : 1,
                transition:
                  "opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                mb: 1.375,
                cursor: "pointer",
                "&:hover": {
                  bgcolor: isHighlighted
                    ? "hsl(var(--primary) / 0.18)"
                    : "hsl(var(--muted) / 0.25)",
                },
                "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                  {
                    opacity: 1,
                    pointerEvents: "auto",
                  },
              }}
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  flexShrink: 0,
                  color: "text.secondary",
                }}
              >
                <AgentIcon size={13} />
              </Box>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "text.secondary",
                  ...timelineClampSingleLineSx,
                }}
              >
                {actorName}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  color: "text.secondary",
                  flexShrink: 0,
                }}
              >
                {verb}
              </Typography>
              {previewBadge}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  ml: "auto",
                  flexShrink: 0,
                }}
              >
                {timeText && (
                  <Typography
                    sx={{
                      fontSize: "0.6rem",
                      color: "text.disabled",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {timeText}
                  </Typography>
                )}
                {replyButtonCompact}
              </Box>
              {detailText && (
                <Typography
                  sx={{
                    fontSize: "0.75rem",
                    color: "hsl(var(--foreground))",
                    flex: "1 1 100%",
                    order: 2,
                    pl: 1.25,
                    lineHeight: 1.4,
                    ...timelineClampSingleLineSx,
                  }}
                  title={detailText}
                >
                  {detailText}
                </Typography>
              )}
            </Box>
          );
        }

        return (
          <Box
            key={itemKey}
            data-timeline-key={itemKey}
            data-timeline-timestamp={item.timestamp}
            data-timeline-filter="agent"
            data-timeline-compact="true"
            data-timeline-quiet={isQuiet ? "true" : undefined}
            data-status-hover="true"
            data-timeline-highlighted={isHighlighted ? "true" : undefined}
            data-timeline-dimmed={isDimmed ? "true" : undefined}
            data-timeline-preview={item.isPreview ? "true" : undefined}
            onClick={() => setSelectedAgentRun(run)}
            className="timeline-hover-row"
            sx={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderRadius: 1.5,
              border: isHighlighted
                ? item.isPreview
                  ? "1px dashed #ff6600"
                  : "1px solid #ff6600"
                : skip.skipped
                  ? "1px dashed hsl(var(--border))"
                  : isQuiet
                    ? "1px solid transparent"
                    : "1px solid hsl(var(--border))",
              bgcolor: isHighlighted
                ? "hsl(var(--primary) / 0.12)"
                : skip.skipped
                  ? "hsl(var(--muted) / 0.2)"
                  : isQuiet
                    ? "transparent"
                    : "hsl(var(--card))",
              boxShadow: isHighlighted
                ? "0 0 12px rgba(255, 102, 0, 0.25)"
                : "none",
              mb: 0,
              opacity: isDimmed ? 0.35 : skip.skipped ? 0.85 : 1,
              cursor: "pointer",
              transition:
                "opacity 0.2s ease, border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease, box-shadow 0.2s ease",
              "&:hover": {
                borderColor: isHighlighted
                  ? "#ff6600"
                  : "hsl(var(--muted-foreground) / 0.4)",
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.18)"
                  : "hsl(var(--muted) / 0.3)",
              },
              "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                {
                  opacity: 1,
                  pointerEvents: "auto",
                },
            }}
          >
            {/* Invisible hover target over the rail dot — provides exact timestamp tooltip */}
            {exactTs && (
              <Tooltip title={exactTs} arrow placement="left">
                <Box
                  onClick={(e) => e.stopPropagation()}
                  sx={{
                    position: "absolute",
                    left: -28,
                    top: 0,
                    width: 24,
                    height: 24,
                    cursor: "help",
                    zIndex: 2,
                  }}
                />
              </Tooltip>
            )}
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                flexShrink: 0,
                opacity: skip.skipped ? 0.6 : isQuiet ? 0.7 : 1,
              }}
            >
              <AgentIcon size={14} />
            </Box>
            <Typography
              sx={{
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: skip.skipped
                  ? "hsl(var(--muted-foreground))"
                  : isQuiet
                    ? "hsl(var(--muted-foreground))"
                    : "hsl(var(--foreground))",
                flexShrink: 1,
                minWidth: 0,
                '[data-timeline-quiet="true"]:hover &': {
                  color: "hsl(var(--foreground))",
                },
                ...timelineClampSingleLineSx,
              }}
            >
              {title}
            </Typography>
            <AgentRunStatusBadge
              run={run}
              skip={skip}
              statusCfg={statusCfg}
              compact
              maxWidth={160}
            />
            {previewBadge}
            {duration && (
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  color: "hsl(var(--muted-foreground))",
                  flexShrink: 0,
                }}
              >
                · {duration}
              </Typography>
            )}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                ml: "auto",
                flexShrink: 0,
              }}
            >
              {timeAgo && (
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    color: "hsl(var(--muted-foreground))",
                    whiteSpace: "nowrap",
                  }}
                >
                  {timeAgo}
                </Typography>
              )}
              {replyButtonCompact}
            </Box>
          </Box>
        );
      }

      if (item.type === "workflow-exec") {
        // Non-agent workflow execution that touched this incident (datastore
        // trigger, enrichment workflow, forward-to-tool run, etc.). Rendered
        // as a quiet neutral pill with a direct link out to the Shuffle
        // execution view — clicking opens the workflow run in a new tab.
        const run: any = item.data;
        const status = String(run.status || "").toUpperCase();
        const isRunning =
          status === "EXECUTING" ||
          status === "WAITING" ||
          status === "RUNNING";
        const isFailed =
          status === "FAILED" || status === "ERROR" || status === "ABORTED";
        const startedMs = run.started_at ? normalizeToMs(run.started_at) : 0;
        const isLongRunning =
          isRunning && startedMs > 0 && Date.now() - startedMs > 5 * 60 * 1000;
        const notifCount = Number(run.notifications_created) || 0;
        const hasNotifications = notifCount > 0;
        const isWarning = !isFailed && (hasNotifications || isLongRunning);
        const timeAgo = run.started_at ? getAgentTimeAgo(run.started_at) : "";
        const exactTs = run.started_at
          ? new Date(normalizeToMs(run.started_at)).toLocaleString()
          : "";
        const wfName = run.workflow?.name || run.workflow_name || "Workflow";
        const shortId = String(run.execution_id || "").slice(0, 8);
        const wfId = run.workflow_id || run.workflow?.id || "";
        const execUrl =
          wfId && run.execution_id
            ? getShuffleCoreWorkflowUrl(wfId, {
                execution_id: run.execution_id,
              })
            : run.execution_id
              ? getShuffleCoreUrl(
                  `/admin?admin_tab=workflow_runs&execution_id=${run.execution_id}`,
                )
              : "";
        const warnTitle =
          hasNotifications && isLongRunning
            ? `${notifCount} notification${notifCount === 1 ? "" : "s"} created · running >5 min`
            : hasNotifications
              ? `${notifCount} notification${notifCount === 1 ? "" : "s"} created — may indicate an issue`
              : "Executing for more than 5 minutes";
        const questionNotif = run.execution_id
          ? questionByExecId[String(run.execution_id)]
          : undefined;
        if (isSimple) {
          const verb = isFailed
            ? "failed"
            : isRunning
              ? "executing"
              : isWarning
                ? "needs attention"
                : status
                  ? status.toLowerCase()
                  : "finished";
          const timeText =
            startedMs > 0
              ? formatCompactTime(startedMs)
              : run.started_at
                ? formatCompactTime(normalizeToMs(run.started_at))
                : "";
          const detailText = isWarning
            ? warnTitle
            : isFailed
              ? shortId
                ? `Execution failed · ${shortId}`
                : "Execution failed"
              : isRunning
                ? shortId
                  ? `Running · ${shortId}`
                  : "Running"
                : shortId
                  ? `Execution ${shortId}`
                  : "";

          return (
            <Box
              key={itemKey}
              data-timeline-key={itemKey}
              data-timeline-timestamp={item.timestamp}
              data-timeline-filter="workflows"
              data-timeline-compact="true"
              data-timeline-highlighted={isHighlighted ? "true" : undefined}
              data-timeline-dimmed={isDimmed ? "true" : undefined}
              data-timeline-preview={item.isPreview ? "true" : undefined}
              className="timeline-hover-row"
              sx={{ display: "flex", flexDirection: "column" }}
            >
              <Box
                onClick={async () => {
                  if (run.execution_id)
                    setSelectedWorkflowExecutionId(String(run.execution_id));
                  else if (execUrl)
                    await navigateToShuffleCore(execUrl, { newTab: true });
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 0.5,
                  px: isHighlighted ? 0.75 : 0,
                  py: 0.25,
                  borderRadius: isHighlighted ? 1 : 0,
                  bgcolor: isHighlighted
                    ? "hsl(var(--primary) / 0.12)"
                    : "transparent",
                  border: isHighlighted
                    ? item.isPreview
                      ? "1px dashed #ff6600"
                      : "1px solid #ff6600"
                    : "none",
                  boxShadow: isHighlighted
                    ? "0 0 12px rgba(255, 102, 0, 0.25)"
                    : "none",
                  opacity: isDimmed ? 0.35 : 1,
                  transition:
                    "opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                  mb: 1.375,
                  cursor: run.execution_id || execUrl ? "pointer" : "default",
                  "&:hover": {
                    bgcolor: isHighlighted
                      ? "hsl(var(--primary) / 0.18)"
                      : "hsl(var(--muted) / 0.25)",
                  },
                  "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                    {
                      opacity: 1,
                      pointerEvents: "auto",
                    },
                }}
              >
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    flexShrink: 0,
                    color: isFailed
                      ? "hsl(var(--destructive))"
                      : isWarning
                        ? "hsl(var(--severity-medium))"
                        : "hsl(var(--muted-foreground))",
                  }}
                >
                  <ZapIcon size={13} />
                </Box>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "text.secondary",
                    ...timelineClampSingleLineSx,
                  }}
                >
                  {wfName}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 500,
                    color: "text.secondary",
                    flexShrink: 0,
                  }}
                >
                  {verb}
                </Typography>
                {previewBadge}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    ml: "auto",
                    flexShrink: 0,
                  }}
                >
                  {timeText && (
                    <Typography
                      sx={{
                        fontSize: "0.6rem",
                        color: "text.disabled",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {timeText}
                    </Typography>
                  )}
                  {replyButtonCompact}
                </Box>
                {detailText && (
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: "hsl(var(--foreground))",
                      flex: "1 1 100%",
                      order: 2,
                      pl: 1.25,
                      lineHeight: 1.4,
                      ...timelineClampSingleLineSx,
                    }}
                    title={detailText}
                  >
                    {detailText}
                  </Typography>
                )}
              </Box>
              {questionNotif && (
                <InlineAgentQuestion
                  notification={questionNotif}
                  onOpenDetails={openAgentRunDetails}
                  onSubmitted={() => {
                    refreshAgentNotifications();
                    refetchWorkflowRuns();
                    refetchAgentRuns();
                  }}
                />
              )}
            </Box>
          );
        }

        return (
          <Box
            key={itemKey}
            data-timeline-key={itemKey}
            data-timeline-timestamp={item.timestamp}
            data-timeline-filter="workflows"
            // The rail dot is drawn on the DIRECT child of the timeline
            // container, so the compact/quiet markers must live on this
            // wrapper — not on the inner row — otherwise the dot falls back
            // to the tall-card offset and stays accent-orange.
            data-timeline-compact="true"
            data-timeline-quiet={
              !isFailed && !isRunning && !isWarning ? "true" : undefined
            }
            data-timeline-highlighted={isHighlighted ? "true" : undefined}
            data-timeline-dimmed={isDimmed ? "true" : undefined}
            data-timeline-preview={item.isPreview ? "true" : undefined}
            className="timeline-hover-row"
            sx={{ display: "flex", flexDirection: "column" }}
          >
            <Box
              onClick={async () => {
                if (run.execution_id)
                  setSelectedWorkflowExecutionId(String(run.execution_id));
                else if (execUrl)
                  await navigateToShuffleCore(execUrl, { newTab: true });
              }}

              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.25,
                height: 30,
                boxSizing: "border-box",
                lineHeight: 1,
                borderRadius: 1.5,
                border: isHighlighted
                  ? item.isPreview
                    ? "1px dashed #ff6600"
                    : "1px solid #ff6600"
                  : isFailed
                    ? "1px solid hsl(var(--destructive) / 0.5)"
                    : isWarning
                      ? "1px solid hsl(var(--severity-medium) / 0.6)"
                      : "1px solid transparent",
                mb: 0,
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.12)"
                  : isWarning
                    ? "hsl(var(--severity-medium) / 0.08)"
                    : "transparent",
                boxShadow: isHighlighted
                  ? "0 0 12px rgba(255, 102, 0, 0.25)"
                  : "none",
                opacity: isDimmed ? 0.35 : 1,
                cursor: execUrl ? "pointer" : "default",
                transition:
                  "opacity 0.2s ease, border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease, box-shadow 0.2s ease",
                "&:hover": {
                  borderColor: isHighlighted
                    ? "#ff6600"
                    : isWarning
                      ? "hsl(var(--severity-medium))"
                      : "hsl(var(--muted-foreground) / 0.4)",
                  bgcolor: isHighlighted
                    ? "hsl(var(--primary) / 0.18)"
                    : isWarning
                      ? "hsl(var(--severity-medium) / 0.14)"
                      : "hsl(var(--muted) / 0.3)",
                  ...(isFailed || isRunning || isWarning
                    ? {}
                    : {
                        "& .wf-status-icon svg": {
                          color: "hsl(var(--severity-low))",
                        },
                        "& .wf-status-icon svg *": {
                          stroke: "hsl(var(--severity-low))",
                        },
                        "& .wf-status-text": {
                          color: "hsl(var(--severity-low))",
                        },
                      }),
                },
                "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                  {
                    opacity: 1,
                    pointerEvents: "auto",
                  },
              }}
            >
              {exactTs && (
                <Tooltip title={exactTs} arrow placement="left">
                  <Box
                    sx={{
                      position: "absolute",
                      left: -28,
                      top: 0,
                      width: 24,
                      height: 24,
                      cursor: "help",
                      zIndex: 2,
                    }}
                  />
                </Tooltip>
              )}
              <Box
                className="wf-status-icon"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  flexShrink: 0,
                  opacity: 0.8,
                  transition: "color 0.15s ease",
                }}
              >
                {isRunning ? (
                  <CircularProgress
                    size={12}
                    thickness={5}
                    sx={{
                      color: isWarning
                        ? "hsl(var(--severity-medium))"
                        : "hsl(var(--muted-foreground))",
                    }}
                  />
                ) : (
                  <ZapIcon
                    size={14}
                    color={
                      isFailed
                        ? "hsl(var(--destructive))"
                        : isWarning
                          ? "hsl(var(--severity-medium))"
                          : "hsl(var(--muted-foreground))"
                    }
                  />
                )}
              </Box>
              <Typography
                sx={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: isWarning
                    ? "hsl(var(--foreground))"
                    : "hsl(var(--muted-foreground))",
                  minWidth: 0,
                  flexShrink: 1,
                  ...timelineClampSingleLineSx,
                }}
              >
                {wfName}
                {shortId ? ` · ${shortId}` : ""}
              </Typography>
              {previewBadge}
              {status && (
                <Typography
                  className="wf-status-text"
                  sx={{
                    fontSize: "0.7rem",
                    color: isFailed
                      ? "hsl(var(--destructive))"
                      : isWarning
                        ? "hsl(var(--severity-medium))"
                        : "hsl(var(--muted-foreground))",
                    flexShrink: 0,
                    textTransform: "lowercase",
                    transition: "color 0.15s ease",
                  }}
                >
                  · {status.toLowerCase()}
                </Typography>
              )}
              {isWarning && (
                <Tooltip title={warnTitle} arrow>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.25,
                      flexShrink: 0,
                      color: "hsl(var(--severity-medium))",
                    }}
                  >
                    <WarningAmberIcon size={13} />
                    {hasNotifications && (
                      <Typography
                        sx={{
                          fontSize: "0.7rem",
                          color: "hsl(var(--severity-medium))",
                          fontWeight: 600,
                        }}
                      >
                        {notifCount}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              )}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  ml: "auto",
                  flexShrink: 0,
                }}
              >
                {timeAgo && (
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      color: "hsl(var(--muted-foreground))",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {timeAgo}
                  </Typography>
                )}
                {replyButtonCompact}
              </Box>
            </Box>
            {questionNotif && (
              <InlineAgentQuestion
                notification={questionNotif}
                onOpenDetails={openAgentRunDetails}
                onSubmitted={() => {
                  refreshAgentNotifications();
                  refetchWorkflowRuns();
                  refetchAgentRuns();
                }}
              />
            )}
          </Box>
        );
      }

      if (item.type === "step") {
        // Compact "step" pill — these are derived events (task created /
        // observable added / correlation found) injected on the frontend so
        // the user can see *when* every artefact appeared on the timeline.
        // Step pills use a single neutral scheme so the timeline reads
        // "here's the sequence of what happened" rather than a colour
        // parade. The icon shape still tells you WHAT happened; only IOC /
        // error pills escape into red below.
        const stepStyle: Record<StepKind, { icon: React.ReactNode }> = {
          "task-created": { icon: <TaskAltIcon size={12} /> },
          "task-completed": { icon: <CheckCircleIcon size={12} /> },
          "task-status-changed": { icon: <ForwardIcon size={12} /> },
          "observable-added": { icon: <FingerprintIcon size={12} /> },
          "correlation-found": { icon: <Network size={12} /> },
          "incident-created": { icon: <HistoryIcon size={12} /> },
          "routing-matched": { icon: <CallSplitIcon size={12} /> },
          "attribute-changed": { icon: <EditIcon size={12} /> },
        };
        const cfg = stepStyle[item.kind];
        // Highlight observable-added pills when the underlying observable
        // arrived in the most recent background poll. The id format is
        // `step-obs-${type::value}` (lowercase) — matched against
        // newlyArrivedObservables which uses the same key format.
        const isStepHighlighted =
          item.kind === "observable-added" &&
          item.id.startsWith("step-obs-") &&
          newlyArrivedObservables.has(item.id.slice("step-obs-".length));

        // Decide whether the pill should be clickable and where it jumps to.
        // Observable pills jump to the matching row in the Observables tab;
        // correlation pills jump to the Correlations tab (and to the matching
        // observable row when the correlation was discovered per-observable).
        let pillOnClick: (() => void) | undefined;
        if (
          item.kind === "observable-added" &&
          item.id.startsWith("step-obs-") &&
          !item.id.startsWith("step-obs-bulk-")
        ) {
          const obsKey = item.id.slice("step-obs-".length);
          pillOnClick = () => {
            const lower = obsKey.toLowerCase();
            const isIp =
              lower.startsWith("ip::") ||
              lower.startsWith("ipv4::") ||
              lower.startsWith("ipv6::");
            const isIoc = iocObservableKeys.has(lower);
            // Demo mode: notify the tour when the user clicks an IP pill OR
            // any pill flagged as a Known IOC (the demo guarantees a Known
            // IOC will be present, so we make that the primary click target).
            if (isIp || isIoc) {
              try {
                window.dispatchEvent(
                  new CustomEvent("demo:timeline-ip-clicked", {
                    detail: { obsKey, isIoc },
                  }),
                );
              } catch {
                /* ignore */
              }
            }
            // Known IOC pills route the user to the AI agent: prefill an
            // @agent question about the observable instead of just jumping to
            // the Observables tab. Plain (non-IOC) observable pills keep the
            // original "show me where this observable lives" behaviour.
            if (isIoc) {
              askAgentAboutObservable(obsKey);
            } else {
              focusObservableFromTimeline(obsKey);
            }
          };
        } else if (
          item.kind === "observable-added" &&
          item.id.startsWith("step-obs-bulk-")
        ) {
          // Bulked observable pills: jump to the Observables tab and scroll
          // to the first observable from this burst so the user lands at the
          // actual content the pill is summarising — not the top of the tab.
          const firstKey =
            item.obsKeys && item.obsKeys.length > 0 ? item.obsKeys[0] : null;
          pillOnClick = () => focusObservableFromTimeline(firstKey);
        } else if (item.kind === "correlation-found") {
          // Bulked observable correlations (id prefix `step-corr-obs-bulk-`)
          // can't jump to a single observable row — send the user to the
          // Correlations tab instead.
          if (item.id.startsWith("step-corr-obs-bulk-")) {
            pillOnClick = () => focusCorrelationFromTimeline(null);
          } else if (item.id.startsWith("step-corr-obs-")) {
            const obsKey = item.id.slice("step-corr-obs-".length).toLowerCase();
            pillOnClick = () => {
              const isIoc = iocObservableKeys.has(obsKey);
              if (isIoc) {
                try {
                  window.dispatchEvent(
                    new CustomEvent("demo:timeline-ip-clicked", {
                      detail: { obsKey, isIoc: true },
                    }),
                  );
                } catch {
                  /* ignore */
                }
                askAgentAboutObservable(obsKey);
              } else {
                focusObservableFromTimeline(obsKey);
              }
            };
          } else {
            pillOnClick = () => focusCorrelationFromTimeline(null);
          }
        } else if (item.kind === "routing-matched") {
          // Re-surface the matched rule in the RoutingRulePreviewBanner even
          // if the user had dismissed it at the top, then scroll to it.
          const ruleId = item.id.startsWith("step-routing-")
            ? item.id.slice("step-routing-".length)
            : "";
          pillOnClick = () => {
            try {
              window.dispatchEvent(
                new CustomEvent("routing-preview:reveal", {
                  detail: { ruleId },
                }),
              );
            } catch {
              /* ignore */
            }
            const el = document.getElementById("routing-rule-preview-banner");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          };
        } else if (item.taskId) {
          // Task pills jump to the Tasks tab and scroll to the task card.
          const taskId = item.taskId;
          pillOnClick = () => focusTaskFromTimeline(taskId);
        }
        const isClickable = !!pillOnClick;
        // Detect whether the pill represents (or correlates to) an observable
        // already known to match an IOC / threat-feed entry. We pull the obs
        // key out of the synthetic `step-obs-` / `step-corr-obs-` id format.
        // Bulked correlations have no single underlying obs — they never
        // light up as IOC pills.
        let pillObsKey: string | null = null;
        if (
          item.kind === "observable-added" &&
          item.id.startsWith("step-obs-") &&
          !item.id.startsWith("step-obs-bulk-")
        ) {
          pillObsKey = item.id.slice("step-obs-".length).toLowerCase();
        } else if (
          item.kind === "correlation-found" &&
          item.id.startsWith("step-corr-obs-") &&
          !item.id.startsWith("step-corr-obs-bulk-")
        ) {
          pillObsKey = item.id.slice("step-corr-obs-".length).toLowerCase();
        }
        const isIocPill = !!pillObsKey && iocObservableKeys.has(pillObsKey);
        // IOC pills override the neutral scheme with the destructive token
        // so the user immediately sees that *this* observable is known-bad.
        const pillColor = isIocPill
          ? "hsl(var(--destructive))"
          : "hsl(var(--muted-foreground))";
        const pillBg = isIocPill
          ? "hsl(var(--destructive) / 0.08)"
          : "transparent";
        const pillBorder = isIocPill
          ? "hsl(var(--destructive) / 0.5)"
          : "hsl(var(--border-subtle))";
        const pillBgHover = isIocPill
          ? "hsl(var(--destructive) / 0.14)"
          : "hsl(var(--muted) / 0.5)";
        const pillBorderHover = isIocPill
          ? "hsl(var(--destructive) / 0.7)"
          : "hsl(var(--border))";

        // Sparse-correlation context strip: when this pill represents a
        // correlation (or an observable that has correlations) and the set
        // of *other* referenced incidents is small (≤2), surface the same
        // recency + severity strip we render on the Correlations tab so the
        // timeline is not just a "something happened" feed but a triage
        // surface — relevance depends on more than just IOC flagging.
        let sparseIncidentRefs: string[] = [];
        if (item.kind === "correlation-found" && pillObsKey) {
          const corrEntry = obsCorrelations[pillObsKey];
          if (corrEntry?.data?.length) {
            const idsSet = new Set<string>();
            corrEntry.data.forEach((c) => {
              c.ref.forEach((r) => {
                const [cat, key] = r.split("|");
                if (cat !== "shuffle-security_incidents" || !key) return;
                if (id && key.toLowerCase() === id.toLowerCase()) return;
                idsSet.add(key);
              });
            });
            const ids = Array.from(idsSet);
            if (ids.length > 0 && ids.length < 3) sparseIncidentRefs = ids;
          }
        } else if (item.kind === "observable-added" && pillObsKey) {
          const corrEntry = obsCorrelations[pillObsKey];
          if (corrEntry?.data?.length) {
            const idsSet = new Set<string>();
            corrEntry.data.forEach((c) => {
              c.ref.forEach((r) => {
                const [cat, key] = r.split("|");
                if (cat !== "shuffle-security_incidents" || !key) return;
                if (id && key.toLowerCase() === id.toLowerCase()) return;
                idsSet.add(key);
              });
            });
            const ids = Array.from(idsSet);
            if (ids.length > 0 && ids.length < 3) sparseIncidentRefs = ids;
          }
        }

        const matchingTask = item.taskId
          ? visibleTasks.find(
              (t) =>
                String(t.id) === String(item.taskId) ||
                (t.title && t.title === item.detail),
            ) ||
            tasks.find(
              (t) =>
                String(t.id) === String(item.taskId) ||
                (t.title && t.title === item.detail),
            )
          : undefined;
        const isTaskCompleted = !!matchingTask?.completed;

        const pill = isSimple ? (
          <Box
            key={item.id}
            data-timeline-compact="true"
            data-timeline-key={itemKey}
            data-timeline-timestamp={item.timestamp}
            data-timeline-filter={itemFilterKey || ""}
            data-timeline-highlighted={isHighlighted ? "true" : undefined}
            data-timeline-dimmed={isDimmed ? "true" : undefined}
            data-timeline-preview={item.isPreview ? "true" : undefined}
            data-tour={isIocPill ? "timeline-ioc-pill" : undefined}
            data-ioc-pill={isIocPill ? "true" : undefined}
            className={[
              "timeline-hover-row",
              isStepHighlighted ? "incident-new-flash" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={pillOnClick}
            sx={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              px: isHighlighted ? 0.75 : 0,
              py: 0.35,
              borderRadius: 1,
              bgcolor: isHighlighted ? "hsl(var(--primary) / 0.12)" : pillBg,
              border: isHighlighted
                ? item.isPreview
                  ? "1px dashed #ff6600"
                  : "1px solid #ff6600"
                : "none",
              boxShadow: isHighlighted
                ? "0 0 12px rgba(255, 102, 0, 0.25)"
                : "none",
              opacity: isDimmed ? 0.35 : 1,
              mb: 1.375,
              cursor: isClickable ? "pointer" : "default",
              transition:
                "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
              "&:hover": {
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.18)"
                  : isClickable
                    ? pillBgHover
                    : undefined,
                borderColor: isHighlighted
                  ? "#ff6600"
                  : isClickable
                    ? pillBorderHover
                    : undefined,
              },
              "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                {
                  opacity: 1,
                  pointerEvents: "auto",
                },
            }}
          >
            {/* Row 1: Header (Icon, Actor, Action label, Badges, Timestamp, Reply) */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                minWidth: 0,
                gap: 0.75,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: pillColor,
                  flexShrink: 0,
                }}
              >
                {isIocPill ? <WarningAmberIcon size={12} /> : cfg.icon}
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  minWidth: 0,
                  flex: "1 1 auto",
                  overflow: "hidden",
                }}
              >
                {item.actor && (
                  <UserHoverCard username={item.actor} maxChars={12} />
                )}
                {item.label && item.kind !== "observable-added" && (
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 500,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                    title={item.label}
                  >
                    {stepVerbLabel(item.label, !!item.actor)}
                  </Typography>
                )}
              </Box>

              {previewBadge}
              {isIocPill && (
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    px: 0.6,
                    py: 0.05,
                    borderRadius: 999,
                    bgcolor: "hsl(var(--destructive) / 0.15)",
                    color: "hsl(var(--destructive))",
                    border: "1px solid hsl(var(--destructive) / 0.4)",
                    flexShrink: 0,
                  }}
                >
                  IOC
                </Typography>
              )}
              {item.kind === "observable-added" && !!item.corrCount && (
                <Tooltip
                  title={`${item.corrCount} correlation match${item.corrCount === 1 ? "" : "es"} — click to view`}
                  arrow
                >
                  <Typography
                    component="span"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (item.corrObsKeys && item.corrObsKeys.length === 1) {
                        focusObservableFromTimeline(item.corrObsKeys[0]);
                      } else {
                        focusCorrelationFromTimeline(null);
                      }
                    }}
                    sx={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      px: 0.6,
                      py: 0.05,
                      borderRadius: 999,
                      bgcolor: "hsl(var(--warning, 38 92% 50%) / 0.15)",
                      color: "hsl(38 92% 50%)",
                      border: "1px solid hsl(38 92% 50% / 0.4)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.35,
                      flexShrink: 0,
                      "&:hover": { bgcolor: "hsl(38 92% 50% / 0.22)" },
                    }}
                  >
                    <LinkIcon size={10} />
                    {item.corrCount}
                  </Typography>
                </Tooltip>
              )}

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  ml: "auto",
                  flexShrink: 0,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    color: "text.disabled",
                    pl: 0.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.timestamp ? formatCompactTime(item.timestamp) : ""}
                </Typography>
                {replyButtonCompact}
              </Box>
            </Box>

            {/* Row 2: Detail / Content (if any) */}
            {item.kind === "observable-added" &&
            item.obsType &&
            item.obsValue ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  width: "100%",
                  minWidth: 0,
                  pl: 2.25,
                  mt: 0.25,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    px: 0.6,
                    py: 0.05,
                    borderRadius: 999,
                    bgcolor: "hsl(var(--muted) / 0.6)",
                    color: "text.secondary",
                    border: "1px solid hsl(var(--border-subtle))",
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: "center",
                  }}
                >
                  {item.obsType}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontFamily: "monospace",
                    color: isIocPill
                      ? "hsl(var(--destructive))"
                      : "text.primary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    flex: 1,
                  }}
                  title={item.obsValue}
                >
                  {item.obsValue}
                </Typography>
              </Box>
            ) : item.kind === "attribute-changed" ? (
              <Box sx={{ width: "100%", minWidth: 0, pl: 2.25, mt: 0.25 }}>
                {item.attrField === "severity" ? (
                  <TimelineSeverityDropdown
                    value={String(item.attrAfter || "medium")}
                    onChange={(newSev) => {
                      autoProgressStatus();
                      setEditedSeverity(newSev);
                    }}
                    disabled={isPublicView}
                  />
                ) : item.attrField === "status" ? (
                  <TimelineStatusDropdown
                    value={String(item.attrAfter || "new")}
                    onChange={(newStatus) => {
                      setEditedStatus(newStatus);
                    }}
                    onResolveRequest={() => setShowResolveDialog(true)}
                    disabled={isPublicView}
                  />
                ) : item.attrField === "labels" ? (
                  <TimelineTagsEditor
                    tags={Array.isArray(item.attrAfter) ? item.attrAfter : []}
                    addedTags={item.addedTags}
                    removedTags={item.removedTags}
                    onAddTag={(tag) => {
                      autoProgressStatus();
                      if (!editedLabels.includes(tag)) {
                        setEditedLabels([...editedLabels, tag]);
                      }
                    }}
                    onDeleteTag={(tag) => {
                      autoProgressStatus();
                      setEditedLabels(editedLabels.filter((t) => t !== tag));
                    }}
                    disabled={isPublicView}
                  />
                ) : item.attrField === "assignee" ? (
                  <TimelineAssigneeDropdown
                    value={String(item.attrAfter || "")}
                    onChange={(newAssignee) => {
                      autoProgressStatus();
                      setEditedAssignee(newAssignee);
                    }}
                    disabled={isPublicView}
                  />
                ) : item.attrField === "tlp" ? (
                  <TimelineTlpDropdown
                    value={String(item.attrAfter || editedTlp || "TLP:AMBER")}
                    onChange={(newTlp) => {
                      autoProgressStatus();
                      setEditedTlp(newTlp);
                    }}
                    disabled={isPublicView}
                  />
                ) : (
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: isIocPill
                        ? "hsl(var(--destructive))"
                        : "hsl(var(--foreground))",
                      lineHeight: 1.4,
                      minWidth: 0,
                      ...timelineClampSingleLineSx,
                    }}
                    title={item.detail || String(item.attrAfter || "")}
                  >
                    {item.detail || String(item.attrAfter || "")}
                  </Typography>
                )}
              </Box>
            ) : item.detail ? (
              item.taskId &&
              (item.kind === "task-created" ||
                item.kind === "task-completed" ||
                item.kind === "task-status-changed") ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 0.5,
                    width: "100%",
                    minWidth: 0,
                    pl: 2.25,
                    mt: 0.25,
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={isTaskCompleted}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const targetId = matchingTask
                        ? String(matchingTask.id)
                        : item.taskId || "";
                      if (targetId) handleToggleTask(targetId);
                    }}
                    icon={<SquareIcon size={16} />}
                    checkedIcon={<CheckSquareIcon size={16} />}
                    sx={{
                      p: 0,
                      mt: -0.1,
                      color: "hsl(var(--muted-foreground))",
                      "&.Mui-checked": {
                        color: "hsl(var(--muted-foreground))",
                      },
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: isIocPill
                        ? "hsl(var(--destructive))"
                        : "hsl(var(--foreground))",
                      lineHeight: 1.4,
                      minWidth: 0,
                      flex: 1,
                      textDecoration: isTaskCompleted ? "line-through" : "none",
                      ...timelineClampSingleLineSx,
                    }}
                    title={item.detail}
                  >
                    {item.detail}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ width: "100%", minWidth: 0, pl: 2.25, mt: 0.25 }}>
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: isIocPill
                        ? "hsl(var(--destructive))"
                        : "hsl(var(--foreground))",
                      lineHeight: 1.4,
                      minWidth: 0,
                      ...timelineClampSingleLineSx,
                    }}
                    title={item.detail}
                  >
                    {item.detail}
                  </Typography>
                </Box>
              )
            ) : null}
          </Box>
        ) : (
          <Box
            key={item.id}
            data-timeline-compact="true"
            data-timeline-key={itemKey}
            data-timeline-timestamp={item.timestamp}
            data-timeline-filter={itemFilterKey || ""}
            data-timeline-highlighted={isHighlighted ? "true" : undefined}
            data-timeline-dimmed={isDimmed ? "true" : undefined}
            data-timeline-preview={item.isPreview ? "true" : undefined}
            data-tour={isIocPill ? "timeline-ioc-pill" : undefined}
            data-ioc-pill={isIocPill ? "true" : undefined}
            className={[
              "timeline-hover-row",
              isStepHighlighted ? "incident-new-flash" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={pillOnClick}
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "nowrap",
              gap: 1,
              px: isHighlighted ? 0.75 : 1.25,
              py: 0.5,
              ml: 0.5,
              borderRadius: 999,
              bgcolor: isHighlighted ? "hsl(var(--primary) / 0.12)" : pillBg,
              border: isHighlighted
                ? item.isPreview
                  ? "1px dashed #ff6600"
                  : "1px solid #ff6600"
                : `1px solid ${pillBorder}`,
              boxShadow: isHighlighted
                ? "0 0 12px rgba(255, 102, 0, 0.25)"
                : "none",
              opacity: isDimmed ? 0.35 : 1,
              maxWidth: "100%",
              minWidth: 0,
              overflow: "hidden",
              cursor: isClickable ? "pointer" : "default",
              transition:
                "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
              "&:hover": {
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.18)"
                  : isClickable
                    ? pillBgHover
                    : undefined,
                borderColor: isHighlighted
                  ? "#ff6600"
                  : isClickable
                    ? pillBorderHover
                    : undefined,
              },
              "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                {
                  opacity: 1,
                  pointerEvents: "auto",
                },
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                color: pillColor,
                flexShrink: 0,
              }}
            >
              {isIocPill ? <WarningAmberIcon size={12} /> : cfg.icon}
            </Box>
            {item.label && item.kind !== "observable-added" && (
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: pillColor,
                  flexShrink: 1,
                  minWidth: 0,
                  ...timelineClampSingleLineSx,
                }}
              >
                {stepVerbLabel(item.label, !!item.actor)}
              </Typography>
            )}
            {previewBadge}
            {isIocPill && (
              <Typography
                sx={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  px: 0.6,
                  py: 0.05,
                  borderRadius: 999,
                  bgcolor: "hsl(var(--destructive) / 0.15)",
                  color: "hsl(var(--destructive))",
                  border: "1px solid hsl(var(--destructive) / 0.4)",
                }}
              >
                IOC
              </Typography>
            )}
            {isIocPill && isClickable && variant === "inline" && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.4,
                  ml: "auto",
                  pl: 0.5,
                  flexShrink: 0,
                }}
              >
                <AgentIcon size={12} />
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    color: "hsl(var(--destructive))",
                    whiteSpace: "nowrap",
                  }}
                >
                  Ask agent →
                </Typography>
              </Box>
            )}
            {item.kind === "observable-added" &&
            item.obsType &&
            item.obsValue ? (
              <>
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    px: 0.6,
                    py: 0.05,
                    borderRadius: 999,
                    bgcolor: "hsl(var(--muted) / 0.6)",
                    color: "text.secondary",
                    border: "1px solid hsl(var(--border-subtle))",
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: "center",
                  }}
                >
                  {item.obsType}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontFamily: "monospace",
                    color: isIocPill
                      ? "hsl(var(--destructive))"
                      : "text.primary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    flex: "1 1 auto",
                  }}
                  title={item.obsValue}
                >
                  {item.obsValue}
                </Typography>
              </>
            ) : item.kind === "attribute-changed" ? (
              item.attrField === "severity" ? (
                <TimelineSeverityDropdown
                  value={String(item.attrAfter || "medium")}
                  onChange={(newSev) => {
                    autoProgressStatus();
                    setEditedSeverity(newSev);
                  }}
                  disabled={isPublicView}
                />
              ) : item.attrField === "status" ? (
                <TimelineStatusDropdown
                  value={String(item.attrAfter || "new")}
                  onChange={(newStatus) => {
                    setEditedStatus(newStatus);
                  }}
                  onResolveRequest={() => setShowResolveDialog(true)}
                  disabled={isPublicView}
                />
              ) : item.attrField === "labels" ? (
                <TimelineTagsEditor
                  tags={Array.isArray(item.attrAfter) ? item.attrAfter : []}
                  addedTags={item.addedTags}
                  removedTags={item.removedTags}
                  onAddTag={(tag) => {
                    autoProgressStatus();
                    if (!editedLabels.includes(tag)) {
                      setEditedLabels([...editedLabels, tag]);
                    }
                  }}
                  onDeleteTag={(tag) => {
                    autoProgressStatus();
                    setEditedLabels(editedLabels.filter((t) => t !== tag));
                  }}
                  disabled={isPublicView}
                />
              ) : item.attrField === "assignee" ? (
                <TimelineAssigneeDropdown
                  value={String(item.attrAfter || "")}
                  onChange={(newAssignee) => {
                    autoProgressStatus();
                    setEditedAssignee(newAssignee);
                  }}
                  disabled={isPublicView}
                />
              ) : item.attrField === "tlp" ? (
                <TimelineTlpDropdown
                  value={String(item.attrAfter || editedTlp || "TLP:AMBER")}
                  onChange={(newTlp) => {
                    autoProgressStatus();
                    setEditedTlp(newTlp);
                  }}
                  disabled={isPublicView}
                />
              ) : (
                item.detail && (
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      color: isIocPill
                        ? "hsl(var(--destructive))"
                        : "text.secondary",
                      lineHeight: 1.4,
                      minWidth: 0,
                      flex: "1 1 auto",
                      ...timelineClampSingleLineSx,
                    }}
                    title={item.detail}
                  >
                    {item.detail}
                  </Typography>
                )
              )
            ) : (
              item.detail && (
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    color: isIocPill
                      ? "hsl(var(--destructive))"
                      : "text.secondary",
                    lineHeight: 1.4,
                    minWidth: 0,
                    flex: "1 1 auto",
                    ...timelineClampSingleLineSx,
                  }}
                  title={item.detail}
                >
                  {item.detail}
                </Typography>
              )
            )}
            {item.taskStatusLabel && (
              <Typography
                component="span"
                sx={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  px: 0.6,
                  py: 0.05,
                  ml: "auto",
                  borderRadius: 999,
                  bgcolor: "hsl(var(--muted) / 0.6)",
                  color: "text.secondary",
                  border: "1px solid hsl(var(--border-subtle))",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {item.taskStatusLabel}
              </Typography>
            )}
            {item.kind === "observable-added" && !!item.corrCount && (
              <Tooltip
                title={`${item.corrCount} correlation match${item.corrCount === 1 ? "" : "es"} — click to view`}
                arrow
              >
                <Typography
                  component="span"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (item.corrObsKeys && item.corrObsKeys.length === 1) {
                      focusObservableFromTimeline(item.corrObsKeys[0]);
                    } else {
                      focusCorrelationFromTimeline(null);
                    }
                  }}
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    px: 0.6,
                    py: 0.05,
                    borderRadius: 999,
                    bgcolor: "hsl(var(--warning, 38 92% 50%) / 0.15)",
                    color: "hsl(38 92% 50%)",
                    border: "1px solid hsl(38 92% 50% / 0.4)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.35,
                    "&:hover": { bgcolor: "hsl(38 92% 50% / 0.22)" },
                  }}
                >
                  <LinkIcon size={10} />
                  {item.corrCount}
                </Typography>
              </Tooltip>
            )}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                ml: "auto",
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.65rem",
                  color: "text.disabled",
                  pl: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {item.timestamp ? formatRelativeTime(item.timestamp) : ""}
              </Typography>
              {replyButtonCompact}
            </Box>
          </Box>
        );

        if (sparseIncidentRefs.length === 0) return pill;
        return (
          <Box
            key={item.id}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              minWidth: 0,
            }}
          >
            {pill}
            <Box
              sx={{
                ml: { xs: 0, sm: 3 },
                mr: { xs: 0, sm: 0.5 },
                px: 1.25,
                py: 0.75,
                borderRadius: 1.5,
                border: `1px dashed ${pillBorder}`,
                bgcolor: "transparent",
              }}
            >
              <CorrelationContextStrip
                incidentKeys={sparseIncidentRefs}
                compact
              />
            </Box>
          </Box>
        );
      }

      // Manual activity
      const actItem = item.data;
      const isOwnMessage = actItem.user === currentUsername;
      const messageAge = Date.now() - actItem.timestamp;
      const isDeleted = !!actItem.deleted;
      const isStatusActivity = actItem.type === "status";
      const canDelete =
        !isDeleted &&
        isOwnMessage &&
        actItem.type === "comment" &&
        messageAge < 5 * 60 * 1000;
      const timeRemaining = Math.max(
        0,
        Math.ceil((5 * 60 * 1000 - messageAge) / 60000),
      );

      // Status activities are system-generated resolution events.
      // Rendered with native resolution status dropdown and details.
      if (isStatusActivity) {
        const currentSeverity = (
          editedSeverity ||
          incident?.severity ||
          "medium"
        ).toLowerCase();
        const sevColor =
          severityColors[currentSeverity] ||
          `hsl(var(--severity-${currentSeverity}, var(--severity-medium)))`;

        const contentRaw = decodeHtmlEntities(actItem.content || "");
        let resReason: string | undefined;
        let resNotes: string | undefined;
        const resMatch = contentRaw.match(
          /^Resolved:\s*([^-]+)(?:\s*-\s*(.*))?$/i,
        );
        if (resMatch) {
          resReason = resMatch[1]?.trim();
          resNotes = resMatch[2]?.trim();
        } else if (contentRaw) {
          resNotes = contentRaw;
        }

        if (isSimple) {
          return (
            <Box
              key={itemKey}
              id={actItem.id ? `activity-item-${actItem.id}` : undefined}
              data-timeline-key={itemKey}
              data-timeline-timestamp={item.timestamp}
              data-timeline-filter="manual"
              data-timeline-highlighted={isHighlighted ? "true" : undefined}
              data-timeline-dimmed={isDimmed ? "true" : undefined}
              data-timeline-preview={item.isPreview ? "true" : undefined}
              className={[
                "timeline-hover-row",
                !!actItem.id && newlyArrivedActivity.has(actItem.id)
                  ? "incident-new-flash"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                px: isHighlighted ? 0.75 : 0,
                py: 1,
                mt: 3,
                mb: 3,
                borderRadius: isHighlighted ? 1.5 : 0,
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.12)"
                  : "transparent",
                border: isHighlighted
                  ? item.isPreview
                    ? "1px dashed #ff6600"
                    : "1px solid #ff6600"
                  : "none",
                boxShadow: isHighlighted
                  ? "0 0 12px rgba(255, 102, 0, 0.25)"
                  : "none",
                opacity: isDimmed ? 0.35 : 1,
                transition:
                  "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
                "&:hover": {
                  bgcolor: isHighlighted
                    ? "hsl(var(--primary) / 0.18)"
                    : "transparent",
                },
                "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                  {
                    opacity: 1,
                    pointerEvents: "auto",
                  },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  flexWrap: "wrap",
                  width: "100%",
                }}
              >
                <CheckCircleIcon
                  size={14}
                  style={{ color: sevColor, flexShrink: 0 }}
                />
                <Typography
                  sx={{
                    fontSize: "0.73rem",
                    fontWeight: 600,
                    color: "hsl(var(--foreground))",
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  Incident resolution
                </Typography>
                {previewBadge}
                <Chip
                  label="System event"
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: "0.58rem",
                    fontWeight: 600,
                    bgcolor: "transparent",
                    border: "1px solid hsl(var(--border-subtle))",
                    color: "text.secondary",
                    "& .MuiChip-label": { px: 0.6 },
                  }}
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    ml: "auto",
                  }}
                >
                  {actItem.user && (
                    <UserHoverCard username={actItem.user} maxChars={12} />
                  )}
                  <Typography
                    sx={{ fontSize: "0.6rem", color: "text.disabled" }}
                  >
                    {formatCompactTime(actItem.timestamp)}
                  </Typography>
                  {replyButtonCompact}
                </Box>
              </Box>
              <Box sx={{ mt: 0.5, pl: 0 }}>
                <TimelineStatusDropdown
                  value="resolved"
                  onChange={(newStatus) => setEditedStatus(newStatus)}
                  onResolveRequest={() => setShowResolveDialog(true)}
                  resolutionReason={resReason}
                  resolutionNotes={resNotes}
                  disabled={isPublicView}
                />
              </Box>
            </Box>
          );
        }

        return (
          <Box
            key={itemKey}
            id={actItem.id ? `activity-item-${actItem.id}` : undefined}
            data-timeline-key={itemKey}
            data-timeline-timestamp={item.timestamp}
            data-timeline-filter="manual"
            data-timeline-highlighted={isHighlighted ? "true" : undefined}
            data-timeline-dimmed={isDimmed ? "true" : undefined}
            data-timeline-preview={item.isPreview ? "true" : undefined}
            className={[
              "timeline-hover-row",
              !!actItem.id && newlyArrivedActivity.has(actItem.id)
                ? "incident-new-flash"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              bgcolor: isHighlighted
                ? "hsl(var(--primary) / 0.12)"
                : "transparent",
              border: isHighlighted
                ? item.isPreview
                  ? "1px dashed #ff6600"
                  : "1px solid #ff6600"
                : "1px solid hsl(var(--border-subtle))",
              boxShadow: isHighlighted
                ? "0 0 12px rgba(255, 102, 0, 0.25)"
                : "none",
              opacity: isDimmed ? 0.35 : 1,
              mb: 0,
              transition:
                "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
              "&:hover": {
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.18)"
                  : "hsl(var(--muted) / 0.4)",
                borderColor: isHighlighted ? "#ff6600" : "hsl(var(--border))",
              },
              "&:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
                {
                  opacity: 1,
                  pointerEvents: "auto",
                },
            }}
          >
            <Avatar
              sx={{
                width: 22,
                height: 22,
                bgcolor: "hsl(var(--muted) / 0.6)",
                color: sevColor,
              }}
            >
              <CheckCircleIcon size={14} style={{ color: sevColor }} />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.73rem",
                    fontWeight: 600,
                    color: "hsl(var(--foreground))",
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  Incident resolution
                </Typography>
                {previewBadge}
                <Chip
                  label="System event"
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: "0.58rem",
                    fontWeight: 600,
                    bgcolor: "transparent",
                    border: "1px solid hsl(var(--border-subtle))",
                    color: "text.secondary",
                    "& .MuiChip-label": { px: 0.6 },
                  }}
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    ml: "auto",
                  }}
                >
                  {actItem.user && (
                    <UserHoverCard username={actItem.user} maxChars={24} />
                  )}
                  <Typography
                    sx={{ fontSize: "0.65rem", color: "text.disabled" }}
                  >
                    {formatRelativeTime(actItem.timestamp)}
                  </Typography>
                  {replyButtonCompact}
                </Box>
              </Box>
              <Box sx={{ mt: 0.5 }}>
                <TimelineStatusDropdown
                  value="resolved"
                  onChange={(newStatus) => setEditedStatus(newStatus)}
                  onResolveRequest={() => setShowResolveDialog(true)}
                  resolutionReason={resReason}
                  resolutionNotes={resNotes}
                  disabled={isPublicView}
                />
              </Box>
            </Box>
          </Box>
        );
      }

      const isActHighlighted =
        !!actItem.id && newlyArrivedActivity.has(actItem.id);
      // Merge/threading audit entries — clicking them jumps to the
      // Correlations tab and flashes the matching linked incident row.
      const mergeInMatch =
        typeof actItem.id === "string"
          ? actItem.id.match(/^merge-in-(.+)-(\d+)$/)
          : null;
      const mergeSourceIdFromId = mergeInMatch ? mergeInMatch[1] : null;
      const isMergeItem =
        (actItem.type as string) === "system" &&
        typeof actItem.id === "string" &&
        (actItem.id.startsWith("merge-in-") || actItem.id.startsWith("merge-"));
      // In the narrow simple timeline the avatar sits on the header row and
      // the message text uses the full column width underneath it, instead of
      // being squeezed into a column beside the avatar.
      const avatarNode = (() => {
        const avatarInfo = resolveUserAvatar(
          actItem.user,
          users,
          (actItem as any).is_agent === true,
        );
        return (
          <Avatar
            src={!isDeleted && avatarInfo.src ? avatarInfo.src : undefined}
            sx={{
              width: isSimple ? 20 : 24,
              height: isSimple ? 20 : 24,
              flexShrink: 0,
              bgcolor: isDeleted
                ? "hsl(var(--border-subtle))"
                : isSimple
                  ? "hsl(var(--muted) / 0.6)"
                  : actItem.type === "comment"
                    ? "rgba(255, 102, 0, 0.2)"
                    : "rgba(255,255,255,0.08)",
            }}
          >
            {getActivityIcon(actItem.type)}
          </Avatar>
        );
      })();

      return (
        <Box
          key={itemKey}
          id={actItem.id ? `activity-item-${actItem.id}` : undefined}
          data-timeline-key={itemKey}
          data-timeline-timestamp={item.timestamp}
          data-timeline-filter={itemFilterKey || ""}
          data-timeline-highlighted={isHighlighted ? "true" : undefined}
          data-timeline-dimmed={isDimmed ? "true" : undefined}
          data-timeline-preview={item.isPreview ? "true" : undefined}
          className={isActHighlighted ? "incident-new-flash" : undefined}
          onClick={
            isMergeItem
              ? () => focusRelatedIncident(mergeSourceIdFromId)
              : undefined
          }
          sx={{
            display: "flex",
            flexDirection: isSimple ? "column" : "row",
            gap: isSimple ? 0.5 : 1.5,
            px: isSimple ? (isHighlighted ? 0.75 : 0.5) : 1.5,
            py: isSimple ? 0.75 : 1.75,
            borderRadius: 1.5,
            bgcolor: isHighlighted
              ? "hsl(var(--primary) / 0.12)"
              : isDeleted
                ? "hsl(var(--muted) / 0.3)"
                : isSimple
                  ? "transparent"
                  : actItem.type === "comment"
                    ? "rgba(255, 102, 0, 0.05)"
                    : "hsl(var(--muted) / 0.5)",
            border: isHighlighted
              ? item.isPreview
                ? "1px dashed #ff6600"
                : "1px solid #ff6600"
              : isSimple
                ? "none"
                : "1px solid",
            borderColor: isHighlighted
              ? "#ff6600"
              : isSimple
                ? "transparent"
                : isDeleted
                  ? "hsl(var(--border-subtle))"
                  : actItem.type === "comment"
                    ? "rgba(255, 102, 0, 0.1)"
                    : "hsl(var(--border-subtle))",
            boxShadow: isHighlighted
              ? "0 0 12px rgba(255, 102, 0, 0.25)"
              : "none",
            mb: isSimple ? 1.5 : 0,
            position: "relative",
            opacity: isDimmed ? 0.35 : isDeleted ? 0.7 : 1,
            cursor: isMergeItem ? "pointer" : "default",
            transition:
              "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
            ...(isMergeItem && {
              "&:hover": {
                bgcolor: isHighlighted
                  ? "hsl(var(--primary) / 0.18)"
                  : "hsl(var(--muted) / 0.75)",
                borderColor: isHighlighted
                  ? "#ff6600"
                  : "hsl(var(--primary) / 0.4)",
              },
            }),
            "&:hover .delete-btn": { opacity: 1 },
            "&:hover .reply-btn, &:focus-within .reply-btn, &:hover .timeline-reply-btn, &:focus-within .timeline-reply-btn":
              { opacity: 1, pointerEvents: "auto" },
          }}
        >
          {!isSimple && avatarNode}
          <Box
            sx={{
              flex: isSimple ? "none" : 1,
              width: isSimple ? "100%" : undefined,
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: isSimple ? 0.75 : 1,
                mb: 0.25,
              }}
            >
              {isSimple && avatarNode}
              <UserHoverCard
                username={actItem.user}
                isAgent={(actItem as any).is_agent === true}
                maxChars={isSimple ? 12 : undefined}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  fontSize: isSimple ? "0.6rem" : "0.65rem",
                }}
              >
                {isSimple
                  ? formatCompactTime(actItem.timestamp)
                  : formatRelativeTime(actItem.timestamp)}
              </Typography>
              {previewBadge}
              {isReply && actItem.replyToLabel && (
                <Chip
                  icon={<ReplyIcon size={11} />}
                  label={actItem.replyToLabel}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 18,
                    fontSize: "0.6rem",
                    bgcolor: "transparent",
                    borderColor: isSimple
                      ? "hsl(var(--border-subtle))"
                      : "rgba(255, 102, 0, 0.3)",
                    color: "text.secondary",
                    "& .MuiChip-icon": {
                      color: isSimple
                        ? "hsl(var(--muted-foreground))"
                        : "#ff6600",
                      ml: 0.5,
                    },
                  }}
                />
              )}
            </Box>
            {isDeleted ? (
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.8rem",
                  color: "text.disabled",
                  fontStyle: "italic",
                }}
              >
                Comment deleted
              </Typography>
            ) : (
              <>
                <CollapsibleContent
                  maxHeight={240}
                  storageKey={`incident-comment-expand::${rawId || ""}::${actItem.id || ""}`}
                >
                  <MentionText
                    text={(() => {
                      const raw = actItem.content || "";
                      const decoded = /<[a-z][\s\S]*>/i.test(raw)
                        ? htmlToPlainText(raw).trim()
                        : decodeHtmlEntities(raw);
                      // Hide the auto-attached agent context block from the user.
                      // The block is still in the persisted message for the agent.
                      return stripAgentContextBlock(decoded);
                    })()}
                    sx={{
                      fontSize: "0.8rem",
                      color: "text.secondary",
                      whiteSpace: "pre-wrap",
                    }}
                  />
                  {actItem.attachments && actItem.attachments.length > 0 && (
                    <Box
                      sx={{
                        mt: 1,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                      }}
                    >
                      {actItem.attachments.map((att, ai) => (
                        <Chip
                          key={ai}
                          label={att.filename}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontSize: "0.65rem",
                            bgcolor: "transparent",
                            borderColor: "rgba(59, 130, 246, 0.4)",
                            color: "#3b82f6",
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </CollapsibleContent>
              </>
            )}
          </Box>
          {!isDeleted && (
            <Box
              className="reply-btn"
              sx={{
                position: "absolute",
                top: 4,
                right: canDelete ? 28 : 4,
                opacity: replyingTo?.id === itemKey ? 1 : 0,
                pointerEvents: replyingTo?.id === itemKey ? "auto" : "none",
                transition: "opacity 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              {actItem.ai_handled === true && userInfo?.support === true && (
                <Tooltip
                  title="Support: ai_handled=true on this comment (the workflow has finished processing it)"
                  arrow
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      bgcolor: "rgba(156, 90, 242, 0.12)",
                    }}
                  >
                    <AgentIcon size={12} />
                  </Box>
                </Tooltip>
              )}
              {replyButton}
            </Box>
          )}
          {canDelete && (
            <Tooltip title={`Delete (${timeRemaining}m left)`} arrow>
              <IconButton
                className="delete-btn"
                size="small"
                onClick={() => setCommentToDelete(actItem.id)}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 20,
                  height: 20,
                  opacity: 0,
                  transition: "opacity 0.2s",
                  bgcolor: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  "&:hover": { bgcolor: "rgba(239, 68, 68, 0.2)" },
                }}
              >
                <DeleteIcon size={12} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      );
    };

    // Render top-level items, threading replies indented underneath. The
    // indent + left rail visually groups the conversation while keeping the
    // outer chronology intact. Threads are recursive — replies-to-replies
    // nest at deeper indent levels.

    // Window during which we keep showing the "AI Agent is responding…" card
    // for an unanswered ai_handled comment. After this we swap to a timed-out
    // indicator so users know the agent didn't get back to them.
    const AI_RESPONSE_TIMEOUT_MS = 2 * 60 * 1000;

    // Reruns the AI Agent for a comment that previously timed out.
    // We keep ai_handled=true (so the agent placeholder stays visible) and
    // append a fresh entry to `rerun_timestamps`. The age used by the
    // loader/timeout logic is derived from the latest rerun timestamp, so
    // the spinner immediately resumes for another full timeout window.
    // Background automation watches `rerun_timestamps` to pick the comment
    // back up — see the assign_escalate workflow.
    const handleRerunAgent = async (commentId: string) => {
      if (!incident?.id || !incident.rawOCSF) return;
      const now = Date.now();

      // Set `ai_handled: false` and append a fresh entry to `rerun_timestamps`.
      // The backend automation ("Assign & Escalate") watches for this and is
      // responsible for flipping `ai_handled` back to `true` once it picks the
      // comment up — we MUST NOT do that flip from the client.
      // The placeholder/timeout logic uses the latest rerun timestamp as the
      // "age" basis, so the spinner immediately resumes for another full
      // timeout window.
      const updatedActivity = activity.map((a) => {
        if (a.id !== commentId) return a;
        const existing = Array.isArray((a as any).rerun_timestamps)
          ? ((a as any).rerun_timestamps as number[])
          : [];
        return {
          ...a,
          ai_handled: false,
          rerun_timestamps: [...existing, now],
        } as ActivityItem;
      });
      setActivity(updatedActivity);
      setAiPlaceholderTick((t) => t + 1);

      try {
        pendingSaveRef.current = true;
        await writeIncidentSafe(
          incident.id,
          { ...incident.rawOCSF, activity: updatedActivity },
          crossOrgId || undefined,
        );
        toast.success("Re-running AI Agent");
        if (isDemoActive()) {
          const targetComment = activity.find((a) => a.id === commentId);
          void handleDemoAgentComment(
            incident.id,
            targetComment?.content || "",
            commentId,
          );
        }
      } catch (err) {
        console.error("[Rerun] Failed to persist rerun:", err);
        toast.error("Failed to re-run AI Agent");
      } finally {
        pendingSaveRef.current = false;
      }
    };

    // Renders a compact inline indicator beneath any activity item that
    // explicitly @-mentions the AI Agent and is still flagged ai_handled.
    // While waiting we show a small spinning loader; once the 2-minute
    // timeout has elapsed we show a muted "timed out" pill instead.
    // Read the agent's currently-enabled tools (set on the Agent Permissions
    // drawer). We surface up to 3 names inline so users can see exactly what
    // capabilities the agent has access to while it's responding. We
    // intentionally DO NOT fall back to a hardcoded demo list — surfacing
    // tool names that were never configured is misleading. If nothing is
    // assigned, we render the indicator without a tools summary.
    const enabledAgentTools: string[] = (() => {
      try {
        return getAssignedAgentTools().map((t) => t.name);
      } catch {
        return [];
      }
    })();
    const formatToolName = (name: string): string =>
      name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const buildToolsSummary = (): string => {
      if (enabledAgentTools.length === 0) return "";
      const display = enabledAgentTools.slice(0, 3).map(formatToolName);
      const remaining = enabledAgentTools.length - display.length;
      const list = display.join(", ");
      if (remaining > 0) return `${list} +${remaining} more`;
      return list;
    };
    const toolsSummary = buildToolsSummary();

    const formatRelativeShort = (ms: number): string => {
      if (!Number.isFinite(ms) || ms < 0) return "just now";
      if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
      return `${Math.floor(ms / 86_400_000)}d ago`;
    };
    // Timestamps in this codebase come from a mix of Unix-seconds (Go backend)
    // and Unix-millis (JS). Normalize to millis so "20642d ago" cannot happen.
    const normalizeTs = (ts: number | undefined | null): number => {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return 0;
      // Anything below year ~2001 in ms is clearly seconds — bump to ms.
      return n < 1e12 ? n * 1000 : n;
    };

    const renderAgentProcessingPlaceholder = (
      key: string,
      timedOut: boolean,
      commentId?: string,
      rerunCount: number = 0,
      lastActionTs: number = 0,
    ) => {
      const isAgentHighlighted = hoveredTimelineFilter === "agent";
      const isAgentDimmed =
        hoveredTimelineFilter !== null && !isAgentHighlighted;

      if (isSimple) {
        return (
          <Box
            key={`ai-processing-${key}`}
            data-timeline-filter="agent"
            data-timeline-highlighted={isAgentHighlighted ? "true" : undefined}
            data-timeline-dimmed={isAgentDimmed ? "true" : undefined}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              px: isAgentHighlighted ? 0.75 : 0,
              py: 0.25,
              borderRadius: isAgentHighlighted ? 1 : 0,
              bgcolor: isAgentHighlighted
                ? "hsl(var(--primary) / 0.12)"
                : "transparent",
              border: isAgentHighlighted ? "1px solid #ff6600" : "none",
              boxShadow: isAgentHighlighted
                ? "0 0 12px rgba(255, 102, 0, 0.25)"
                : "none",
              opacity: isAgentDimmed ? 0.35 : 1,
              transition:
                "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
              mb: 1.375,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  flexShrink: 0,
                  color: "text.secondary",
                }}
              >
                <AgentIcon size={13} />
              </Box>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "text.secondary",
                }}
              >
                AI Agent
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  color: "text.secondary",
                }}
              >
                {timedOut ? "did not respond" : "is responding"}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 0.75,
                pl: 1.25,
                fontSize: "0.75rem",
                color: "hsl(var(--foreground))",
                lineHeight: 1.4,
              }}
            >
              {timedOut ? (
                <>
                  <Tooltip
                    title="No agent run or reply arrived for this mention within the timeout window. The backend did not report an error — open the debug view to inspect the execution."
                    arrow
                  >
                    <span
                      style={{
                        borderBottom: "1px dotted hsl(var(--border))",
                        cursor: "help",
                      }}
                    >
                      No agent response
                    </span>
                  </Tooltip>
                  {(rerunCount > 0 || lastActionTs > 0) && (
                    <Box
                      component="span"
                      sx={{ color: "text.disabled", fontSize: "0.65rem" }}
                    >
                      {rerunCount > 0 &&
                        `· ${rerunCount} rerun${rerunCount === 1 ? "" : "s"}`}
                      {lastActionTs > 0 &&
                        ` · ${formatRelativeShort(Date.now() - normalizeTs(lastActionTs))}`}
                    </Box>
                  )}
                  <Box
                    component="button"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const latestRun: any = [
                        ...(allIncidentWorkflowRuns || []),
                      ].sort(
                        (a: any, b: any) =>
                          normalizeToMs(b?.started_at) -
                          normalizeToMs(a?.started_at),
                      )[0];
                      const execId = latestRun?.execution_id;
                      if (execId) {
                        window.dispatchEvent(
                          new CustomEvent("workflow-run:open", {
                            detail: {
                              executionId: String(execId),
                              workflowId:
                                latestRun?.workflow_id ||
                                latestRun?.workflow?.id ||
                                undefined,
                            },
                          }),
                        );
                      } else {
                        openAgentDrawer("run");
                      }
                    }}
                    sx={{
                      fontWeight: 500,
                      color: "text.secondary",
                      background: "transparent",
                      border: "none",
                      p: 0,
                      borderBottom: "1px dashed hsl(var(--border))",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      "&:hover": {
                        color: "hsl(var(--foreground))",
                        borderBottomColor: "hsl(var(--foreground))",
                      },
                    }}
                  >
                    Debug
                  </Box>
                  {commentId && (
                    <Box
                      component="button"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRerunAgent(commentId);
                      }}
                      sx={{
                        fontWeight: 500,
                        color: "text.secondary",
                        background: "transparent",
                        border: "none",
                        p: 0,
                        borderBottom: "1px dashed hsl(var(--border))",
                        cursor: "pointer",
                        fontSize: "0.72rem",
                        "&:hover": {
                          color: "hsl(var(--foreground))",
                          borderBottomColor: "hsl(var(--foreground))",
                        },
                      }}
                    >
                      Rerun
                    </Box>
                  )}
                </>
              ) : !agentReadiness.active && !agentReadiness.isLoading ? (
                <>
                  <span>AI Agent automation is off —</span>
                  <Box
                    component="button"
                    type="button"
                    disabled={agentReadiness.isEnabling}
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await agentReadiness.enable();
                        toast.success("AI Agent automation enabled");
                        if (commentId) {
                          try {
                            await handleRerunAgent(commentId);
                          } catch (rerr) {
                            console.warn(
                              "[AskAgent] Auto-rerun after enable failed:",
                              rerr,
                            );
                          }
                        }
                      } catch {
                        toast.error("Failed to enable AI Agent automation");
                      }
                    }}
                    sx={{
                      fontWeight: 500,
                      color: "text.secondary",
                      background: "transparent",
                      border: "none",
                      p: 0,
                      cursor: agentReadiness.isEnabling ? "default" : "pointer",
                      borderBottom: "1px dashed hsl(var(--border))",
                      fontSize: "0.72rem",
                      "&:hover": {
                        color: "hsl(var(--foreground))",
                        borderBottomColor: "hsl(var(--foreground))",
                      },
                    }}
                  >
                    {agentReadiness.isEnabling ? "Enabling…" : "Enable now"}
                  </Box>
                </>
              ) : toolsSummary ? (
                <>
                  <span>Processing using {toolsSummary}</span>
                </>
              ) : (
                <>
                  <span>Answering without tools</span>
                </>
              )}
            </Box>
          </Box>
        );
      }

      return (
        <Box
          key={`ai-processing-${key}`}
          data-timeline-filter="agent"
          data-timeline-highlighted={isAgentHighlighted ? "true" : undefined}
          data-timeline-dimmed={isAgentDimmed ? "true" : undefined}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            alignSelf: "flex-start",
            pl: 0.4,
            pr: 1,
            py: 0.4,
            borderRadius: 999,
            fontSize: "0.7rem",
            background: isAgentHighlighted
              ? "hsl(var(--primary) / 0.12)"
              : timedOut
                ? "hsl(var(--muted) / 0.4)"
                : "var(--agent-gradient-subtle)",
            border: "1px solid",
            borderColor: isAgentHighlighted
              ? "#ff6600"
              : timedOut
                ? "hsl(var(--border))"
                : "rgba(156, 90, 242, 0.35)",
            boxShadow: isAgentHighlighted
              ? "0 0 12px rgba(255, 102, 0, 0.25)"
              : "none",
            opacity: isAgentDimmed ? 0.35 : 1,
            transition:
              "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
            color: timedOut ? "text.secondary" : "text.primary",
            maxWidth: "100%",
          }}
        >
          {/* Left-side AI Agent badge — clickable, links to /agents. */}
          <Tooltip title="Open Agent activity" arrow disableInteractive>
            <Box
              component={Link}
              to="/agents"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open Agent activity"
              sx={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: "rgba(0, 0, 0, 0.25)",
                color: "inherit",
                textDecoration: "none",
                transition: "background 0.15s ease, transform 0.15s ease",
                "&:hover": {
                  background: "rgba(0, 0, 0, 0.4)",
                  transform: "scale(1.05)",
                },
              }}
            >
              <AgentIcon size={11} style={{ opacity: timedOut ? 0.7 : 1 }} />
            </Box>
          </Tooltip>
          {!timedOut && agentReadiness.active && (
            <CircularProgress
              size={10}
              thickness={6}
              sx={{ color: "rgba(156, 90, 242, 0.9)", flexShrink: 0 }}
            />
          )}
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.7rem",
              fontWeight: 500,
              color: "inherit",
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 0,
            }}
          >
            {timedOut ? (
              <>
                {/* This state is INFERRED: no agent run and no agent reply have
                    landed for this mention within the timeout window. It does
                    not mean the backend reported a timeout, so always offer a
                    way to inspect the underlying execution. */}
                <Tooltip
                  title="No agent run or reply arrived for this mention within the timeout window. The backend did not report an error — open the debug view to inspect the execution."
                  arrow
                >
                  <span
                    style={{
                      borderBottom: "1px dotted hsl(var(--border))",
                      cursor: "help",
                    }}
                  >
                    No agent response
                  </span>
                </Tooltip>
                {(rerunCount > 0 || lastActionTs > 0) && (
                  <Box
                    component="span"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 400,
                      fontSize: "0.65rem",
                    }}
                  >
                    {rerunCount > 0 &&
                      `· ${rerunCount} rerun${rerunCount === 1 ? "" : "s"}`}
                    {lastActionTs > 0 &&
                      ` · ${formatRelativeShort(Date.now() - normalizeTs(lastActionTs))}`}
                  </Box>
                )}
                <Box
                  component="button"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Prefer the actual execution when one exists — that is the
                    // only place the real failure/latency is visible. Fall back
                    // to the agent sidebar when nothing was ever recorded.
                    const latestRun: any = [
                      ...(allIncidentWorkflowRuns || []),
                    ].sort(
                      (a: any, b: any) =>
                        normalizeToMs(b?.started_at) -
                        normalizeToMs(a?.started_at),
                    )[0];
                    const execId = latestRun?.execution_id;
                    if (execId) {
                      window.dispatchEvent(
                        new CustomEvent("workflow-run:open", {
                          detail: {
                            executionId: String(execId),
                            workflowId:
                              latestRun?.workflow_id ||
                              latestRun?.workflow?.id ||
                              undefined,
                          },
                        }),
                      );
                    } else {
                      openAgentDrawer("run");
                    }
                  }}
                  sx={{
                    ml: 0.5,
                    fontWeight: 600,
                    color: "rgba(236, 81, 124, 0.95)",
                    background: "transparent",
                    border: "none",
                    p: 0,
                    borderBottom: "1px dashed rgba(236, 81, 124, 0.5)",
                    cursor: "pointer",
                    "&:hover": {
                      color: "rgba(236, 81, 124, 1)",
                      borderBottomColor: "rgba(236, 81, 124, 0.9)",
                    },
                  }}
                >
                  Debug
                </Box>
              </>
            ) : !agentReadiness.active && !agentReadiness.isLoading ? (
              <>
                <span>AI Agent automation is off —</span>
                <Box
                  component="button"
                  type="button"
                  disabled={agentReadiness.isEnabling}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await agentReadiness.enable();
                      toast.success("AI Agent automation enabled");
                      // The original @AIAgent comment was posted while the
                      // automation was off, so the backend never picked it up.
                      // Nudge the activity item (append a rerun_timestamp) so
                      // the now-active "Run workflow" automation fires for it.
                      if (commentId) {
                        try {
                          await handleRerunAgent(commentId);
                        } catch (rerr) {
                          console.warn(
                            "[AskAgent] Auto-rerun after enable failed:",
                            rerr,
                          );
                        }
                      }
                    } catch {
                      toast.error("Failed to enable AI Agent automation");
                    }
                  }}
                  sx={{
                    fontWeight: 600,
                    color: "rgba(236, 81, 124, 0.95)",
                    background: "transparent",
                    border: "none",
                    p: 0,
                    cursor: agentReadiness.isEnabling ? "default" : "pointer",
                    borderBottom: "1px dashed rgba(236, 81, 124, 0.5)",
                    "&:hover": {
                      color: "rgba(236, 81, 124, 1)",
                      borderBottomColor: "rgba(236, 81, 124, 0.9)",
                    },
                  }}
                >
                  {agentReadiness.isEnabling ? "Enabling…" : "Enable now"}
                </Box>
              </>
            ) : toolsSummary ? (
              <>
                <span>Processing using the tools</span>
                <Tooltip
                  title={`${enabledAgentTools.map(formatToolName).join(", ")} — click to manage`}
                  arrow
                  disableInteractive
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAgentDrawer("permissions");
                    }}
                    sx={{
                      fontWeight: 600,
                      color: "rgba(236, 81, 124, 0.95)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 220,
                      background: "transparent",
                      border: "none",
                      p: 0,
                      borderBottom: "1px dashed rgba(236, 81, 124, 0.5)",
                      cursor: "pointer",
                      "&:hover": {
                        color: "rgba(236, 81, 124, 1)",
                        borderBottomColor: "rgba(236, 81, 124, 0.9)",
                      },
                    }}
                  >
                    {toolsSummary}
                  </Box>
                </Tooltip>
              </>
            ) : (
              <>
                <span>Answering without tools — limited capability.</span>
                <span style={{ marginLeft: 4 }} />
                <Box
                  component="button"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAgentDrawer("permissions", { openToolPicker: true });
                  }}
                  sx={{
                    fontWeight: 600,
                    color: "rgba(236, 81, 124, 0.95)",
                    background: "transparent",
                    border: "none",
                    p: 0,
                    borderBottom: "1px dashed rgba(236, 81, 124, 0.5)",
                    cursor: "pointer",
                    "&:hover": {
                      color: "rgba(236, 81, 124, 1)",
                      borderBottomColor: "rgba(236, 81, 124, 0.9)",
                    },
                  }}
                >
                  Assign tools
                </Box>
              </>
            )}
          </Typography>
          {timedOut && commentId && (
            <Box
              component="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRerunAgent(commentId);
              }}
              sx={{
                ml: 0.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 0.25,
                px: 0.75,
                py: 0.2,
                borderRadius: 999,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
                color: "text.primary",
                fontSize: "0.68rem",
                fontWeight: 500,
                cursor: "pointer",
                lineHeight: 1,
                transition: "background 0.15s ease, border-color 0.15s ease",
                "&:hover": {
                  background: "hsl(var(--muted) / 0.6)",
                  borderColor: "rgba(156, 90, 242, 0.5)",
                },
              }}
              aria-label="Rerun AI Agent"
            >
              <RefreshIcon size={11} />
              Rerun
            </Box>
          )}
        </Box>
      );
    };

    // Standardised "indicator check running" pill — same shape/placement as the
    // AI Agent processing pill so all in-flight loaders attach BELOW the
    // message that triggered them instead of floating at the top of the feed.
    const renderIndicatorCheckPlaceholder = (key: string) => {
      // The pill links to the SAME execution the auto-clear effect watches
      // (`observableCheckRun`), so the pill and the run drawer always agree on
      // which run is in flight and when it stopped.
      const recentRun: any = observableCheckRun;
      const wfId = recentRun?.workflow_id || recentRun?.workflow?.id || "";

      const execId = recentRun?.execution_id || "";
      const isClickable = !!execId;

      if (isSimple) {
        return (
          <Box
            key={`indicator-check-${key}`}
            onClick={
              isClickable
                ? () => {
                    window.dispatchEvent(
                      new CustomEvent("workflow-run:open", {
                        detail: {
                          executionId: String(execId),
                          workflowId: wfId || undefined,
                        },
                      }),
                    );
                  }
                : undefined
            }
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              py: 0.25,
              mb: 1.375,
              bgcolor: "transparent",
              border: "none",
              cursor: isClickable ? "pointer" : "default",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "text.secondary",
                }}
              >
                Indicator check
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  color: "text.secondary",
                }}
              >
                running
              </Typography>
            </Box>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "hsl(var(--foreground))",
                pl: 1.25,
                lineHeight: 1.4,
              }}
            >
              Checking observables…
            </Typography>
          </Box>
        );
      }

      return (
        <Box
          key={`indicator-check-${key}`}
          onClick={
            isClickable
              ? () => {
                  window.dispatchEvent(
                    new CustomEvent("workflow-run:open", {
                      detail: {
                        executionId: String(execId),
                        workflowId: wfId || undefined,
                      },
                    }),
                  );
                }
              : undefined
          }
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            alignSelf: "flex-start",
            pl: 0.4,
            pr: 1,
            py: 0.4,
            borderRadius: 999,
            fontSize: "0.7rem",
            background: "rgba(255, 102, 0, 0.08)",
            border: "1px solid rgba(255, 102, 0, 0.35)",
            color: "text.primary",
            maxWidth: "100%",
            cursor: isClickable ? "pointer" : "default",
            transition: "background-color 0.15s ease",
            "&:hover": isClickable
              ? { background: "rgba(255, 102, 0, 0.15)" }
              : undefined,
          }}
        >
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: "rgba(0, 0, 0, 0.25)",
              position: "relative",
            }}
          >
            <FingerprintIcon
              size={11}
              style={{ color: "hsl(var(--muted-foreground))" }}
            />
          </Box>
          <CircularProgress
            size={10}
            thickness={6}
            sx={{ color: "#ff6600", flexShrink: 0 }}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.7rem",
              fontWeight: 500,
              color: "inherit",
              lineHeight: 1,
            }}
          >
            {isClickable
              ? "Checking observables.. — view run"
              : "Checking observables.."}
          </Typography>
        </Box>
      );
    };

    // Identify the most recent manual comment (top-level OR reply) so the
    // indicator-check pill attaches under the message the user just posted.
    const latestManualKey: string | null = (() => {
      const manuals = items.filter((it) => it.type === "manual");
      if (manuals.length === 0) return null;
      const newest = manuals.reduce((a, b) =>
        a.timestamp >= b.timestamp ? a : b,
      );
      return getItemKey(newest);
    })();

    // Depth controls the indent rail color/spacing — we cap visual indent at 4
    // levels so deeply-nested threads don't run off the side.
    const renderThread = (
      item: TimelineItem,
      depth: number,
      isReply: boolean,
    ): React.ReactNode => {
      const itemKey = getItemKey(item);
      const replies = repliesByParent.get(itemKey) || [];
      const node = renderItem(item, { isReply });
      // A parent row can render nothing (e.g. a no-op revision). Never drop its
      // replies with it — they still belong in the timeline.
      if (!node && replies.length === 0) return null;

      // Show processing/timeout placeholder ONLY when this comment explicitly
      // @-mentions the AI Agent (e.g. @AIAgent / @aiagent / @ai_agent) and is
      // still flagged ai_handled with no agent reply landed yet. Without an
      // explicit mention we render nothing — silence is the right default.
      const isManualActivity = item.type === "manual";
      const aiHandled =
        isManualActivity && (item.data as any)?.ai_handled === true;
      const commentText = isManualActivity
        ? String((item.data as any)?.content || "")
        : "";
      const mentionsAgent = /@\s*ai[\s_-]*agent\b/i.test(commentText);
      const hasAgentReply = replies.some((r) => {
        if (r.type !== "manual") return false;
        const u = (r.data as any)?.user || "";
        return /agent|ai\s*agent|aiagent/i.test(u);
      });
      // For age, prefer the most recent rerun timestamp so a "Rerun" click
      // resets the loader window. Falls back to the original comment time.
      const reruns =
        isManualActivity && Array.isArray((item.data as any)?.rerun_timestamps)
          ? ((item.data as any).rerun_timestamps as number[])
          : [];
      const lastRerun = reruns.length > 0 ? Math.max(...reruns) : 0;
      const ageBasis =
        lastRerun ||
        (isManualActivity ? (item.data as any)?.timestamp : 0) ||
        item.timestamp ||
        0;
      const ageMs = isManualActivity ? Date.now() - ageBasis : 0;
      // Show placeholder when the agent is actively handling OR when the user
      // has clicked Rerun (which sets ai_handled=false and adds a timestamp;
      // the backend automation will flip ai_handled back to true shortly).
      const hasPendingRerun = reruns.length > 0;
      // Show processing as soon as a comment that mentions the agent is posted,
      // regardless of whether the backend has flipped ai_handled yet. The backend
      // workflow needs a few seconds to ingest the comment and set ai_handled=true,
      // and we don't want the user staring at silence in the meantime. Once the
      // age exceeds the timeout window we still flip to the timed-out state, and
      // an actual agent reply removes the placeholder entirely.
      const showAgentProcessing =
        (aiHandled || hasPendingRerun || isManualActivity) &&
        mentionsAgent &&
        !hasAgentReply;
      const isTimedOut = showAgentProcessing && ageMs > AI_RESPONSE_TIMEOUT_MS;

      // Indicator-check pill: attaches under the most recent manual comment
      // (including replies) whenever a backend indicator scan is running.
      const showIndicatorCheck =
        isManualActivity &&
        itemKey === latestManualKey &&
        refreshingObservables &&
        enrichmentStatus.active;

      if (!node && replies.length === 0) return null;
      if (replies.length === 0 && !showAgentProcessing && !showIndicatorCheck)
        return node;

      const cappedDepth = Math.min(depth, 4);
      return (
        <Box
          key={`thread-${itemKey}`}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: isReply ? 1 : 1.5,
          }}
        >
          {node}
          <Box
            sx={{
              ml: variant === "simple" ? 1 : cappedDepth === 0 ? 4 : 3,
              pl: variant === "simple" ? 1 : 2,
              borderLeft:
                variant === "simple"
                  ? "1px solid hsl(var(--border-subtle))"
                  : "2px solid rgba(255, 102, 0, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {showIndicatorCheck && renderIndicatorCheckPlaceholder(itemKey)}
            {showAgentProcessing &&
              renderAgentProcessingPlaceholder(
                itemKey,
                isTimedOut,
                (item as any).data?.id,
                reruns.length,
                lastRerun ||
                  (isManualActivity ? (item as any).data?.timestamp : 0) ||
                  item.timestamp ||
                  0,
              )}
            {replies.map((reply) => renderThread(reply, depth + 1, true))}
          </Box>
        </Box>
      );
    };

    // ─── Fresh-incident agent prediction ────────────────────────────────
    // If the incident is very fresh AND the AI Agent automation is enabled,
    // there is a good chance the backend workflow is already running against
    // it (indexing, enriching, deciding), but the resulting agent run has
    // not landed in the datastore yet. Instead of silence, show a
    // top-of-timeline "probably running" pill so users know something is
    // happening. It self-clears the moment any real agent activity arrives
    // or the incident stops being "fresh".
    const AGENT_PREDICTION_WINDOW_MS = 3 * 60 * 1000;
    const hasAgentActivity = items.some((it) => {
      if (it.type === "agent") return true;
      if (it.type === "manual") {
        const u = String((it.data as any)?.user || "");
        return /agent|ai\s*agent|aiagent/i.test(u);
      }
      return false;
    });
    const showAgentPrediction =
      agentReadiness.active &&
      activeTimelineFilters.has("agent") &&
      Number.isFinite(incidentAgeMs) &&
      incidentAgeMs < AGENT_PREDICTION_WINDOW_MS &&
      !hasAgentActivity;

    const isAgentPredHighlighted = hoveredTimelineFilter === "agent";
    const isAgentPredDimmed =
      hoveredTimelineFilter !== null && !isAgentPredHighlighted;

    const agentPredictionNode = showAgentPrediction ? (
      isSimple ? (
        <Box
          key="ai-prediction-fresh"
          data-timeline-filter="agent"
          data-timeline-highlighted={
            isAgentPredHighlighted ? "true" : undefined
          }
          data-timeline-dimmed={isAgentPredDimmed ? "true" : undefined}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            px: isAgentPredHighlighted ? 0.75 : 0,
            py: 0.25,
            borderRadius: isAgentPredHighlighted ? 1 : 0,
            bgcolor: isAgentPredHighlighted
              ? "hsl(var(--primary) / 0.12)"
              : "transparent",
            border: isAgentPredHighlighted ? "1px solid #ff6600" : "none",
            boxShadow: isAgentPredHighlighted
              ? "0 0 12px rgba(255, 102, 0, 0.25)"
              : "none",
            opacity: isAgentPredDimmed ? 0.35 : 1,
            transition:
              "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
            mb: 1.375,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                flexShrink: 0,
                color: "text.secondary",
              }}
            >
              <AgentIcon size={13} />
            </Box>
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "text.secondary",
              }}
            >
              AI Agent
            </Typography>
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 500,
                color: "text.secondary",
              }}
            >
              is likely running
            </Typography>
          </Box>
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "hsl(var(--foreground))",
              pl: 1.25,
              lineHeight: 1.4,
            }}
          >
            Waiting for first update…
          </Typography>
        </Box>
      ) : (
        <Box
          key="ai-prediction-fresh"
          data-timeline-filter="agent"
          data-timeline-highlighted={
            isAgentPredHighlighted ? "true" : undefined
          }
          data-timeline-dimmed={isAgentPredDimmed ? "true" : undefined}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            alignSelf: "flex-start",
            pl: 0.4,
            pr: 1,
            py: 0.4,
            borderRadius: 999,
            fontSize: "0.7rem",
            background: isAgentPredHighlighted
              ? "hsl(var(--primary) / 0.12)"
              : "var(--agent-gradient-subtle)",
            border: "1px solid",
            borderColor: isAgentPredHighlighted
              ? "#ff6600"
              : "rgba(156, 90, 242, 0.35)",
            boxShadow: isAgentPredHighlighted
              ? "0 0 12px rgba(255, 102, 0, 0.25)"
              : "none",
            opacity: isAgentPredDimmed ? 0.35 : 1,
            transition:
              "opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease",
            color: "text.primary",
            maxWidth: "100%",
          }}
        >
          <Tooltip title="Open Agent activity" arrow disableInteractive>
            <Box
              component={Link}
              to="/agents"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open Agent activity"
              sx={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: "rgba(0, 0, 0, 0.25)",
                color: "inherit",
                textDecoration: "none",
                transition: "background 0.15s ease, transform 0.15s ease",
                "&:hover": {
                  background: "rgba(0, 0, 0, 0.4)",
                  transform: "scale(1.05)",
                },
              }}
            >
              <AgentIcon size={11} />
            </Box>
          </Tooltip>
          <CircularProgress
            size={10}
            thickness={6}
            sx={{ color: "rgba(156, 90, 242, 0.9)", flexShrink: 0 }}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.7rem",
              fontWeight: 500,
              color: "inherit",
              lineHeight: 1,
            }}
          >
            AI Agent is likely running — waiting for the first update…
          </Typography>
        </Box>
      )
    ) : null;

    // Any open agent Question scoped to this incident renders at the very top
    // of the timeline so the user can always answer without hunting for the
    // stuck row (the notification's execution_id often points to a child agent
    // execution that is not itself listed on the timeline).
    // Only ONE question is shown at a time — the next one appears once the
    // current card is answered or ignored.
    const questionBanners = (incidentQuestions || []).slice(0, 1).map((n) => (
      <Box key={`inc-question-${n.id}`} sx={{ mb: 1 }}>
        <InlineAgentQuestion
          notification={n}
          onOpenDetails={openAgentRunDetails}
          onSubmitted={() => {
            refreshAgentNotifications();
            refetchWorkflowRuns();
            refetchAgentRuns();
          }}
        />
      </Box>
    ));

    return (
      <>
        {questionBanners}
        {agentPredictionNode}
        {topLevel.map((item) => renderThread(item, 0, false))}
      </>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        maxWidth: 1400,
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
      }}
      data-incident-content=""
    >
      {/* Highlight-to-create routing rule chip. Non-invasive: only appears
          on real text selections inside this incident's content area. */}
      {!isPublicView && <SelectionRuleChip incidentId={incident?.id} />}

      {/* OCSF recovery fallback banner moved into the Timeline section
          (and is dismissible there). Intentionally not shown at the top. */}

      {/* Read-only banner for shared/public view */}
      {isPublicView && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 2,
            bgcolor: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <VisibilityIcon size={18} style={{ color: "#3b82f6" }} />
          <Typography
            variant="body2"
            sx={{ color: "#3b82f6", fontWeight: 500 }}
          >
            Shared view — This incident is read-only.
          </Typography>
        </Box>
      )}

      {/* Support-only audit explaining why a fallback IOC was used. */}
      <DemoFallbackAuditBanner
        visible={
          !isPublicView &&
          (userInfo?.support === true || searchParams.get("support") === "1") &&
          (searchParams.get("demo-fallback") === "true" ||
            !!incident?.rawOCSF?.metadata?.extensions?.custom_attributes
              ?.demoFallback)
        }
      />

      {/* If this incident was merged into another one, surface a jump link
          at the top so the analyst is not stuck reading a "dead" case. */}
      {!isPublicView && incident?.id && primaryPointer && (
        <MergedIncidentBanner
          currentIncidentId={incident.id}
          primary={relatedIncidents.primary}
          primaryPointerId={primaryPointer.id}
          loading={relatedIncidents.loading}
          onUnlinked={() => loadIncident(false)}
        />
      )}

      {/* Incidents merged INTO this one are surfaced quietly at the top of
          the Correlations tab instead of a loud page-level banner — see the
          `activeTab === 3` block below. */}

      {/* Thread-correlated incidents are surfaced inside the Correlations tab
          instead of a page-level banner — see the `activeTab === 3` block. */}

      {/* Possible duplicates / merge suggestions banner — surfaces past
          incidents that share observables, correlations, or known IOCs with
          the one being viewed. Hidden in the public/read-only view. */}
      {!isPublicView && (
        <MergeCandidatesBanner
          candidates={mergeCandidates.candidates}
          loading={mergeCandidates.loading}
          storageKey={
            incident?.id ? `merge-candidates::${incident.id}` : undefined
          }
          onMergeWith={(id) => {
            setMergePreselectedId(id);
            setShowMergeDialog(true);
          }}
        />
      )}

      {/* Routing rule preview — client-side dry-run of `shuffle-security_routing`
          rules against the current incident state. Suggests applying matched
          actions without waiting for the workflow to write back results. */}
      {!isPublicView && incident && (
        <div id="routing-rule-preview-banner">
          <RoutingRulePreviewBanner
            incidentId={incident.id}
            context={{
              title: editedTitle || incident.title,
              description: editedMessage,
              source: incident.source,
              severity: editedSeverity,
              status: editedStatus,
              labels: editedLabels,
              observables: editedObservables,
              stakeholders: editedStakeholders,
              rawOCSF: incident.rawOCSF,
            }}
            onApplyActions={applyRoutingActions}
            onApply={async (patch) => {
              if (patch.severity) {
                setEditedSeverity(patch.severity);
                toast.success(`Severity set to ${patch.severity}`);
              }
              if (patch.status) {
                setEditedStatus(patch.status);
                toast.success(`Status set to ${patch.status}`);
              }
              if (patch.priority) {
                await applyRoutingActions([
                  { type: "set_priority", value: patch.priority },
                ]);
              }
              if (patch.assignee) {
                setEditedAssignee(patch.assignee);
                toast.success(`Assigned to ${patch.assignee}`);
              }
              if (patch.addLabel) {
                setEditedLabels((prev) =>
                  prev.includes(patch.addLabel!)
                    ? prev
                    : [...prev, patch.addLabel!],
                );
                toast.success(`Added label "${patch.addLabel}"`);
              }
              if (patch.addComment) {
                // Actually post the comment via the real pipeline instead of
                // showing a toast. This writes to the activity feed and
                // persists to the incident's OCSF record.
                await handleAddComment(patch.addComment);
              }
              if (patch.setField) {
                await applyRoutingActions([
                  {
                    type: "set_field",
                    field: patch.setField.field,
                    value: patch.setField.value,
                  },
                ]);
              }
            }}
            isActionApplied={(a) => {
              const currentOrgIds = new Set<string>(
                [
                  crossOrgId || userInfo?.active_org?.id || "",
                  ...sharedOrgs.map((org) => org.id),
                ].filter(Boolean),
              );
              const rawCustomAttrs =
                incident?.rawOCSF?.metadata?.extensions?.custom_attributes ||
                {};
              switch (a.type) {
                case "set_severity":
                  return (
                    !!a.value &&
                    editedSeverity === normalizeRoutingSeverityValue(a.value)
                  );
                case "set_status":
                  return !!a.value && editedStatus === normalizeStatus(a.value);
                case "set_priority":
                  return (
                    !!a.value &&
                    String(
                      (incident?.rawOCSF as any)?.priority ??
                        (rawCustomAttrs as any)?.priority ??
                        "",
                    ) === String(a.value)
                  );
                case "add_label":
                  return !!a.value && editedLabels.includes(a.value);
                case "assign_to":
                  return !!a.value && editedAssignee === a.value;
                case "add_comment": {
                  if (!a.value) return false;
                  const needle = a.value.trim();
                  if (!needle) return false;
                  return activity.some(
                    (it: any) =>
                      it?.type === "comment" &&
                      typeof it?.content === "string" &&
                      it.content.trim() === needle,
                  );
                }
                case "run_agent": {
                  const prompt = String(a.value || "").trim();
                  if (!prompt) return false;
                  return activity.some(
                    (it: any) =>
                      it?.type === "comment" &&
                      typeof it?.content === "string" &&
                      it.content.trim().startsWith(`@AIAgent ${prompt}`),
                  );
                }
                case "suggest_move":
                  return (
                    !!a.targetOrgId &&
                    currentOrgIds.size === 1 &&
                    currentOrgIds.has(a.targetOrgId)
                  );
                case "set_field": {
                  if (!a.field) return false;
                  const expected = parseRoutingActionValue(a.value);
                  const canonicalField = a.field.startsWith("rawOCSF.")
                    ? a.field.slice("rawOCSF.".length)
                    : a.field;
                  if (canonicalField === "severity")
                    return (
                      editedSeverity ===
                      normalizeRoutingSeverityValue(String(expected))
                    );
                  if (canonicalField === "status")
                    return editedStatus === normalizeStatus(String(expected));
                  const actual =
                    canonicalField === "title"
                      ? editedTitle
                      : canonicalField === "description" ||
                          canonicalField === "desc"
                        ? editedMessage
                        : canonicalField === "assignee"
                          ? editedAssignee
                          : canonicalField === "priority"
                            ? ((incident?.rawOCSF as any)?.priority ??
                              (rawCustomAttrs as any)?.priority)
                            : canonicalField === "labels" ||
                                canonicalField === "types"
                              ? editedLabels.includes(String(expected))
                                ? expected
                                : undefined
                              : a.field.startsWith("rawOCSF.")
                                ? readDeepValue(
                                    incident?.rawOCSF,
                                    a.field.slice("rawOCSF.".length),
                                  )
                                : editedCustomFields[
                                    a.field
                                      .replace(/^customFields\./, "")
                                      .replace(/^custom_fields\./, "")
                                  ];
                  return String(actual ?? "") === String(expected ?? "");
                }
                default:
                  return false;
              }
            }}
            onMove={async (targetOrgId) => {
              await moveIncidentToTenant(targetOrgId);
            }}
          />
        </div>
      )}

      {/* Agent action required banner — shown when navigating from dashboard */}
      {(() => {
        const agentActionId = searchParams.get("agent_action");
        if (!agentActionId || !agentRuns?.length) return null;
        const matchedRun = agentRuns.find(
          (r: any) => r.execution_id === agentActionId,
        );
        if (!matchedRun) return null;

        const status = matchedRun.status?.toUpperCase() || "";
        const isWaiting = status === "WAITING";
        const isFailed = status === "FAILED" || status === "ABORTED";

        // Determine what to show
        let bannerTitle = "Action Required";
        let bannerDescription =
          "The AI agent needs your input on this incident.";
        let bannerColor = "--severity-high";
        let bannerIcon = <AutoFixHighIcon size={20} />;
        let actionSteps: string[] = [];

        if (isWaiting) {
          bannerTitle = "Approval Required";
          bannerDescription =
            "The AI agent is waiting for your approval before it can continue processing this incident.";
          bannerColor = "--severity-info";
          actionSteps = [
            "Review the agent's proposed action in the Activity feed below.",
            "Verify the action is appropriate for this incident.",
            "Approve or reject the action to let the agent proceed.",
          ];
        } else if (isFailed) {
          bannerTitle = "Agent Failed — Manual Action Needed";
          bannerDescription =
            "The AI agent encountered an error while processing this incident. You need to investigate and take manual action.";
          bannerColor = "--severity-critical";
          actionSteps = [
            "Check the Agent activity in the feed below for error details.",
            "Manually perform the action the agent could not complete.",
            "Update the incident status accordingly.",
          ];
        } else {
          bannerTitle = "Review Required";
          bannerDescription =
            "The AI agent flagged uncertainty in its analysis of this incident. Please review and confirm.";
          bannerColor = "--severity-medium";
          actionSteps = [
            "Review the agent's findings in the Activity feed below.",
            "Verify the analysis against the incident data.",
            "Confirm or correct the agent's conclusions.",
          ];
        }

        return (
          <Box
            sx={{
              mb: 2,
              px: 3,
              py: 2.5,
              borderRadius: 2,
              backgroundColor: `hsl(var(${bannerColor}) / 0.06)`,
              border: `1px solid hsl(var(${bannerColor}) / 0.2)`,
            }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}
            >
              <Box sx={{ color: `hsl(var(${bannerColor}))`, display: "flex" }}>
                {bannerIcon}
              </Box>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  color: `hsl(var(${bannerColor}))`,
                }}
              >
                {bannerTitle}
              </Typography>
            </Box>
            <Typography
              sx={{
                fontSize: "0.84rem",
                color: "hsl(var(--foreground))",
                mb: 1.5,
                lineHeight: 1.5,
              }}
            >
              {bannerDescription}
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5, mb: 1 }}>
              {actionSteps.map((step, i) => (
                <Box component="li" key={i} sx={{ mb: 0.5 }}>
                  <Typography
                    sx={{
                      fontSize: "0.82rem",
                      color: "hsl(var(--muted-foreground))",
                      lineHeight: 1.5,
                    }}
                  >
                    {step}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Button
              size="small"
              onClick={() => {
                // Remove the param so banner can be dismissed
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("agent_action");
                    return next;
                  },
                  { replace: true },
                );
              }}
              sx={{
                fontSize: "0.75rem",
                textTransform: "none",
                color: "hsl(var(--muted-foreground))",
                mt: 0.5,
              }}
            >
              Dismiss
            </Button>
          </Box>
        );
      })()}

      {/* Compact Header — hidden in the Simple view, where the overview column
          already carries the title, severity, status, assignee and timestamp. */}
      <Box sx={{ mb: 2, display: activeTab === 7 ? "none" : "block" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          {/* Back link */}
          <Box
            component={Link}
            to={entityBasePath}
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              alignItems: "center",
              gap: 0.5,
              color: "#22b8cf",
              textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            <ArrowBackIcon size={18} />
            <Typography
              variant="body2"
              sx={{ display: { xs: "none", sm: "block" } }}
            >
              Back to {entityPlural}
            </Typography>
            <Typography
              variant="body2"
              sx={{ display: { xs: "block", sm: "none" } }}
            >
              Back
            </Typography>
          </Box>

          {/* Tenant indicator — only shown in multi-tenant environments */}
          {(() => {
            const isMultiTenant = isParentOrg || isCrossOrg;
            if (!isMultiTenant) return null;
            const viewingOrgId = isCrossOrg
              ? crossOrgId || ""
              : userInfo?.active_org?.id || "";
            if (!viewingOrgId && sharedOrgs.length === 0) return null;
            const seenIds = new Set<string>([viewingOrgId]);
            const uniqueShared = sharedOrgs.filter((o) => {
              if (!o?.id || seenIds.has(o.id)) return false;
              seenIds.add(o.id);
              return true;
            });
            const viewingOrg = isCrossOrg
              ? {
                  name: crossOrgInfo?.name || crossOrgId,
                  image: crossOrgInfo?.image as string | undefined,
                }
              : {
                  name: userInfo?.active_org?.name || "",
                  image: userInfo?.active_org?.image,
                };
            const allTenants = [
              {
                id: viewingOrgId,
                name: viewingOrg.name,
                image: viewingOrg.image,
              },
              ...uniqueShared,
            ];
            const total = allTenants.length;
            const openMoveDialog = () => {
              setMoveTargetOrgId("");
              const sourceOrgId = crossOrgId || userInfo?.active_org?.id || "";
              const initial = new Set<string>();
              if (sourceOrgId) initial.add(sourceOrgId);
              for (const so of sharedOrgs) initial.add(so.id);
              setMoveSelectedOrgIds(initial);
              setShowMoveDialog(true);
            };
            const commonChipSx = {
              height: 24,
              fontSize: "0.72rem",
              bgcolor: "transparent",
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--foreground))",
              cursor: "pointer",
              "&:hover": { bgcolor: "hsl(var(--muted))" },
            } as const;
            return (
              <Box
                sx={{
                  display: { xs: "none", sm: "inline-flex" },
                  alignItems: "center",
                  gap: 0.75,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {total > 1 ? (
                  <Tooltip
                    title={
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.5,
                          py: 0.5,
                        }}
                      >
                        {allTenants.map((t) => (
                          <Box
                            key={t.id}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                            }}
                          >
                            {t.image ? (
                              <img
                                src={t.image}
                                alt=""
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 3,
                                }}
                              />
                            ) : null}
                            <span>{t.name}</span>
                          </Box>
                        ))}
                      </Box>
                    }
                    placement="bottom-end"
                    arrow
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${total} tenants`}
                      onClick={openMoveDialog}
                      sx={commonChipSx}
                    />
                  </Tooltip>
                ) : (
                  <Chip
                    size="small"
                    variant="outlined"
                    avatar={
                      viewingOrg.image ? (
                        <img
                          src={viewingOrg.image}
                          alt=""
                          style={{ width: 16, height: 16, borderRadius: 3 }}
                        />
                      ) : undefined
                    }
                    label={viewingOrg.name}
                    onClick={openMoveDialog}
                    sx={commonChipSx}
                  />
                )}
              </Box>
            );
          })()}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            flexDirection: { xs: "column", sm: "row" },
            gap: { xs: 1, sm: 2 },
            p: { xs: 1.25, sm: 2 },
            borderRadius: 2,
            bgcolor: "transparent",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.25, sm: 2 },
              width: { xs: "100%", sm: "auto" },
              flex: { sm: 1 },
              minWidth: 0,
            }}
          >
            {/* Icon */}
            <Box sx={{ position: "relative", flexShrink: 0 }}>
              <Box
                sx={{
                  width: { xs: 40, sm: 56 },
                  height: { xs: 40, sm: 56 },
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: sourceAppImage
                    ? "transparent"
                    : `${severityColors[editedSeverity]}15`,
                  border: sourceAppImage
                    ? "none"
                    : `1px solid ${severityColors[editedSeverity]}30`,
                  overflow: "hidden",
                }}
              >
                {sourceAppImage ? (
                  <img
                    src={sourceAppImage}
                    alt={incident?.source || ""}
                    style={{
                      width: 44,
                      height: 44,
                      objectFit: "contain",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <TaskAltIcon
                    size={28}
                    style={{ color: severityColors[editedSeverity] }}
                  />
                )}
              </Box>
              {(() => {
                // Stable thread badge — counts what is ACTUALLY merged into
                // this incident, not the raw thread population. Discovered
                // siblings that share a thread_id but haven't been merged
                // yet are surfaced by the ThreadCorrelatedBanner instead;
                // conflating them here inflates the badge to numbers the
                // user can't reconcile with the visible merge list.
                //
                //   1. Resolved linked incidents (best case, includes titles).
                //   2. Raw `related_incidents` pointers on the current OCSF
                //      (survives even if the cross-load fetches are still
                //      pending or blocked).
                //   3. `_merged_data_from` audit list (persisted by
                //      linkMergePair, survives write-verify races).
                const resolvedCount = relatedIncidents?.linked?.length || 0;
                const pointerCount = (() => {
                  try {
                    return getLinkedPointers(incident?.rawOCSF).length;
                  } catch {
                    return 0;
                  }
                })();
                const foldedFrom = Array.isArray(
                  (incident?.rawOCSF as any)?._merged_data_from,
                )
                  ? (incident?.rawOCSF as any)._merged_data_from.length
                  : 0;
                const linkedFloor = Math.max(
                  resolvedCount,
                  pointerCount,
                  foldedFrom,
                );
                const linkedTotal = linkedFloor + 1;
                const localSourceCount = localEmailThreadMessageCount;
                const total = Math.max(linkedTotal, localSourceCount);
                if (total <= 1) return null;
                const unavailable =
                  (relatedIncidents?.invisibleCount || 0) +
                  (threadCorrelated?.invisibleCount || 0);
                const suffix = unavailable
                  ? ` (${unavailable} unavailable)`
                  : "";
                const tooltipTitle =
                  localSourceCount > linkedTotal
                    ? `${localSourceCount} source message${localSourceCount !== 1 ? "s" : ""} in this email thread${linkedTotal > 1 ? `, ${linkedTotal} incident${linkedTotal !== 1 ? "s" : ""} currently merged` : ""}`
                    : `${linkedTotal} incident${linkedTotal !== 1 ? "s" : ""} merged into this thread${suffix} — click to view`;

                return (
                  <Tooltip title={tooltipTitle} arrow>
                    <Avatar
                      onClick={(e) => {
                        e.stopPropagation();
                        focusRelatedIncident(null);
                      }}
                      sx={{
                        position: "absolute",
                        bottom: -5,
                        right: -5,
                        width: { xs: 18, sm: 20 },
                        height: { xs: 18, sm: 20 },
                        fontSize: { xs: "0.6rem", sm: "0.65rem" },
                        fontWeight: 700,
                        bgcolor: "hsl(var(--primary))",
                        color: "hsl(var(--primary-foreground))",
                        border: "2px solid hsl(var(--background))",
                        boxSizing: "border-box",
                        cursor: "pointer",
                        transition: "transform 0.15s ease",
                        "&:hover": { transform: "scale(1.08)" },
                      }}
                    >
                      {total}
                    </Avatar>
                  </Tooltip>
                );
              })()}
            </Box>

            {/* Title and meta */}
            <Box
              sx={{ flex: 1, minWidth: 0 }}
              data-tour="incident-title"
              data-incident-field="title"
              data-entity-title={currentIncidentTitle}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <TextField
                  value={editedTitle}
                  onChange={(e) =>
                    !isPublicView && setEditedTitle(e.target.value)
                  }
                  variant="standard"
                  placeholder="Enter title..."
                  inputProps={{
                    readOnly: isPublicView,
                    "data-entity-title": currentIncidentTitle,
                  }}
                  InputProps={{
                    disableUnderline: true,
                    sx: {
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      ...(!isPublicView && {
                        "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                      }),
                      borderRadius: 1,
                      px: 0.5,
                    },
                  }}
                  sx={{ flex: 1 }}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mt: 0.5,
                  flexWrap: "wrap",
                  ...(isPublicView && { pointerEvents: "none" }),
                }}
              >
                {/* Status dropdown */}
                <FormControl size="small" variant="standard">
                  <Select
                    value={editedStatus}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "resolved") {
                        setShowResolveDialog(true);
                        return;
                      }
                      setEditedStatus(val);
                    }}
                    disableUnderline
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: statusConfig[editedStatus]?.color || "#f59e0b",
                      "& .MuiSelect-select": {
                        py: 0.25,
                        px: 1,
                        borderRadius: 3,
                        bgcolor:
                          statusConfig[editedStatus]?.bg ||
                          "rgba(245, 158, 11, 0.15)",
                        border: !statusConfig[editedStatus]
                          ? "1px dashed rgba(245, 158, 11, 0.4)"
                          : "none",
                      },
                      "& .MuiSelect-icon": {
                        color: statusConfig[editedStatus]?.color || "#f59e0b",
                        fontSize: 16,
                      },
                    }}
                    renderValue={(val) => {
                      if (!statusConfig[val])
                        return `⚠ ${val.replace(/_/g, " ")}`;
                      return statusConfig[val].label;
                    }}
                  >
                    {Object.entries(statusConfig)
                      // "Merged" is set only by the auto-merge action — never let a user
                      // pick it manually from the status dropdown.
                      .filter(([key]) => key !== "merged")
                      .map(([key, cfg]) => {
                        const isDisabled =
                          key === "on_hold" || key === "escalated";
                        return (
                          <MenuItem
                            key={key}
                            value={key}
                            disabled={isDisabled}
                            sx={{
                              fontSize: "0.8rem",
                              gap: 1,
                              opacity: isDisabled ? 0.4 : 1,
                            }}
                          >
                            <cfg.icon size={14} color={cfg.color} />
                            {cfg.label}
                            {isDisabled && (
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: "0.65rem",
                                  color: "hsl(var(--muted-foreground))",
                                  ml: "auto",
                                }}
                              >
                                Soon
                              </Typography>
                            )}
                          </MenuItem>
                        );
                      })}
                  </Select>
                </FormControl>

                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  •
                </Typography>

                {/* Severity dropdown */}
                <FormControl size="small" variant="standard">
                  <Select
                    value={editedSeverity}
                    onChange={(e) => setEditedSeverity(e.target.value)}
                    disableUnderline
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      bgcolor: `${severityColors[editedSeverity]}20`,
                      color: severityColors[editedSeverity],
                      borderRadius: 1,
                      px: 1,
                      py: 0.25,
                      textTransform: "capitalize",
                      "& .MuiSelect-select": { py: 0, pr: 2.5 },
                      "& .MuiSvgIcon-root": {
                        color: severityColors[editedSeverity],
                        fontSize: 16,
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          bgcolor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        },
                      },
                    }}
                  >
                    <MenuItem value="critical">Critical</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="informational">Informational</MenuItem>
                  </Select>
                </FormControl>

                <Typography
                  variant="caption"
                  sx={{
                    color: "text.disabled",
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  •
                </Typography>

                {/* Assignee dropdown - styled like chips */}
                <FormControl
                  size="small"
                  variant="standard"
                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                >
                  <Select
                    value={editedAssignee || ""}
                    onChange={(e) => setEditedAssignee(e.target.value)}
                    displayEmpty
                    disableUnderline
                    disabled={usersLoading}
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      bgcolor: isAIAssignee(editedAssignee)
                        ? "rgba(34, 197, 94, 0.15)"
                        : editedAssignee
                          ? "rgba(251, 146, 60, 0.15)"
                          : "rgba(148, 163, 184, 0.1)",
                      color: isAIAssignee(editedAssignee)
                        ? "#22c55e"
                        : editedAssignee
                          ? "#fb923c"
                          : "text.secondary",
                      borderRadius: 1,
                      px: 1,
                      py: 0.25,
                      "& .MuiSelect-select": { py: 0, pr: 2.5 },
                      "& .MuiSvgIcon-root": {
                        color: isAIAssignee(editedAssignee)
                          ? "#22c55e"
                          : editedAssignee
                            ? "#fb923c"
                            : "text.secondary",
                        fontSize: 16,
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          bgcolor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        },
                      },
                    }}
                    renderValue={(value) => {
                      if (isAIAssignee(value as string)) {
                        return (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            <AgentIcon size={16} /> AI Agent
                          </Box>
                        );
                      }
                      return value || "Unassigned";
                    }}
                  >
                    <MenuItem value="">Unassigned</MenuItem>
                    <MenuItem value="AI Agent">
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                      >
                        <AgentIcon size={16} />
                        AI Agent
                      </Box>
                    </MenuItem>
                    {users.map((user) => (
                      <MenuItem key={user.id} value={user.username}>
                        {user.username}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography
                  variant="caption"
                  sx={{
                    color: "text.disabled",
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  •
                </Typography>

                {/* Last edited */}
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.disabled",
                    display: { xs: "none", sm: "flex" },
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <AccessTimeIcon size={12} />
                  {incident.editedTs
                    ? formatTimestamp(incident.editedTs)
                    : formatTimestamp(incident.createdTs)}
                </Typography>

                {/* Mobile-only actions menu — kept on the same line as status/severity */}
                {!isPublicView && (
                  <Tooltip title="Actions">
                    <IconButton
                      size="small"
                      onClick={(e) => setActionsMenuAnchor(e.currentTarget)}
                      sx={{
                        display: { xs: "inline-flex", sm: "none" },
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 1,
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                        ml: "auto",
                      }}
                    >
                      <MoreVertIcon size={18} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </Box>

          {/* Right side actions — split into two rows so the title gets more
              breathing room. Top row: Refresh + actions menu. Bottom row:
              loaders + Ask agent. */}
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              flexDirection: { xs: "row", sm: "column" },
              alignItems: { xs: "center", sm: "flex-end" },
              justifyContent: { xs: "flex-end", sm: "flex-start" },
              width: { xs: "100%", sm: "auto" },
              gap: 0.75,
              flexShrink: 0,
            }}
          >
            {/* Bottom row group (loaders + Ask agent) — `order: 2` pushes it
                below the top row even though it appears first in the DOM. */}
            <Box
              sx={{
                order: 2,
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {isSaving && <CircularProgress size={18} />}
              {isResyncing && (
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: "rgba(255, 102, 0, 0.08)",
                    border: "1px solid rgba(255, 102, 0, 0.2)",
                  }}
                >
                  <CircularProgress size={14} sx={{ color: "#ff6600" }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#ff6600",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      lineHeight: 1,
                      fontSize: "0.75rem",
                    }}
                  >
                    {incident?.source
                      ? `Resyncing from ${incident.source}…`
                      : "Resyncing…"}
                  </Typography>
                </Box>
              )}

              {/* Ask the AI agent — quick popover that posts an @AIAgent comment
                into the Timeline. The existing agent handler picks it up.
                Disabled on merged incidents — the primary is the writable one. */}
              <Tooltip
                title={
                  primaryPointer
                    ? "This incident is merged — open the primary to interact with the AI agent"
                    : agentReadiness.isLoading
                      ? "Checking AI agent status…"
                      : agentReadiness.active
                        ? "Ask the AI agent"
                        : "AI agent is not enabled — click to set it up"
                }
              >
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!!primaryPointer}
                    onClick={(e) => setAskAgentAnchor(e.currentTarget)}
                    startIcon={<AgentIcon size={14} />}

                    endIcon={
                      !agentReadiness.isLoading ? (
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: agentReadiness.active
                              ? "hsl(var(--severity-low))"
                              : "hsl(var(--severity-medium))",
                            boxShadow: agentReadiness.active
                              ? "0 0 6px hsl(var(--severity-low) / 0.6)"
                              : "none",
                          }}
                        />
                      ) : undefined
                    }
                    sx={{
                      height: 32,
                      textTransform: "none",
                      borderRadius: 1,
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      px: { xs: 0.75, sm: 1.25 },
                      minWidth: { xs: 0, sm: 64 },
                      background:
                        "linear-gradient(135deg, rgba(255,133,68,0.08), rgba(236,81,124,0.08), rgba(156,90,242,0.08))",
                      "& .MuiButton-startIcon": {
                        mr: { xs: 0.25, sm: 1 },
                        ml: 0,
                      },
                      "&:hover": {
                        borderColor: "hsl(var(--primary))",
                        background:
                          "linear-gradient(135deg, rgba(255,133,68,0.16), rgba(236,81,124,0.16), rgba(156,90,242,0.16))",
                      },
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ display: { xs: "none", sm: "inline" } }}
                    >
                      Ask agent
                    </Box>
                  </Button>
                </span>
              </Tooltip>

              <Popover
                open={Boolean(askAgentAnchor)}
                anchorEl={askAgentAnchor}
                onClose={() => {
                  setAskAgentAnchor(null);
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                PaperProps={{
                  sx: {
                    mt: 1,
                    width: 380,
                    bgcolor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 2,
                    p: 2,
                  },
                }}
              >
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <AgentIcon size={16} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Ask the AI agent
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: "hsl(var(--muted-foreground))",
                    display: "block",
                    mb: 1.5,
                  }}
                >
                  Your question is posted to the Timeline as @AIAgent and the
                  agent will reply there. Observables, IOC matches,
                  correlations, stakeholders and the top related incidents are
                  auto-attached as context.
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setAskAgentAnchor(null);
                      openAgentDrawer("permissions", { openToolPicker: true });
                    }}
                    sx={{
                      flex: 1,
                      height: 32,
                      textTransform: "none",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      "&:hover": {
                        borderColor: "hsl(var(--primary))",
                        bgcolor: "hsl(var(--primary) / 0.06)",
                      },
                    }}
                  >
                    Assign tools
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openAgentDrawer("localLLM")}
                    sx={{
                      flex: 1,
                      height: 32,
                      textTransform: "none",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      "&:hover": {
                        borderColor: "hsl(var(--primary))",
                        bgcolor: "hsl(var(--primary) / 0.06)",
                      },
                    }}
                  >
                    Shuffle AI
                  </Button>
                </Box>
                {/* Currently assigned tools — mirrors the Permissions panel so it
                  is clear what the agent can reach before asking. */}
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 600,
                      mb: 0.75,
                    }}
                  >
                    Assigned tools
                  </Typography>
                  {askAgentTools.length === 0 ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color: "hsl(var(--muted-foreground))",
                        fontSize: "0.7rem",
                      }}
                    >
                      No tools assigned — the agent will answer without apps.
                    </Typography>
                  ) : (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                      {askAgentTools.map((name) => (
                        <Box
                          key={name}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 24,
                            px: 1,
                            borderRadius: 1,
                            border: "1px solid hsl(var(--border))",
                            bgcolor: "hsl(var(--muted) / 0.4)",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "0.7rem",
                              fontWeight: 500,
                              color: "hsl(var(--foreground))",
                            }}
                          >
                            {formatAgentToolName(name)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
                {!agentReadiness.isLoading && !agentReadiness.active && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      p: 1.25,
                      mb: 1.5,
                      borderRadius: 1,
                      border: "1px solid hsl(var(--severity-medium) / 0.4)",
                      bgcolor: "hsl(var(--severity-medium) / 0.08)",
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          fontWeight: 600,
                          color: "hsl(var(--foreground))",
                          mb: 0.25,
                        }}
                      >
                        AI Agent is not enabled
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          color: "hsl(var(--muted-foreground))",
                          fontSize: "0.7rem",
                          lineHeight: 1.4,
                        }}
                      >
                        {!agentReadiness.hasWorkflow &&
                        !agentReadiness.hasCategoryAutomation &&
                        !agentReadiness.hasAiAgentAutomation
                          ? 'Neither the "Run AI Agent" automation nor the "Assign & Escalate" workflow is wired up on Incidents.'
                          : !agentReadiness.hasWorkflow
                            ? 'The "Assign & Escalate" workflow is missing.'
                            : 'The incident "Run workflow" automation is not pointing at the agent workflow.'}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={agentReadiness.isEnabling}
                      onClick={async () => {
                        try {
                          await agentReadiness.enable();
                          toast.success("AI Agent enabled");
                        } catch (err: any) {
                          toast.error(
                            err?.message || "Failed to enable AI Agent",
                          );
                        }
                      }}
                      startIcon={
                        agentReadiness.isEnabling ? (
                          <CircularProgress
                            size={10}
                            sx={{ color: "inherit" }}
                          />
                        ) : undefined
                      }
                      sx={{
                        height: 28,
                        textTransform: "none",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        bgcolor: "#ff6600",
                        "&:hover": { bgcolor: "#e65c00" },
                        whiteSpace: "nowrap",
                      }}
                    >
                      {agentReadiness.isEnabling ? "Enabling…" : "Enable"}
                    </Button>
                  </Box>
                )}
                {agentReadiness.active ? (
                  <>
                    <TextField
                      autoFocus
                      multiline
                      minRows={3}
                      maxRows={8}
                      fullWidth
                      placeholder="What would you like the agent to do? e.g. Summarize this incident, look up the indicators, suggest next steps…"
                      value={askAgentText}
                      onChange={(e) => setAskAgentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          (e.metaKey || e.ctrlKey) &&
                          askAgentText.trim() &&
                          !askAgentSending &&
                          agentReadiness.active
                        ) {
                          e.preventDefault();
                          (async () => {
                            setAskAgentSending(true);
                            try {
                              await handleAddComment(
                                `@AIAgent ${askAgentText.trim()}${buildAskAgentContext()}`,
                              );
                              setAskAgentText("");
                              setAskAgentAnchor(null);
                              toast.success("Sent to the AI agent");
                            } finally {
                              setAskAgentSending(false);
                            }
                          })();
                        }
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          fontSize: "0.85rem",
                          bgcolor: "hsl(var(--background))",
                        },
                      }}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        mt: 1,
                      }}
                    >
                      {[
                        {
                          label: "Summarize",
                          prompt:
                            "Summarize this incident in a few short bullet points: what happened, who/what is involved, and the current status.",
                        },
                        {
                          label: "Investigate indicators",
                          prompt:
                            "Investigate every observable on this incident. Look up reputation, related incidents, and flag anything suspicious.",
                        },
                        {
                          label: "Suggest next steps",
                          prompt:
                            "Based on the current state of this incident, suggest the next concrete response steps in priority order.",
                        },
                        {
                          label: "Draft a response",
                          prompt:
                            "Draft a response message I can send to the reporter or affected user. Keep it clear, professional, and reassuring.",
                        },
                        {
                          label: "Assess severity",
                          prompt:
                            "Assess the severity and potential impact of this incident, and explain the reasoning behind the rating.",
                        },
                        {
                          label: "Find related incidents",
                          prompt:
                            "Look for past incidents that share observables, indicators, or patterns with this one and summarize the matches.",
                        },
                      ].map(({ label, prompt }) => (
                        <Chip
                          key={label}
                          label={label}
                          size="small"
                          onClick={() => setAskAgentText(prompt)}
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            bgcolor: "hsl(var(--muted) / 0.4)",
                            border: "1px solid hsl(var(--border))",
                            cursor: "pointer",
                            "&:hover": { bgcolor: "hsl(var(--muted) / 0.7)" },
                          }}
                        />
                      ))}
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mt: 1.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "hsl(var(--muted-foreground))",
                          fontSize: "0.7rem",
                        }}
                      >
                        ⌘/Ctrl + Enter to send
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small"
                          onClick={() => {
                            setAskAgentAnchor(null);
                          }}
                          sx={{
                            height: 32,
                            textTransform: "none",
                            color: "hsl(var(--muted-foreground))",
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={
                            !askAgentText.trim() ||
                            askAgentSending ||
                            !agentReadiness.active
                          }
                          onClick={async () => {
                            setAskAgentSending(true);
                            try {
                              await handleAddComment(
                                `@AIAgent ${askAgentText.trim()}${buildAskAgentContext()}`,
                              );
                              setAskAgentText("");
                              setAskAgentAnchor(null);
                              toast.success("Sent to the AI agent");
                            } finally {
                              setAskAgentSending(false);
                            }
                          }}
                          startIcon={
                            askAgentSending ? (
                              <CircularProgress
                                size={12}
                                sx={{ color: "inherit" }}
                              />
                            ) : (
                              <SendIcon size={14} />
                            )
                          }
                          sx={{
                            height: 32,
                            textTransform: "none",
                            fontWeight: 600,
                            bgcolor: "#ff6600",
                            "&:hover": { bgcolor: "#e65c00" },
                          }}
                        >
                          Send
                        </Button>
                      </Box>
                    </Box>
                  </>
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "flex-end",
                      mt: 1.5,
                    }}
                  >
                    <Button
                      size="small"
                      onClick={() => {
                        setAskAgentAnchor(null);
                      }}
                      sx={{
                        height: 32,
                        textTransform: "none",
                        color: "hsl(var(--muted-foreground))",
                      }}
                    >
                      Cancel
                    </Button>
                  </Box>
                )}
              </Popover>
            </Box>
            {/* Top row group (Refresh + Actions menu). */}
            <Box
              sx={{
                order: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Tooltip title="Refresh">
                <IconButton
                  size="small"
                  onClick={async () => {
                    setIsRefreshing(true);
                    await Promise.all([
                      loadIncident(false),
                      refetchAgentRuns(),
                    ]);
                    setIsRefreshing(false);
                  }}
                  disabled={loading || isRefreshing}
                  sx={{
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 1,
                    width: 32,
                    height: 32,
                  }}
                >
                  <RefreshIcon
                    size={20}
                    className={isRefreshing ? "animate-spin" : ""}
                  />
                </IconButton>
              </Tooltip>

              {/* Share Dialog */}
              <Dialog
                open={showShareDialog}
                onClose={() => setShowShareDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                  sx: {
                    bgcolor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 2,
                  },
                }}
              >
                <DialogTitle sx={{ pb: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("Share Incident")}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {t(
                      "Anyone with this link can view the incident without logging in.",
                    )}
                  </Typography>
                </DialogTitle>
                <DialogContent>
                  <Box sx={{ mt: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "hsl(var(--muted-foreground))",
                        mb: 0.5,
                        display: "block",
                      }}
                    >
                      Public link
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        p: 1.5,
                        borderRadius: 1.5,
                        bgcolor: "rgba(255,255,255,0.03)",
                        border: "1px solid hsl(var(--border))",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          flex: 1,
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          color: "hsl(var(--foreground))",
                          wordBreak: "break-all",
                          minWidth: 0,
                          userSelect: "all",
                        }}
                      >
                        {`${window.location.origin}/incidents/${incident?.id}?authorization=${publicAuthorization}&org=${userInfo?.active_org?.id || ""}`}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const url = `${window.location.origin}/incidents/${incident?.id}?authorization=${publicAuthorization}&org=${userInfo?.active_org?.id || ""}`;
                          navigator.clipboard.writeText(url);
                          toast.success("Link copied to clipboard");
                        }}
                        sx={{
                          flexShrink: 0,
                          textTransform: "none",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          "&:hover": {
                            borderColor: "hsl(var(--primary))",
                            color: "hsl(var(--primary))",
                          },
                        }}
                      >
                        Copy
                      </Button>
                    </Box>
                    {!publicAuthorization && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#fb923c", mt: 1, display: "block" }}
                      >
                        No public authorization token found for this incident.
                        The link may not work for unauthenticated users.
                      </Typography>
                    )}
                  </Box>
                </DialogContent>
              </Dialog>

              {!isPublicView && (
                <Tooltip title="Actions">
                  <IconButton
                    size="small"
                    onClick={(e) => setActionsMenuAnchor(e.currentTarget)}
                    sx={{
                      display: { xs: "none", sm: "inline-flex" },
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 1,
                      width: 32,
                      height: 32,
                    }}
                  >
                    <MoreVertIcon size={20} />
                  </IconButton>
                </Tooltip>
              )}
              <Menu
                anchorEl={actionsMenuAnchor}
                open={Boolean(actionsMenuAnchor)}
                onClose={() => setActionsMenuAnchor(null)}
                PaperProps={{
                  sx: {
                    bgcolor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    minWidth: 160,
                  },
                }}
              >
                {/* Share */}
                <MenuItem
                  onClick={() => {
                    setActionsMenuAnchor(null);
                    setShowShareDialog(true);
                  }}
                >
                  <LinkIcon size={16} style={{ marginRight: "8px" }} />
                  Share
                </MenuItem>
                {/* Refresh */}
                <MenuItem
                  onClick={async () => {
                    setActionsMenuAnchor(null);
                    setIsRefreshing(true);
                    await Promise.all([
                      loadIncident(false),
                      refetchAgentRuns(),
                    ]);
                    setIsRefreshing(false);
                  }}
                  disabled={loading || isRefreshing}
                >
                  <RefreshIcon
                    size={16}
                    style={{ marginRight: "8px" }}
                    className={isRefreshing ? "animate-spin" : ""}
                  />
                  Refresh
                </MenuItem>
                {/* Ask the AI agent */}
                <MenuItem
                  onClick={() => {
                    setAskAgentAnchor(actionsMenuAnchor);
                    setActionsMenuAnchor(null);
                  }}
                  disabled={!!primaryPointer}
                >
                  <AgentIcon size={16} style={{ marginRight: "8px" }} />
                  Ask the AI agent
                </MenuItem>
                <Divider />
                {/* Generate Report */}
                <MenuItem
                  onClick={() => {
                    setActionsMenuAnchor(null);
                    setShowReportDialog(true);
                  }}
                >
                  <DescriptionIcon size={16} style={{ marginRight: "8px" }} />
                  Generate Report
                </MenuItem>
                {/* Visit Source */}
                <Tooltip
                  title="No source URL recorded for this incident"
                  placement="left"
                >
                  <span>
                    <MenuItem disabled sx={{ width: "100%" }}>
                      <LinkIcon size={16} style={{ marginRight: "8px" }} />
                      Visit Source
                    </MenuItem>
                  </span>
                </Tooltip>
                <Divider />
                {/* Resync */}
                {(() => {
                  const resyncReason = getResyncBlockedReason(
                    incident,
                    isSaving,
                  );
                  const resyncDisabled = !!resyncReason;
                  const resyncItem = (
                    <MenuItem
                      disabled={resyncDisabled}
                      sx={{ width: "100%" }}
                      onClick={async () => {
                        setActionsMenuAnchor(null);
                        if (!incident?.id) return;
                        const source = incident.source || "";
                        setIsResyncing(true);
                        resyncState.add(incident.id);
                        const label = source
                          ? `Resyncing from ${source}…`
                          : "Resyncing…";
                        toast.success(label, { duration: 30000 });
                        try {
                          const preResult = await getDatastoreItem(
                            incident.id,
                            DATASTORE_CATEGORIES.INCIDENTS,
                            crossOrgId || undefined,
                          );
                          const previousEdited = preResult.item?.edited || 0;

                          const response = await fetch(
                            getApiUrl("/api/v1/apps/categories/run"),
                            {
                              method: "POST",
                              credentials: "include",
                              headers: {
                                "Content-Type": "application/json",
                                ...getAuthHeader(),
                                ...crossOrgHeaders,
                              },
                              body: JSON.stringify({
                                action: "get_ticket",
                                category: "cases",
                                fields: [{ key: "id", value: incident.id }],
                                app_name: source,
                              }),
                            },
                          );
                          const responseBody = await response
                            .json()
                            .catch(() => null);
                          const failureReason =
                            extractResyncFailureReason(responseBody);
                          if (!response.ok || responseBody?.success === false) {
                            toast.error(
                              failureReason
                                ? `Resync failed: ${failureReason}`
                                : "Resync failed",
                              { duration: 10000 },
                            );
                            setIsResyncing(false);
                            resyncState.remove(incident.id);
                            return;
                          }
                          // Poll every 5s for up to 30s checking if the item was updated
                          let pollCount = 0;
                          const pollInterval = setInterval(async () => {
                            pollCount++;
                            const postResult = await getDatastoreItem(
                              incident.id,
                              DATASTORE_CATEGORIES.INCIDENTS,
                              crossOrgId || undefined,
                            );
                            const newEdited = postResult.item?.edited || 0;
                            if (newEdited && newEdited !== previousEdited) {
                              clearInterval(pollInterval);
                              await loadIncident(false);
                              setIsResyncing(false);
                              resyncState.remove(incident.id);
                              toast.success("Resync complete — update found");
                            } else if (pollCount >= 6) {
                              clearInterval(pollInterval);
                              await loadIncident(false);
                              setIsResyncing(false);
                              resyncState.remove(incident.id);
                              toast.info(
                                "Resync complete — no changes detected",
                              );
                            }
                          }, 5000);
                        } catch {
                          toast.error("Resync failed");
                          setIsResyncing(false);
                          resyncState.remove(incident.id);
                        }
                      }}
                    >
                      <RefreshIcon size={16} style={{ marginRight: "8px" }} />
                      Resync
                    </MenuItem>
                  );
                  return resyncDisabled ? (
                    <Tooltip title={resyncReason} placement="left">
                      <span>{resyncItem}</span>
                    </Tooltip>
                  ) : (
                    resyncItem
                  );
                })()}
                {/* Forward */}
                <Tooltip
                  title="Forwarding is not yet available"
                  placement="left"
                >
                  <span>
                    <MenuItem
                      disabled
                      sx={{ width: "100%" }}
                      onClick={() => {
                        setActionsMenuAnchor(null);
                        setShowForwardDialog(true);
                        setForwardingAppsLoading(true);
                        fetch(getApiUrl("/api/v1/apps/authentication"), {
                          credentials: "include",
                          headers: { ...getAuthHeader(), ...crossOrgHeaders },
                        })
                          .then((r) => r.json())
                          .then((result) => {
                            const authData = result.data || result;
                            if (Array.isArray(authData)) {
                              const seen = new Set<string>();
                              const apps = authData
                                .filter(
                                  (a: any) =>
                                    a.app?.name && a.validation?.valid,
                                )
                                .filter((a: any) => {
                                  if (seen.has(a.app.name)) return false;
                                  seen.add(a.app.name);
                                  return true;
                                })
                                .map((a: any) => {
                                  const rawCategories =
                                    a.app?.categories ??
                                    a.categories ??
                                    a.app?.category ??
                                    a.category ??
                                    [];
                                  const categories = Array.isArray(
                                    rawCategories,
                                  )
                                    ? rawCategories
                                    : typeof rawCategories === "string"
                                      ? [rawCategories]
                                      : typeof rawCategories === "object" &&
                                          rawCategories !== null
                                        ? Object.keys(rawCategories)
                                        : [];
                                  return {
                                    id: a.app.name,
                                    name: (a.app.name || "")
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (c: string) =>
                                        c.toUpperCase(),
                                      ),
                                    large_image: a.app.large_image || "",
                                    categories,
                                  };
                                });
                              setForwardingApps(apps);
                            }
                          })
                          .catch(() => setForwardingApps([]))
                          .finally(() => setForwardingAppsLoading(false));
                      }}
                    >
                      <ForwardIcon size={16} style={{ marginRight: "8px" }} />
                      Forward
                    </MenuItem>
                  </span>
                </Tooltip>
                <Divider />
                {/* Merge */}
                <Tooltip
                  title={isSaving ? "Saving in progress — please wait" : ""}
                  placement="left"
                  disableHoverListener={!isSaving}
                >
                  <span>
                    <MenuItem
                      disabled={isSaving}
                      sx={{ width: "100%" }}
                      onClick={() => {
                        setActionsMenuAnchor(null);
                        setShowMergeDialog(true);
                      }}
                    >
                      <CallMergeIcon size={16} style={{ marginRight: "8px" }} />
                      Merge Into…
                    </MenuItem>
                  </span>
                </Tooltip>
                {/* Move to Tenant */}
                <Tooltip
                  title={isSaving ? "Saving in progress — please wait" : ""}
                  placement="left"
                  disableHoverListener={!isSaving}
                >
                  <span>
                    <MenuItem
                      disabled={isSaving}
                      sx={{ width: "100%" }}
                      onClick={() => {
                        setActionsMenuAnchor(null);
                        setMoveTargetOrgId("");
                        const sourceOrgId =
                          crossOrgId || userInfo?.active_org?.id || "";
                        const initial = new Set<string>();
                        if (sourceOrgId) initial.add(sourceOrgId);
                        for (const so of sharedOrgs) initial.add(so.id);
                        setMoveSelectedOrgIds(initial);
                        setShowMoveDialog(true);
                      }}
                    >
                      <ForwardIcon size={16} style={{ marginRight: "8px" }} />
                      Move to Tenant…
                    </MenuItem>
                  </span>
                </Tooltip>
                {!isResolved && <Divider />}
                {!isResolved && (
                  <Tooltip
                    title={isSaving ? "Saving in progress — please wait" : ""}
                    placement="left"
                    disableHoverListener={!isSaving}
                  >
                    <span>
                      <MenuItem
                        disabled={isSaving}
                        sx={{ width: "100%" }}
                        onClick={() => {
                          setActionsMenuAnchor(null);
                          setShowResolveDialog(true);
                        }}
                      >
                        <CheckCircleIcon
                          size={16}
                          style={{ marginRight: "8px", color: "#22c55e" }}
                        />
                        <Box component="span" sx={{ color: "#22c55e" }}>
                          Resolve
                        </Box>
                      </MenuItem>
                    </span>
                  </Tooltip>
                )}
              </Menu>

              <IncidentReportDialog
                open={showReportDialog}
                onClose={() => setShowReportDialog(false)}
                overrideOrgId={crossOrgId || undefined}
                generatedBy={currentUsername}
                buildInput={(): GenerateReportInput => ({
                  incidentId: incident?.id || id || "",
                  title: editedTitle || incident?.title || "Untitled incident",
                  description: editedMessage || "",
                  source: incident?.source,
                  severity: editedSeverity || incident?.severity,
                  status: editedStatus || incident?.status,
                  assignee: editedAssignee || incident?.assignee || null,
                  created: incident?.created,
                  edited: incident?.edited,
                  tlp: editedTlp || incident?.tlp,
                  pap: incident?.pap,
                  labels: editedLabels,
                  references: editedReferences,
                  customFields: editedCustomFields,
                  observables: editedObservables,
                  enrichments,
                  tasks: visibleTasks,
                  activity: activity as any,
                  agentRuns: (agentRuns || []) as any,
                  rawOCSF: incident?.rawOCSF,
                })}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Main content with Activity sidebar */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          gap: 2,
          mt: 2,
        }}
      >
        {/* Left content area */}
        <Box sx={{ flex: 1, minWidth: 0, order: { xs: 1, lg: 0 } }}>
          {/* Modern Pill Tabs — hidden in the Simple view */}
          <Box
            sx={{
              display: activeTab === 7 ? "none" : "flex",

              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
              overflowX: { xs: "auto", md: "visible" },
              pb: { xs: 0.5, md: 0 },
              "&::-webkit-scrollbar": { display: "none" },
              scrollbarWidth: { xs: "none", md: "auto" },
            }}
          >
            <SegmentedControl
              layoutId="incident-detail-tabs"
              ariaLabel="Incident sections"
              value={String(activeTab)}
              onChange={(v) => setActiveTab(Number(v))}
              options={[
                {
                  value: "7",
                  label: "Simple",
                  dataTour: "incident-tab-simple",
                },
                {
                  value: "0",
                  label: "Detailed",
                  dataTour: "incident-tab-details",
                },
                {
                  value: "1",
                  label: "Tasks",
                  dataTour: "incident-tab-tasks",
                  count:
                    visibleTasks.length > 0 ? visibleTasks.length : undefined,
                  title:
                    visibleTasks.length > 0
                      ? `${visibleTasks.filter((t) => t.completed).length}/${visibleTasks.length} completed`
                      : undefined,
                },
                {
                  value: "2",
                  label: "Observables",
                  dataTour: "incident-tab-observables",
                  count:
                    visibleObservablesCount > 0
                      ? visibleObservablesCount
                      : undefined,
                },
                {
                  value: "3",
                  label: "Correlations",
                  dataTour: "incident-tab-correlations",
                  count:
                    visibleCorrelations.length > 0
                      ? visibleCorrelations.length
                      : undefined,
                },
              ]}
            />

            {/* Right tab group island: Source → Translation → OCSF */}
            <Box
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                gap: 0.75,
                flexShrink: 0,
              }}
            >
              <SegmentedControl
                layoutId="incident-source-tabs"
                ariaLabel="Source data"
                value={String(
                  activeTab === 6
                    ? 6
                    : activeTab === 5
                      ? 5
                      : activeTab === 4
                        ? 4
                        : -1,
                )}
                onChange={(v) => {
                  const next = Number(v);
                  if (next === 4) {
                    if (incident?.rawOCSF) {
                      const severityOption = severityOptions.find(
                        (s) => s.value === editedSeverity,
                      );
                      const statusLabel =
                        editedStatus === "new"
                          ? "New"
                          : editedStatus === "in_progress"
                            ? "In Progress"
                            : editedStatus === "on_hold"
                              ? "On Hold"
                              : "Resolved";
                      const existingFindingInfo =
                        incident.rawOCSF?.finding_info_list?.[0] ||
                        (incident.rawOCSF as any)?.finding_info;
                      const liveSnapshot = {
                        ...incident.rawOCSF,
                        desc: editedMessage || editedTitle,
                        severity_id: severityOption?.id || 3,
                        severity: severityOption?.label || "Medium",
                        status: statusLabel,
                        assignee: editedAssignee.trim() || "",
                        types: editedLabels,
                        observables: editedObservables,
                        tasks,
                        activity,
                        finding_info_list: [
                          {
                            ...existingFindingInfo,
                            title: editedTitle,
                            references: editedReferences,
                            src_url: editedReferences[0] || "",
                          },
                        ],
                        metadata: {
                          ...incident.rawOCSF.metadata,
                          extensions: {
                            ...incident.rawOCSF.metadata?.extensions,
                            custom_attributes: {
                              ...incident.rawOCSF.metadata?.extensions
                                ?.custom_attributes,
                              tlp: editedTlp,
                              assignee: editedAssignee.trim() || "",
                              customFields: editedCustomFields,
                            },
                          },
                        },
                        enrichments: enrichments,
                      };
                      setRawJsonText(JSON.stringify(liveSnapshot, null, 2));
                    }
                  }
                  setActiveTab(next);
                }}
                options={[
                  ...(unmappedOriginal
                    ? [
                        {
                          value: "6",
                          label: "Original",
                          title: "The raw data before any translation",
                        },
                      ]
                    : []),
                  ...(incidentFileRef
                    ? [
                        {
                          value: "5",
                          label: "Translation",
                          title:
                            "The translation file that maps original data to OCSF",
                        },
                      ]
                    : []),
                  {
                    value: "4",
                    label: "OCSF",
                    title: "The normalized OCSF Incident Finding output",
                  },
                ]}
              />
            </Box>
          </Box>

          {/* Tab Content */}
          <Box
            sx={
              isPublicView
                ? {
                    pointerEvents: "none",
                    "& input, & textarea, & select, & button:not([data-public-ok])":
                      { opacity: 0.7 },
                  }
                : {}
            }
          >
            {activeTab === 7 &&
              (() => {
                const simpleHasEmail =
                  !!incident &&
                  isEmailContent(
                    editedMessage || "",
                    rawDescriptionHtml || "",
                    incident.rawOCSF,
                    incident,
                  );
                const simpleEmailThread = simpleHasEmail ? (
                  <EmailThreadPanel
                    descriptionHtml={rawDescriptionHtml || ""}
                    descriptionText={editedMessage || ""}
                    rawOCSF={incident?.rawOCSF}
                    defaultCollapsed={true}
                    onReply={(to, subject, body) => {
                      setShowForwardDialog(true);
                    }}
                    onForward={() => setShowForwardDialog(true)}
                  />
                ) : null;

                const simpleNarrative = (
                  <MarkdownDescriptionEditor
                    key={incident?.id}
                    value={editedMessage}
                    onCommit={setEditedMessage}
                    placeholder="Add a description... Markdown supported, paste images directly."
                    readOnly={isPublicView}
                  />
                );

                // Overview block at the top of the center column: source icon + title,
                // then the three fields that matter most (severity, status, assignee)
                // plus the incident timestamp, all aligned with the icon rather than indented.
                const simpleOverview = (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      mb: 4,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          mt: 0.75,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 1.5,
                          overflow: "hidden",
                        }}
                      >
                        {sourceAppImage ? (
                          <img
                            src={sourceAppImage}
                            alt={incident?.source || ""}
                            style={{
                              width: 30,
                              height: 30,
                              objectFit: "contain",
                              borderRadius: 6,
                            }}
                          />
                        ) : (
                          <TaskAltIcon
                            size={24}
                            style={{ color: severityColors[editedSeverity] }}
                          />
                        )}
                      </Box>
                      <SimpleIncidentTitle
                        title={editedTitle}
                        onCommit={(next) => {
                          if (!isPublicView) setEditedTitle(next);
                        }}
                        readOnly={isPublicView}
                      />
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2.5,
                        flexWrap: "wrap",
                        ...(isPublicView && { pointerEvents: "none" }),
                      }}
                    >
                      <FormControl size="small" variant="standard">
                        <Select
                          value={editedSeverity}
                          onChange={(e) => setEditedSeverity(e.target.value)}
                          disableUnderline
                          sx={{
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: severityColors[editedSeverity],
                            textTransform: "capitalize",
                            "& .MuiSelect-select": { py: 0.25, pr: 3 },
                            "& .MuiSvgIcon-root": {
                              color: severityColors[editedSeverity],
                              fontSize: 16,
                            },
                          }}
                          MenuProps={{
                            PaperProps: {
                              sx: {
                                bgcolor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                              },
                            },
                          }}
                        >
                          <MenuItem value="critical">Critical</MenuItem>
                          <MenuItem value="high">High</MenuItem>
                          <MenuItem value="medium">Medium</MenuItem>
                          <MenuItem value="low">Low</MenuItem>
                          <MenuItem value="informational">
                            Informational
                          </MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small" variant="standard">
                        <Select
                          value={editedStatus}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "resolved") {
                              setShowResolveDialog(true);
                              return;
                            }
                            setEditedStatus(val);
                          }}
                          disableUnderline
                          sx={{
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color:
                              statusConfig[editedStatus]?.color || "#f59e0b",
                            "& .MuiSelect-select": { py: 0.25, pr: 3 },
                            "& .MuiSelect-icon": {
                              color:
                                statusConfig[editedStatus]?.color || "#f59e0b",
                              fontSize: 16,
                            },
                          }}
                          MenuProps={{
                            PaperProps: {
                              sx: {
                                bgcolor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                              },
                            },
                          }}
                          renderValue={(val) =>
                            statusConfig[val]?.label ||
                            String(val).replace(/_/g, " ")
                          }
                        >
                          {Object.entries(statusConfig)
                            .filter(([key]) => key !== "merged")
                            .map(([key, cfg]) => {
                              const isDisabled =
                                key === "on_hold" || key === "escalated";
                              return (
                                <MenuItem
                                  key={key}
                                  value={key}
                                  disabled={isDisabled}
                                  sx={{
                                    fontSize: "0.8rem",
                                    gap: 1,
                                    opacity: isDisabled ? 0.4 : 1,
                                  }}
                                >
                                  <cfg.icon size={14} color={cfg.color} />
                                  {cfg.label}
                                </MenuItem>
                              );
                            })}
                        </Select>
                      </FormControl>
                      <FormControl size="small" variant="standard">
                        <Select
                          value={editedAssignee || ""}
                          onChange={(e) => setEditedAssignee(e.target.value)}
                          displayEmpty
                          disableUnderline
                          disabled={usersLoading}
                          sx={{
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: isAIAssignee(editedAssignee)
                              ? "#22c55e"
                              : editedAssignee
                                ? "hsl(var(--foreground))"
                                : "hsl(var(--muted-foreground))",
                            "& .MuiSelect-select": { py: 0.25, pr: 3 },
                            "& .MuiSvgIcon-root": {
                              color: "hsl(var(--muted-foreground))",
                              fontSize: 16,
                            },
                          }}
                          MenuProps={{
                            PaperProps: {
                              sx: {
                                bgcolor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                              },
                            },
                          }}
                          renderValue={(value) =>
                            isAIAssignee(value as string)
                              ? "AI Agent"
                              : (value as string) || "Unassigned"
                          }
                        >
                          <MenuItem value="">Unassigned</MenuItem>
                          <MenuItem value="AI Agent">AI Agent</MenuItem>
                          {users.map((user) => (
                            <MenuItem key={user.id} value={user.username}>
                              {user.username}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      {!!incident?.created && (
                        <Tooltip
                          title={formatTimestamp(incident.created)}
                          placement="top"
                        >
                          <Typography
                            sx={{
                              fontSize: "0.78rem",
                              color: "hsl(var(--muted-foreground))",
                              cursor: "default",
                            }}
                          >
                            {formatRelativeTime(
                              normalizeToMs(incident.created),
                            )}
                          </Typography>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                );

                const simpleTasks = (
                  <SimpleTasksView
                    tasks={visibleTasks}
                    onToggleTask={handleToggleTask}
                    onUpdateTaskTitle={handleUpdateTaskTitle}
                    onUpdateTaskDescription={handleUpdateTaskDescription}
                    onUpdateTaskCategory={handleUpdateTaskCategory}
                    onUpdateTaskAssignee={handleUpdateTaskAssignee}
                    onDeleteTask={handleDeleteTask}
                    onAddTask={(title, category) =>
                      handleAddTask(title, category)
                    }
                    expandedTaskIds={simpleExpandedTaskIds}
                    onToggleTaskExpanded={toggleSimpleTaskExpanded}
                    readOnly={isPublicView}
                  />
                );

                // Manual observables plus automated enrichments, deduplicated by
                // type+value (case-insensitive) so the simple view matches the count
                // shown in the Overview rail.
                const simpleObservableRows = (() => {
                  const rows: Array<{ type: string; value: string }> = [
                    ...editedObservables
                      .filter((observable) => !observable.archived)
                      .map((observable) => ({
                        type: observable.type || "unknown",
                        value: observable.value || "",
                      })),
                    ...enrichments.map((enr) => ({
                      type: enr.type || "unknown",
                      value: enr.value || enr.data || "",
                    })),
                  ];
                  const seen = new Set<string>();
                  return rows.filter((row) => {
                    if (!row.value) return false;
                    if (isObservableIgnored(row.type, row.value)) return false;
                    const key = `${row.type.toLowerCase()}::${row.value.toLowerCase()}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                })();

                const simpleObservables = (
                  <Box>
                    {simpleObservableRows.map((observable, index) => (
                      <Box
                        key={`${observable.type}-${observable.value}-${index}`}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          py: 0.8,
                        }}
                      >
                        <Typography
                          sx={{
                            width: 110,
                            flexShrink: 0,
                            color: "hsl(var(--muted-foreground))",
                            fontSize: "0.72rem",
                            textTransform: "uppercase",
                          }}
                        >
                          {observable.type}
                        </Typography>
                        <Typography
                          sx={{
                            minWidth: 0,
                            flex: 1,
                            fontFamily: "monospace",
                            fontSize: "0.82rem",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {observable.value}
                        </Typography>
                        <ObservableLookupMenu
                          type={observable.type}
                          value={observable.value}
                        />
                      </Box>
                    ))}
                    {simpleObservableRows.length === 0 && (
                      <Typography
                        sx={{
                          color: "hsl(var(--muted-foreground))",
                          fontSize: "0.85rem",
                        }}
                      >
                        No observables found.
                      </Typography>
                    )}
                    <Button
                      size="small"
                      onClick={() => setActiveTab(2)}
                      sx={{
                        mt: 1,
                        px: 0,
                        textTransform: "none",
                        fontSize: "0.78rem",
                      }}
                    >
                      Manage observables
                    </Button>
                  </Box>
                );

                const simpleCorrelations = correlationsLoading ? (
                  <CircularProgress size={20} />
                ) : correlationRows.length === 0 ? (
                  <Typography
                    sx={{
                      color: "hsl(var(--muted-foreground))",
                      fontSize: "0.85rem",
                    }}
                  >
                    No correlations found.
                  </Typography>
                ) : (
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    {correlationRows.map((correlation, index) => (
                      <CorrelationRow
                        key={correlation.key || index}
                        correlation={correlation}
                        currentIncidentId={id}
                        ignoredObservables={ignoredObs}
                        compact
                      />
                    ))}
                  </Box>
                );

                // Custom fields: defined org fields plus any keys present on the
                // incident data without a definition. Rendered only when there is
                // something to show.
                const simpleCustomFieldDefs = (() => {
                  const definedFieldKeys = new Set(
                    customFields.map((f) => f.key),
                  );
                  const dynamicFields: CustomField[] = Object.keys(
                    editedCustomFields,
                  )
                    .filter((k) => !definedFieldKeys.has(k))
                    .map((key) => ({
                      name: key
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase()),
                      key,
                      type:
                        typeof editedCustomFields[key] === "boolean"
                          ? ("boolean" as const)
                          : typeof editedCustomFields[key] === "number"
                            ? ("number" as const)
                            : ("text" as const),
                      required: false,
                    }));
                  return [...customFields, ...dynamicFields];
                })();

                const simpleCustomFields =
                  simpleCustomFieldDefs.length > 0 ? (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          md: "repeat(2, 1fr)",
                        },
                        columnGap: 2.5,
                        rowGap: 2.5,
                      }}
                    >
                      {simpleCustomFieldDefs.map((field) =>
                        renderCustomField(field),
                      )}
                    </Box>
                  ) : null;

                const simpleContentsActions = isPublicView ? null : (
                  <>
                    <Tooltip title="Share access">
                      <IconButton
                        size="small"
                        onClick={openSimpleShare}
                        disabled={simpleShareLoading}
                        aria-label="Share access"
                        sx={{
                          width: 32,
                          height: 32,
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        <PeopleIcon size={16} />
                      </IconButton>
                    </Tooltip>
                    {/* Same actions menu as the detailed header, so both stay identical */}
                    <Tooltip title="Actions">
                      <IconButton
                        size="small"
                        onClick={(e) => setActionsMenuAnchor(e.currentTarget)}
                        aria-label="Actions"
                        sx={{
                          width: 32,
                          height: 32,
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        <MoreVertIcon size={18} />
                      </IconButton>
                    </Tooltip>
                    <Button
                      size="small"
                      onClick={() => setActiveTab(0)}
                      sx={{
                        minHeight: 32,
                        px: 1,
                        ml: "auto",
                        textTransform: "none",
                        fontSize: "0.78rem",
                        color: "hsl(var(--muted-foreground))",
                      }}
                    >
                      Detailed view
                    </Button>
                  </>
                );

                return (
                  <>
                    <SimpleCaseLayout
                      narrativeLabel="Description"
                      overview={simpleOverview}
                      emailThread={simpleEmailThread}
                      emailThreadCount={
                        simpleHasEmail
                          ? getEmailMessageCount(
                              editedMessage || "",
                              rawDescriptionHtml || "",
                              incident.rawOCSF,
                              incident,
                            )
                          : undefined
                      }
                      narrative={simpleNarrative}
                      timeline={renderTimelinePanel("simple")}
                      timelineActions={renderTimelineActionsChip(true)}
                      tasks={simpleTasks}
                      customFields={simpleCustomFields}
                      customFieldsCount={simpleCustomFieldDefs.length}
                      observables={simpleObservables}
                      correlations={simpleCorrelations}
                      contentsActions={simpleContentsActions}
                      taskItems={visibleTasks}
                      observableCount={visibleObservablesCount}
                      correlationCount={visibleCorrelations.length}
                      relatedIncidents={relatedIncidents.linked}
                      resolution={(() => {
                        const statusDetail = String(
                          (incident.rawOCSF as any)?.status_detail || "",
                        ).trim();
                        const isResolved =
                          (
                            editedStatus ||
                            incident.status ||
                            ""
                          ).toLowerCase() === "resolved";
                        if (!isResolved || !statusDetail) return undefined;
                        const sepIndex = statusDetail.indexOf(":");
                        const rawReason =
                          sepIndex >= 0
                            ? statusDetail.slice(0, sepIndex).trim()
                            : statusDetail;
                        const notes =
                          sepIndex >= 0
                            ? statusDetail.slice(sepIndex + 1).trim()
                            : "";
                        const reasonLabel =
                          RESOLUTION_REASONS.find((r) => r.value === rawReason)
                            ?.label || rawReason;
                        const statusEvent = [...activity]
                          .reverse()
                          .find((a) => a.type === "status");
                        return {
                          reasonLabel,
                          notes: notes || undefined,
                          resolvedBy: statusEvent?.user || undefined,
                          resolvedAt: statusEvent?.timestamp || undefined,
                        };
                      })()}
                    />
                    {simpleShareItem && (
                      <ShareAccessModal
                        open={simpleShareOpen}
                        onClose={() => setSimpleShareOpen(false)}
                        resourceType="key"
                        resourceName={
                          editedTitle || incident?.title || simpleShareItem.key
                        }
                        parentName={
                          simpleShareItem.category ||
                          DATASTORE_CATEGORIES.INCIDENTS
                        }
                        initialRBAC={simpleShareItem.rbac}
                        onSave={handleSaveSimpleShare}
                      />
                    )}
                  </>
                );
              })()}
            {activeTab === 1 && (
              /* Tasks Tab — uses the exact same kanban as the simplified view (/incidents-simple) */
              <TaskKanbanBoard
                tasks={visibleTasks}
                onTasksChange={setTasks}
                incidentId={id || "new"}
                currentUser={currentUsername || "You"}
                highlightTaskId={flashedTaskId}
              />
            )}

            {/* Details Tab — kept mounted (just hidden) when other tabs are active
          so local UI state inside it (e.g. EmailThreadPanel collapsed/expanded,
          description view mode) survives a tab switch. */}
            <Box sx={{ display: activeTab === 0 ? "block" : "none" }}>
              {(() => {
                const hasEmail =
                  !!incident &&
                  isEmailContent(
                    editedMessage || "",
                    rawDescriptionHtml || "",
                    incident.rawOCSF,
                    incident,
                  );
                const descriptionBody = (
                  <>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        {hasHtmlDescription && !isEditingDescription && (
                          <Box sx={{ display: "flex", gap: 0.25 }}>
                            {(["readable", "raw"] as const).map((view) => (
                              <Chip
                                key={view}
                                label={
                                  view === "readable"
                                    ? "Clean"
                                    : view.charAt(0).toUpperCase() +
                                      view.slice(1)
                                }
                                size="small"
                                variant="outlined"
                                onClick={() => setDescriptionView(view)}
                                sx={{
                                  height: 20,
                                  fontSize: "0.65rem",
                                  cursor: "pointer",
                                  bgcolor: "transparent",
                                  borderColor:
                                    descriptionView === view
                                      ? "rgba(255, 102, 0, 0.5)"
                                      : "rgba(255,255,255,0.12)",
                                  color:
                                    descriptionView === view
                                      ? "#ff6600"
                                      : "text.secondary",
                                  "&:hover": {
                                    bgcolor: "rgba(255,255,255,0.05)",
                                  },
                                }}
                              />
                            ))}
                          </Box>
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() =>
                          setIsEditingDescription(!isEditingDescription)
                        }
                        sx={{
                          color: isEditingDescription
                            ? "#FF6600"
                            : "text.secondary",
                          "&:hover": { color: "#FF6600" },
                        }}
                      >
                        {isEditingDescription ? (
                          <CheckCircleIcon size={16} />
                        ) : (
                          <EditIcon size={16} />
                        )}
                      </IconButton>
                    </Box>
                    {isEditingDescription ? (
                      <Box sx={{ maxHeight: 350, overflow: "auto" }}>
                        <MentionInput
                          value={editedMessage}
                          onChange={setEditedMessage}
                          fullWidth
                          multiline
                          minRows={4}
                          maxRows={12}
                          placeholder="Add a description... (type @ to mention)"
                          size="small"
                          sx={inputSx}
                        />
                      </Box>
                    ) : descriptionView === "rendered" && hasHtmlDescription ? (
                      <Box
                        sx={{
                          p: 1.5,
                          bgcolor: (t) =>
                            t.palette.mode === "dark"
                              ? "rgba(255, 255, 255, 0.95)"
                              : "rgba(255, 255, 255, 1)",
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          minHeight: 120,
                          maxHeight: 450,
                          overflow: "auto",
                          color: "text.primary",
                          "& img": { maxWidth: "100%", height: "auto" },
                          "& a": {
                            color: "primary.main",
                            textDecoration: "underline",
                          },
                          "& table": {
                            borderCollapse: "collapse",
                            maxWidth: "100%",
                          },
                          "& td, & th": { padding: "4px 8px" },
                          "& *": { maxWidth: "100%", boxSizing: "border-box" },
                          fontSize: "0.875rem",
                          lineHeight: 1.6,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: sanitizedDescriptionHtml,
                        }}
                      />
                    ) : descriptionView === "readable" ||
                      (descriptionView === "rendered" &&
                        !hasHtmlDescription) ? (
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: "hsl(var(--input))",
                          borderRadius: 1,
                          border: "1px solid hsl(var(--border))",
                          minHeight: 120,
                          maxHeight: 450,
                          overflow: "auto",
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            color: "text.primary",
                            whiteSpace: "pre-wrap",
                            fontSize: "0.85rem",
                            lineHeight: 1.75,
                            letterSpacing: "0.01em",
                          }}
                        >
                          {(() => {
                            if (hasHtmlDescription) {
                              const tmp = document.createElement("div");
                              tmp.innerHTML = sanitizedDescriptionHtml;
                              tmp
                                .querySelectorAll("br")
                                .forEach((el) => el.replaceWith("\n"));
                              tmp
                                .querySelectorAll(
                                  "p, div, tr, li, h1, h2, h3, h4, h5, h6",
                                )
                                .forEach((el) => {
                                  el.prepend(document.createTextNode("\n"));
                                  el.append(document.createTextNode("\n"));
                                });
                              const text = (tmp.textContent || "")
                                .replace(/\n{3,}/g, "\n\n")
                                .trim();
                              return text || "No description.";
                            }
                            return editedMessage || "No description.";
                          })()}
                        </Typography>
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          p: 1.5,
                          bgcolor: "hsl(var(--input))",
                          borderRadius: 1,
                          border: "1px solid hsl(var(--border))",
                          minHeight: 120,
                          maxHeight: 350,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          cursor: "pointer",
                          "&:hover": {
                            borderColor: "hsl(var(--muted-foreground) / 0.4)",
                          },
                        }}
                        onClick={() => setIsEditingDescription(true)}
                      >
                        {editedMessage ? (
                          <Typography
                            variant="body2"
                            sx={{
                              color: "text.primary",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {editedMessage}
                          </Typography>
                        ) : (
                          <Typography
                            variant="body2"
                            sx={{ color: "text.disabled", fontStyle: "italic" }}
                          >
                            No description. Click to add one.
                          </Typography>
                        )}
                      </Box>
                    )}
                  </>
                );

                return (
                  /* Details Tab */
                  <Box
                    sx={{
                      display: "grid",
                      // Two columns on desktop: narrative + timeline on the left,
                      // metadata on the right. Stacks on smaller viewports.
                      gridTemplateColumns: {
                        xs: "1fr",
                        lg: "minmax(0, 1fr) 360px",
                      },
                      gap: { xs: 2, lg: 3 },
                      alignItems: "start",
                    }}
                  >
                    {/* ============ LEFT: Description (when no email), Email thread, Timeline ============
              When the incident IS an email thread, we move the Description to
              the right column (collapsed by default) so the parsed thread
              becomes the primary narrative on the left. */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      {/* Email Thread Panel — shown when email content is detected */}
                      {hasEmail && (
                        <Box data-tour="incident-email-thread">
                          <EmailThreadPanel
                            descriptionHtml={rawDescriptionHtml || ""}
                            descriptionText={editedMessage || ""}
                            rawOCSF={incident.rawOCSF}
                            onReply={(to, subject, body) => {
                              // Use the existing forward/send mechanism via Singul
                              const sendPayload = {
                                action: "send_message",
                                category: "cases",
                                key: incident.id,
                                body: {
                                  ...(incident.rawOCSF || {}),
                                  reply_to: to,
                                  reply_subject: subject,
                                  reply_body: body,
                                },
                                fields: {
                                  to,
                                  subject,
                                  body,
                                },
                              };
                              // Open forward dialog to pick which email tool to send via
                              setShowForwardDialog(true);
                            }}
                            onForward={() => setShowForwardDialog(true)}
                          />
                        </Box>
                      )}

                      {/* Description Section — always rendered so analysts have both Description and Email */}
                      <Box data-tour="incident-description">
                        <Section
                          title="Description"
                          icon={DescriptionIcon}
                          defaultOpen={!hasEmail}
                          storageKey="shuffle-incident-description-open"
                        >
                          {descriptionBody}
                        </Section>
                      </Box>

                      {/* Inline Timeline — the heart of the Details tab. Renders the same
              comment input + unified feed as the right sidebar, but styled
              with a vertical rail so the chronology reads at a glance. */}
                      <Box
                        sx={
                          isPublicView ? { pointerEvents: "none" } : undefined
                        }
                      >
                        <IncidentSection
                          title="Timeline"
                          icon={HistoryIcon}

                          open={!timelineCollapsed}
                          onOpenChange={(o) => setTimelineCollapsed(!o)}
                          badge={renderTimelineBadge()}
                          actions={renderTimelineActionsChip(false)}
                          bodyPadded={false}
                          dataTour="incident-activity-feed"
                        >
                          {renderTimelinePanel("inline")}
                        </IncidentSection>
                      </Box>
                    </Box>

                    {/* ============ RIGHT: Metadata column ============ */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      {/* Description on the right — only when an email thread occupies
              the left column. Collapsed by default; users open it for the
              raw / readable / rendered views without losing focus on the
              parsed thread. */}
                      {/* Description hidden entirely when an Email Thread is present. */}

                      {/* Metadata Section */}
                      <Section
                        title="Metadata"
                        icon={DescriptionIcon}
                        defaultOpen={false}
                      >
                        <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              minWidth: 0,
                            }}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary" }}
                              >
                                ID
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: "monospace",
                                  fontSize: "0.75rem",
                                  wordBreak: "break-all",
                                }}
                              >
                                {incident.id}
                              </Typography>
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              minWidth: 0,
                            }}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary" }}
                              >
                                Source
                              </Typography>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.75,
                                  cursor: incident.source
                                    ? "pointer"
                                    : "default",
                                  borderRadius: 1,
                                  "&:hover": incident.source
                                    ? { bgcolor: "rgba(255,255,255,0.05)" }
                                    : {},
                                  mx: -0.5,
                                  px: 0.5,
                                  py: 0.25,
                                }}
                                onClick={() => {
                                  if (incident.source) {
                                    openApp(incident.source);
                                  }
                                }}
                              >
                                {sourceAppImage && (
                                  <img
                                    src={sourceAppImage}
                                    alt={incident.source || ""}
                                    style={{
                                      width: 18,
                                      height: 18,
                                      objectFit: "contain",
                                      borderRadius: 4,
                                    }}
                                  />
                                )}
                                <Typography
                                  variant="body2"
                                  sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    color: incident.source
                                      ? "#06b6d4"
                                      : undefined,
                                  }}
                                >
                                  {incident.source || (
                                    <Typography
                                      component="span"
                                      variant="body2"
                                      sx={{
                                        color: "text.disabled",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      Unknown
                                    </Typography>
                                  )}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              minWidth: 0,
                            }}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary" }}
                              >
                                TLP
                              </Typography>
                              <FormControl
                                size="small"
                                variant="standard"
                                fullWidth
                              >
                                <Select
                                  value={editedTlp}
                                  onChange={(e) => setEditedTlp(e.target.value)}
                                  disableUnderline
                                  sx={{
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    color:
                                      tlpLevels.find(
                                        (t) => t.label === editedTlp,
                                      )?.color || "#f59e0b",
                                    "& .MuiSelect-select": {
                                      py: 0.25,
                                      px: 0.5,
                                    },
                                    "& .MuiSelect-icon": { fontSize: 16 },
                                  }}
                                >
                                  {tlpLevels.map((opt) => (
                                    <MenuItem
                                      key={opt.value}
                                      value={opt.label}
                                      sx={{ fontSize: "0.8rem" }}
                                    >
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 1,
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            bgcolor: opt.color,
                                            border:
                                              opt.color === "#ffffff"
                                                ? "1px solid rgba(255,255,255,0.3)"
                                                : "none",
                                          }}
                                        />
                                        {opt.label}
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              minWidth: 0,
                            }}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary" }}
                              >
                                Created
                              </Typography>
                              <Typography variant="body2">
                                {incident.created}
                              </Typography>
                            </Box>
                          </Box>
                          {incident.edited && (
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                minWidth: 0,
                              }}
                            >
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{ color: "text.secondary" }}
                                >
                                  Last Updated
                                </Typography>
                                <Typography variant="body2">
                                  {incident.edited}
                                </Typography>
                              </Box>
                            </Box>
                          )}
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              minWidth: 0,
                            }}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary" }}
                              >
                                Age
                              </Typography>
                              <Typography variant="body2">
                                {metrics?.age}
                              </Typography>
                            </Box>
                          </Box>
                          {incident?.rawOCSF?.shuffle_execution_id && (
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                minWidth: 0,
                              }}
                            >
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{ color: "text.secondary" }}
                                >
                                  Original ingestion execution
                                </Typography>
                                <Typography
                                  variant="body2"
                                  onClick={async () => {
                                    const target = getShuffleCoreWorkflowUrl(
                                      incident.rawOCSF.shuffle_execution_id,
                                      {
                                        execution_id:
                                          incident.rawOCSF.shuffle_execution_id,
                                      },
                                    );
                                    await navigateToShuffleCore(target, {
                                      newTab: true,
                                    });
                                  }}
                                  sx={{
                                    color: "#06b6d4",
                                    cursor: "pointer",
                                    fontFamily: "monospace",
                                    fontSize: "0.75rem",
                                    wordBreak: "break-all",
                                    "&:hover": { textDecoration: "underline" },
                                  }}
                                >
                                  {String(
                                    incident.rawOCSF.shuffle_execution_id,
                                  )}
                                </Typography>
                              </Box>
                            </Box>
                          )}
                        </Box>

                        {/* Labels */}
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: "text.secondary" }}
                          >
                            Labels
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              flexWrap: "wrap",
                              mt: 0.5,
                            }}
                          >
                            {editedLabels.map((label, idx) => (
                              <Chip
                                key={idx}
                                label={label}
                                size="small"
                                variant="outlined"
                                onDelete={() => {
                                  autoProgressStatus();
                                  setEditedLabels(
                                    editedLabels.filter((_, i) => i !== idx),
                                  );
                                }}
                                sx={{
                                  height: 22,
                                  fontSize: "0.7rem",
                                  fontWeight: 500,
                                  bgcolor: "transparent",
                                  borderColor: "rgba(6, 182, 212, 0.4)",
                                  color: "#06b6d4",
                                  "& .MuiChip-deleteIcon": {
                                    fontSize: 14,
                                    color: "#06b6d4",
                                    "&:hover": { color: "#67e8f9" },
                                  },
                                }}
                              />
                            ))}
                            <Box
                              component="form"
                              onSubmit={(e: React.FormEvent) => {
                                e.preventDefault();
                                const trimmed = newLabelInput.trim();
                                if (
                                  trimmed &&
                                  !editedLabels.includes(trimmed)
                                ) {
                                  autoProgressStatus();
                                  setEditedLabels([...editedLabels, trimmed]);
                                  setNewLabelInput("");
                                }
                              }}
                              sx={{ display: "inline-flex" }}
                            >
                              <TextField
                                value={newLabelInput}
                                onChange={(e) =>
                                  setNewLabelInput(e.target.value)
                                }
                                placeholder="+ Add"
                                variant="outlined"
                                size="small"
                                InputProps={{
                                  sx: {
                                    fontSize: "0.7rem",
                                    height: 24,
                                    bgcolor: "hsl(var(--input))",
                                    "& fieldset": {
                                      borderColor: "hsl(var(--border))",
                                      borderStyle: "dashed",
                                    },
                                    "&:hover fieldset": {
                                      borderColor: "rgba(6, 182, 212, 0.3)",
                                    },
                                    "&.Mui-focused fieldset": {
                                      borderColor: "#06b6d4",
                                    },
                                  },
                                }}
                                sx={{ width: 80 }}
                              />
                            </Box>
                          </Box>
                        </Box>

                        {/* Attachments */}
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              display: "block",
                              mb: 1,
                            }}
                          >
                            Attachments
                          </Typography>
                          <FileAttachments
                            attachments={incidentAttachments}
                            onChange={setIncidentAttachments}
                            namespace="incidents"
                            labels={[incident.id]}
                          />
                        </Box>

                        {/* References */}
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              display: "block",
                              mb: 0.5,
                            }}
                          >
                            References
                          </Typography>
                          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                            <TextField
                              size="small"
                              value={newReference}
                              onChange={(e) => setNewReference(e.target.value)}
                              placeholder="https://example.com/reference"
                              fullWidth
                              onKeyDown={(e) =>
                                e.key === "Enter" &&
                                (e.preventDefault(), handleAddReference())
                              }
                              sx={inputSx}
                            />
                            <IconButton
                              onClick={handleAddReference}
                              disabled={!newReference.trim()}
                              sx={{ bgcolor: "hsl(var(--muted))" }}
                            >
                              <AddIcon />
                            </IconButton>
                          </Box>
                          {editedReferences.length > 0 && (
                            <Box
                              sx={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 0.5,
                              }}
                            >
                              {editedReferences.map((ref, idx) => (
                                <Chip
                                  key={idx}
                                  label={
                                    ref.length > 50
                                      ? ref.substring(0, 50) + "..."
                                      : ref
                                  }
                                  size="small"
                                  icon={<LinkIcon size={14} />}
                                  onDelete={() => handleRemoveReference(idx)}
                                  onClick={() => window.open(ref, "_blank")}
                                  sx={{ cursor: "pointer" }}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Section>

                      {/* Custom Fields — sits directly below Metadata so editable
              org-defined attributes flow naturally after the read-only
              system metadata block. */}
                      {(() => {
                        // Get keys from defined custom fields
                        const definedFieldKeys = new Set(
                          customFields.map((f) => f.key),
                        );
                        // Get keys from actual data that don't have definitions
                        const dataFieldKeys = Object.keys(
                          editedCustomFields,
                        ).filter((k) => !definedFieldKeys.has(k));
                        // Create dynamic fields for data that doesn't have definitions
                        const dynamicFields: CustomField[] = dataFieldKeys.map(
                          (key) => ({
                            name: key
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (l) => l.toUpperCase()),
                            key,
                            type:
                              typeof editedCustomFields[key] === "boolean"
                                ? ("boolean" as const)
                                : typeof editedCustomFields[key] === "number"
                                  ? ("number" as const)
                                  : ("text" as const),
                            required: false,
                          }),
                        );
                        // Combine defined fields + dynamic fields from data
                        const allFields = [...customFields, ...dynamicFields];

                        return allFields.length > 0 ||
                          Object.keys(editedCustomFields).length > 0 ? (
                          <Section
                            title="Custom Fields"
                            icon={TuneIcon}
                            defaultOpen={
                              Object.keys(editedCustomFields).length > 0
                            }
                          >
                            <Box
                              sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  md: "repeat(2, 1fr)",
                                },
                                columnGap: 2.5,
                                rowGap: 2.5,
                                pt: 1,
                                pb: 0.5,
                              }}
                            >
                              {allFields.map((field) =>
                                renderCustomField(field),
                              )}
                            </Box>
                          </Section>
                        ) : null;
                      })()}

                      {/* Metrics Section */}
                      <Section
                        title="Metrics"
                        icon={TrendingUpIcon}
                        defaultOpen={false}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {/* MTTD */}
                          <Box>
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                mb: 1,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <AccessTimeIcon
                                  size={16}
                                  style={{
                                    color:
                                      metrics?.mttdColor || "text.secondary",
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    fontWeight: 500,
                                  }}
                                >
                                  MTTD (Time to Detect)
                                </Typography>
                              </Box>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  color: metrics?.mttdColor,
                                }}
                              >
                                {metrics?.mttd || "—"}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={metrics?.mttdProgress || 0}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: "rgba(255,255,255,0.08)",
                                "& .MuiLinearProgress-bar": {
                                  bgcolor: metrics?.mttdColor,
                                  borderRadius: 3,
                                },
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                color: "text.disabled",
                                mt: 0.5,
                                display: "block",
                              }}
                            >
                              Target: &lt;4h
                            </Typography>
                          </Box>

                          {/* MTTR */}
                          <Box>
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                mb: 1,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <CheckCircleIcon
                                  size={16}
                                  style={{
                                    color: metrics?.isResolved
                                      ? "#22c55e"
                                      : metrics?.mttrColor || "text.secondary",
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    fontWeight: 500,
                                  }}
                                >
                                  MTTR (Time to Resolve)
                                </Typography>
                              </Box>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  color: metrics?.isResolved
                                    ? "#22c55e"
                                    : metrics?.mttrColor,
                                }}
                              >
                                {metrics?.mttr ||
                                  (metrics?.isResolved ? "—" : "In progress")}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant={
                                metrics?.isResolved ? "determinate" : "buffer"
                              }
                              value={
                                metrics?.isResolved
                                  ? metrics?.mttrProgress || 0
                                  : 0
                              }
                              valueBuffer={metrics?.mttrProgress || 0}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: "rgba(255,255,255,0.08)",
                                "& .MuiLinearProgress-bar": {
                                  bgcolor: metrics?.isResolved
                                    ? "#22c55e"
                                    : metrics?.mttrColor,
                                  borderRadius: 3,
                                },
                                "& .MuiLinearProgress-dashed": {
                                  backgroundSize: "8px 8px",
                                },
                                "& .MuiLinearProgress-bar2Buffer": {
                                  bgcolor: `${metrics?.mttrColor}40`,
                                },
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                color: "text.disabled",
                                mt: 0.5,
                                display: "block",
                              }}
                            >
                              Target: &lt;24h
                            </Typography>
                          </Box>
                        </Box>
                      </Section>
                    </Box>
                  </Box>
                );
              })()}
            </Box>

            {activeTab === 2 && (
              /* Observables Tab */
              <Box
                sx={{
                  bgcolor: "transparent",
                  backgroundImage: "none",
                  borderRadius: 2,
                  border: "1px solid hsl(var(--border))",
                  p: 2.5,
                }}
              >
                {/* Auto-enrichment status banner */}
                {!enrichmentStatus.isLoading && !enrichmentStatus.active && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      mb: 2,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      bgcolor: "rgba(251, 146, 60, 0.08)",
                      border: "1px solid rgba(251, 146, 60, 0.18)",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: "#fb923c", fontWeight: 500, flex: 1 }}
                    >
                      Automatic observable extraction is not yet fully enabled.
                    </Typography>
                    <Tooltip
                      title={
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                            py: 0.5,
                            maxWidth: 360,
                          }}
                        >
                          {enrichmentStatus.checks.map((c) => (
                            <Box
                              key={c.label}
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.25,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.75,
                                }}
                              >
                                <CheckCircleIcon
                                  size={13}
                                  style={{
                                    color: c.active
                                      ? "hsl(var(--severity-low))"
                                      : "hsl(var(--destructive))",
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                                >
                                  {c.label}
                                </Typography>
                              </Box>
                              {isSupportUser && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: "0.65rem",
                                    color: "rgba(255,255,255,0.7)",
                                    pl: 2.5,
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {c.detail}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      }
                      arrow
                    >
                      <Button
                        size="small"
                        variant="contained"
                        disabled={enrichmentStatus.isEnabling}
                        onClick={enrichmentStatus.enable}
                        sx={{
                          textTransform: "none",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          height: 28,
                          px: 2,
                          bgcolor: "#fb923c",
                          color: "#fff",
                          boxShadow: "none",
                          "&:hover": { bgcolor: "#f97316", boxShadow: "none" },
                          "&.Mui-disabled": {
                            bgcolor: "rgba(251, 146, 60, 0.4)",
                            color: "#fff",
                          },
                        }}
                      >
                        {enrichmentStatus.isEnabling ? (
                          <CircularProgress size={14} sx={{ color: "#fff" }} />
                        ) : (
                          "Enable"
                        )}
                      </Button>
                    </Tooltip>
                  </Box>
                )}

                {/* Add Observable input */}
                <Box
                  sx={{ display: "flex", gap: 1, mb: 2, alignItems: "center" }}
                >
                  <ObservableTypeSelector
                    value={newObservableType}
                    onChange={setNewObservableType}
                    iocTypes={iocTypes}
                    onTypeCreated={refetchIOCTypes}
                  />
                  {(() => {
                    const selectedIoc = iocTypes.find(
                      (t) => t.name === newObservableType,
                    );
                    const regexPattern = selectedIoc?.regex;
                    const val = newObservableValue.trim();
                    let regexWarning = "";
                    if (val && regexPattern) {
                      try {
                        if (!new RegExp(regexPattern).test(val)) {
                          regexWarning = `Doesn't match pattern for "${newObservableType}" — regex: ${regexPattern}`;
                        }
                      } catch {
                        /* invalid regex, skip */
                      }
                    }
                    return (
                      <>
                        <TextField
                          size="small"
                          value={newObservableValue}
                          onChange={(e) =>
                            setNewObservableValue(e.target.value)
                          }
                          placeholder="Enter observable value..."
                          fullWidth
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            (e.preventDefault(), handleAddObservable())
                          }
                          sx={{
                            ...transparentInputSx,
                            "& .MuiOutlinedInput-root": {
                              ...(transparentInputSx as any)[
                                "& .MuiOutlinedInput-root"
                              ],
                              height: 36,
                            },
                          }}
                          error={!!regexWarning}
                          helperText={regexWarning || undefined}
                        />
                        <IconButton
                          onClick={handleAddObservable}
                          disabled={!newObservableValue.trim()}
                          sx={{
                            width: 36,
                            height: 36,
                            bgcolor: "transparent",
                            border: "1px solid hsl(var(--border))",
                            alignSelf: regexWarning ? "flex-start" : "center",
                            mt: regexWarning ? "4px" : 0,
                            "&:hover": { bgcolor: "hsl(var(--muted) / 0.35)" },
                          }}
                        >
                          <AddIcon />
                        </IconButton>
                      </>
                    );
                  })()}
                </Box>

                {/* Filter & sort bar */}
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    mb: 2,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <TextField
                    size="small"
                    value={obsFilterText}
                    onChange={(e) => setObsFilterText(e.target.value)}
                    placeholder="Search observables..."
                    sx={{
                      ...transparentInputSx,
                      minWidth: 160,
                      flex: 1,
                      maxWidth: 280,
                      "& .MuiOutlinedInput-root": {
                        ...(transparentInputSx as any)[
                          "& .MuiOutlinedInput-root"
                        ],
                        height: 36,
                      },
                    }}
                    InputProps={{
                      startAdornment: (
                        <SearchIcon
                          size={16}
                          style={{ color: "text.disabled", marginRight: "4px" }}
                        />
                      ),
                    }}
                  />
                  {/* Type multiselect dropdown */}
                  {(() => {
                    const manualTypes = editedObservables
                      .filter((o) => !o.archived)
                      .map((o) => o.type);
                    const enrichTypes = enrichments.map(
                      (e) => e.type || "unknown",
                    );
                    const uniqueTypes = [
                      ...new Set([...manualTypes, ...enrichTypes]),
                    ].sort();
                    if (uniqueTypes.length <= 1) return null;
                    return (
                      <Select
                        multiple
                        displayEmpty
                        value={obsFilterTypes}
                        onChange={(e) =>
                          setObsFilterTypes(
                            typeof e.target.value === "string"
                              ? e.target.value.split(",")
                              : (e.target.value as string[]),
                          )
                        }
                        renderValue={(selected) =>
                          selected.length === 0
                            ? "All types"
                            : `${selected.length} type${selected.length > 1 ? "s" : ""}`
                        }
                        size="small"
                        sx={{
                          minWidth: 120,
                          height: 36,
                          fontSize: "0.8rem",
                          bgcolor: "transparent",
                          backgroundImage: "none",
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "hsl(var(--border))",
                          },
                          "& .MuiSelect-select": { py: 0.75, px: 1.5 },
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              bgcolor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                            },
                          },
                        }}
                      >
                        {uniqueTypes.map((t) => (
                          <MenuItem
                            key={t}
                            value={t}
                            sx={{ fontSize: "0.8rem" }}
                          >
                            <Checkbox
                              size="small"
                              checked={obsFilterTypes.includes(t)}
                              sx={{ p: 0.5, mr: 1 }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "0.8rem",
                                textTransform: "uppercase",
                              }}
                            >
                              {t}
                            </Typography>
                          </MenuItem>
                        ))}
                      </Select>
                    );
                  })()}
                  {/* Sort dropdown */}
                  <Select
                    value={obsSortField}
                    onChange={(e) => setObsSortField(e.target.value as any)}
                    size="small"
                    sx={{
                      minWidth: 110,
                      height: 36,
                      fontSize: "0.75rem",
                      bgcolor: "transparent",
                      backgroundImage: "none",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "hsl(var(--border))",
                      },
                      "& .MuiSelect-select": { py: 0.75, px: 1.5 },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          bgcolor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        },
                      },
                    }}
                  >
                    <MenuItem value="first_seen" sx={{ fontSize: "0.8rem" }}>
                      First seen
                    </MenuItem>
                    <MenuItem value="last_seen" sx={{ fontSize: "0.8rem" }}>
                      Last seen
                    </MenuItem>
                    <MenuItem value="type" sx={{ fontSize: "0.8rem" }}>
                      Type
                    </MenuItem>
                    <MenuItem value="value" sx={{ fontSize: "0.8rem" }}>
                      Value
                    </MenuItem>
                  </Select>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setObsSortDir((d) => (d === "asc" ? "desc" : "asc"))
                    }
                    sx={{
                      p: 0.5,
                      color: "hsl(var(--muted-foreground))",
                      "&:hover": { color: "hsl(var(--primary))" },
                    }}
                  >
                    {obsSortDir === "desc" ? (
                      <ArrowDownwardIcon size={16} />
                    ) : (
                      <ArrowUpwardIcon size={16} />
                    )}
                  </IconButton>
                  {/* Clear filters */}
                  {(obsFilterTypes.length > 0 ||
                    obsFilterText ||
                    obsSortField !== "first_seen" ||
                    obsSortDir !== "desc") && (
                    <Chip
                      label="Clear filters"
                      size="small"
                      onDelete={() => {
                        setObsFilterTypes([]);
                        setObsFilterText("");
                        setObsSortField("first_seen");
                        setObsSortDir("desc");
                      }}
                      sx={{
                        fontSize: "0.65rem",
                        cursor: "pointer",
                        color: "hsl(var(--muted-foreground))",
                        bgcolor: "transparent",
                        border: "1px solid hsl(var(--border))",
                        "&:hover": { bgcolor: "hsl(var(--muted) / 0.25)" },
                      }}
                    />
                  )}
                  {/* Show / hide ignored observables — per-org list of indicators
                the user has marked as uninteresting. Count reflects only the
                ignored entries actually present in THIS incident, not the
                full org-wide ignore list. */}
                  {(() => {
                    const seen = new Set<string>();
                    for (const o of editedObservables) {
                      if ((o as any).archived) continue;
                      if (isObservableIgnored(o.type, o.value)) {
                        seen.add(
                          `${(o.type || "").toLowerCase()}::${(o.value || "").toLowerCase()}`,
                        );
                      }
                    }
                    for (const e of enrichments) {
                      const t = e.type || "unknown";
                      const v = (e as any).value || (e as any).data || "";
                      if (isObservableIgnored(t, v)) {
                        seen.add(
                          `${t.toLowerCase()}::${String(v).toLowerCase()}`,
                        );
                      }
                    }
                    const relevantCount = seen.size;
                    if (relevantCount === 0) return null;
                    return (
                      <Tooltip
                        title={
                          showIgnoredObs
                            ? "Hide observables you have marked as ignored"
                            : "Reveal observables you have marked as ignored"
                        }
                        arrow
                      >
                        <Chip
                          icon={
                            showIgnoredObs ? (
                              <VisibilityIcon size={12} />
                            ) : (
                              <VisibilityOffIcon size={12} />
                            )
                          }
                          label={
                            showIgnoredObs
                              ? `Hide ignored (${relevantCount})`
                              : `Show ignored (${relevantCount})`
                          }
                          size="small"
                          onClick={() => setShowIgnoredObs((s) => !s)}
                          sx={{
                            fontSize: "0.65rem",
                            height: 22,
                            cursor: "pointer",
                            color: showIgnoredObs
                              ? "hsl(var(--primary))"
                              : "hsl(var(--muted-foreground))",
                            bgcolor: showIgnoredObs
                              ? "hsl(var(--primary) / 0.1)"
                              : "transparent",
                            border: "1px solid",
                            borderColor: showIgnoredObs
                              ? "hsl(var(--primary) / 0.4)"
                              : "hsl(var(--border))",
                            "& .MuiChip-icon": {
                              ml: 0.75,
                              mr: -0.25,
                              color: "inherit",
                            },
                            "&:hover": {
                              bgcolor: showIgnoredObs
                                ? "hsl(var(--primary) / 0.18)"
                                : "hsl(var(--muted) / 0.25)",
                            },
                          }}
                        />
                      </Tooltip>
                    );
                  })()}
                </Box>

                {/* Unified observables list (manual + enrichments) */}
                {(() => {
                  const manualObs = editedObservables
                    .map((obs, idx) => ({
                      ...obs,
                      _idx: idx,
                      _source: "manual" as const,
                    }))
                    .filter((o) => !o.archived);
                  const enrichObs = enrichments.map((enr, idx) => ({
                    type: enr.type || "unknown",
                    value: enr.value || enr.data || "",
                    first_seen: enr.first_seen,
                    last_seen: enr.last_seen,
                    _idx: idx,
                    _source: "enrichment" as const,
                  }));
                  // Deduplicate by type+value (case-insensitive), prefer enrichment data, merge timestamps
                  const deduped = new Map<string, any>();
                  for (const obs of [...manualObs, ...enrichObs]) {
                    const dedupKey = `${obs.type.toLowerCase()}::${obs.value.toLowerCase()}`;
                    const existing = deduped.get(dedupKey);
                    if (existing) {
                      const eFs = (existing as any).first_seen;
                      const oFs = (obs as any).first_seen;
                      const eLs = (existing as any).last_seen;
                      const oLs = (obs as any).last_seen;
                      if (oFs && (!eFs || oFs < eFs))
                        (existing as any).first_seen = oFs;
                      if (oLs && (!eLs || oLs > eLs))
                        (existing as any).last_seen = oLs;
                    } else {
                      deduped.set(dedupKey, { ...obs });
                    }
                  }
                  const toTs = (v: any) =>
                    !v
                      ? 0
                      : typeof v === "number"
                        ? v < 1e12
                          ? v * 1000
                          : v
                        : new Date(v).getTime() || 0;
                  // Default sort prioritizes: (1) observables flagged as known
                  // IOCs, (2) total correlation refs (more matches = more
                  // important), (3) the user-selected field/direction (defaults to
                  // first_seen desc). This keeps the most actionable rows always
                  // at the top regardless of recency.
                  const isDefaultSort =
                    obsSortField === "first_seen" && obsSortDir === "desc";
                  const corrCountFor = (o: any): number => {
                    const k = `${o.type}::${o.value}`;
                    const c = obsCorrelations[k];
                    if (!c?.data?.length) return 0;
                    const meaningful = filterMeaningfulCorrelations(
                      c.data,
                      correlationVisibilityOptions,
                    );
                    return meaningful.reduce(
                      (sum, x) =>
                        sum +
                        getEffectiveCorrelationCount(
                          x,
                          correlationVisibilityOptions,
                        ),
                      0,
                    );
                  };
                  // Read the cached IOC/correlation rank for this observable, or
                  // capture and freeze it on first sight. This is what stops a row
                  // from leaping to the top of the list mid-click when its
                  // correlation lookup finishes — the rank only updates on an
                  // explicit user action that bumps `obsSortRankEpoch`.
                  const rankFor = (o: any): { ioc: number; corr: number } => {
                    const k = `${o.type}::${o.value}`.toLowerCase();
                    const cache = obsSortRankRef.current;
                    const cached = cache.get(k);
                    if (cached) return cached;
                    const fresh = {
                      ioc: iocObservableKeys.has(k) ? 1 : 0,
                      corr: corrCountFor(o),
                    };
                    cache.set(k, fresh);
                    return fresh;
                  };
                  // void-read so the linter / reader knows this memo intentionally
                  // depends on the epoch counter (the ref itself is mutable).
                  void obsSortRankEpoch;
                  const allObsRaw = Array.from(deduped.values()).sort(
                    (a, b) => {
                      if (isDefaultSort) {
                        const ar = rankFor(a);
                        const br = rankFor(b);
                        if (ar.ioc !== br.ioc) return br.ioc - ar.ioc;
                        if (ar.corr !== br.corr) return br.corr - ar.corr;
                      }
                      let cmp = 0;
                      if (
                        obsSortField === "first_seen" ||
                        obsSortField === "last_seen"
                      ) {
                        const aTs = toTs(a[obsSortField]);
                        const bTs = toTs(b[obsSortField]);
                        // Items with timestamps always before items without
                        if (aTs && !bTs) return -1;
                        if (!aTs && bTs) return 1;
                        cmp = aTs - bTs;
                      } else if (obsSortField === "type") {
                        cmp = a.type.localeCompare(b.type);
                      } else {
                        cmp = a.value.localeCompare(b.value);
                      }
                      return obsSortDir === "desc" ? -cmp : cmp;
                    },
                  );

                  // Apply filters
                  const filterLower = obsFilterText.toLowerCase();
                  let allObs = allObsRaw.filter((obs) => {
                    if (
                      obsFilterTypes.length > 0 &&
                      !obsFilterTypes.includes(obs.type)
                    )
                      return false;
                    if (
                      filterLower &&
                      !obs.value.toLowerCase().includes(filterLower) &&
                      !obs.type.toLowerCase().includes(filterLower)
                    )
                      return false;
                    if (
                      !showIgnoredObs &&
                      isObservableIgnored(obs.type, obs.value)
                    )
                      return false;
                    return true;
                  });
                  // When the user has explicitly toggled "Show ignored", surface those
                  // rows at the top of the list. The whole point of revealing them is
                  // to reconsider whether they should stay ignored — burying them at
                  // the bottom (or mixed in dimmed) makes the toggle pointless.
                  if (showIgnoredObs) {
                    const ignored = allObs.filter((o) =>
                      isObservableIgnored(o.type, o.value),
                    );
                    const rest = allObs.filter(
                      (o) => !isObservableIgnored(o.type, o.value),
                    );
                    allObs = [...ignored, ...rest];
                  }

                  // Note: we used to render a "Processing observables in the
                  // background…" skeleton for any incident created in the last 2
                  // minutes. That banner was misleading — no actual background
                  // fetch was tied to it, so users (rightly) read it as a stuck
                  // loader. Show the real empty state immediately instead.

                  if (allObsRaw.length === 0) {
                    return (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          fontStyle: "italic",
                          textAlign: "center",
                          py: 4,
                        }}
                      >
                        No observables added. Add IOCs, IPs, domains, hashes, or
                        other indicators.
                      </Typography>
                    );
                  }

                  if (allObs.length === 0) {
                    return (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          fontStyle: "italic",
                          textAlign: "center",
                          py: 4,
                        }}
                      >
                        No observables match the current filter.{" "}
                        {allObsRaw.length} total.
                      </Typography>
                    );
                  }

                  return (
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      {/* Only show the "still processing" banner when the list is
                    actually empty. Once observables exist, the user can see
                    them — keeping the banner visible reads as a stuck loader. */}
                      {allObs.map((obs) => {
                        const iocDef = iocTypes.find(
                          (t) => t.name === obs.type,
                        );
                        const pattern = iocDef?.regex;
                        let mismatch = false;
                        if (pattern && obs._source === "manual") {
                          try {
                            mismatch = !new RegExp(pattern).test(obs.value);
                          } catch {
                            /* skip */
                          }
                        }
                        const suggestedTypes = mismatch
                          ? iocTypes
                              .filter((t) => t.name !== obs.type && t.regex)
                              .filter((t) => {
                                try {
                                  return new RegExp(t.regex!).test(obs.value);
                                } catch {
                                  return false;
                                }
                              })
                              .slice(0, 3)
                          : [];
                        const actionName = `search_ioc_${obs.type.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
                        const obsRowKey = `${obs._source}-${obs._idx}`;
                        const obsHighlightKey = `${(obs.type || "").toLowerCase()}::${(obs.value || "").toLowerCase()}`;
                        const isNewlyArrived =
                          newlyArrivedObservables.has(obsHighlightKey);
                        const isExpanded = expandedObsKey === obsRowKey;
                        const firstSeen = (obs as any).first_seen;
                        const lastSeen = (obs as any).last_seen;
                        const hasTimestamps = firstSeen || lastSeen;
                        const formatObsTime = (
                          ts: string | number | undefined,
                        ) => {
                          if (!ts) return "—";
                          const d =
                            typeof ts === "number"
                              ? new Date(ts < 1e12 ? ts * 1000 : ts)
                              : new Date(ts);
                          return isNaN(d.getTime())
                            ? String(ts)
                            : d.toLocaleString();
                        };
                        const isThisIgnored = isObservableIgnored(
                          obs.type,
                          obs.value,
                        );
                        return (
                          <Box
                            key={obsRowKey}
                            data-obs-highlight-key={obsHighlightKey}
                            className={
                              isNewlyArrived ||
                              flashedObsKey === obsHighlightKey
                                ? "incident-new-flash"
                                : undefined
                            }
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: mismatch ? 0.5 : 0,
                              p: 1.5,
                              borderRadius: 1,
                              backgroundImage: "none",
                              border: isThisIgnored
                                ? "1px dashed hsl(var(--warning, 38 92% 50%) / 0.55)"
                                : mismatch
                                  ? "1px solid hsl(var(--warning, 38 92% 50%) / 0.35)"
                                  : isExpanded
                                    ? "1px solid hsl(var(--primary) / 0.35)"
                                    : "1px solid hsl(var(--border))",
                              bgcolor: isThisIgnored
                                ? "hsl(var(--warning, 38 92% 50%) / 0.04)"
                                : "transparent",
                              opacity: isThisIgnored ? 0.8 : 1,
                              transition:
                                "border-color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease",
                              "&:hover": {
                                bgcolor: isThisIgnored
                                  ? "hsl(var(--warning, 38 92% 50%) / 0.08)"
                                  : "hsl(var(--muted) / 0.25)",
                                borderColor: isThisIgnored
                                  ? "hsl(var(--warning, 38 92% 50%) / 0.75)"
                                  : "hsl(var(--primary) / 0.25)",
                                opacity: 1,
                              },
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                // Don't toggle when the user is selecting text inside the row.
                                const sel =
                                  typeof window !== "undefined"
                                    ? window.getSelection()
                                    : null;
                                if (sel && sel.toString().length > 0) return;
                                setExpandedObsKey(
                                  isExpanded ? null : obsRowKey,
                                );
                              }}
                            >
                              <Chip
                                label={obs.type}
                                size="small"
                                variant="outlined"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                  textTransform: "uppercase",
                                  bgcolor: "transparent",
                                  borderColor: mismatch
                                    ? "hsl(var(--warning, 38 92% 50%) / 0.45)"
                                    : "hsl(var(--primary) / 0.4)",
                                  color: mismatch
                                    ? "hsl(var(--warning, 38 92% 50%))"
                                    : "hsl(var(--primary))",
                                }}
                              />
                              <Typography
                                variant="body2"
                                sx={{
                                  flex: 1,
                                  fontFamily: "monospace",
                                  fontSize: "0.8rem",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  minWidth: 0,
                                }}
                              >
                                {obs.value}
                              </Typography>
                              {/* Correlation badge */}
                              {(() => {
                                const obsKey = `${String(obs.type || "").toLowerCase()}::${String(obs.value || "").toLowerCase()}`;
                                const corr = obsCorrelations[obsKey];
                                if (corr?.loading)
                                  return (
                                    <CircularProgress
                                      size={14}
                                      sx={{ mx: 0.5 }}
                                    />
                                  );
                                if (!corr?.data?.length) return null;
                                // Only count correlations with refs OTHER than the current incident.
                                const meaningful = filterMeaningfulCorrelations(
                                  corr.data,
                                  correlationVisibilityOptions,
                                );
                                if (meaningful.length === 0) return null;
                                // Total number of OTHER references across all meaningful
                                // correlations — this is the count the user actually
                                // cares about (e.g. "5 other incidents share this
                                // observable"), not the number of distinct keys.
                                const totalRefs = meaningful.reduce(
                                  (sum, c) =>
                                    sum +
                                    getEffectiveCorrelationCount(
                                      c,
                                      correlationVisibilityOptions,
                                    ),
                                  0,
                                );
                                // Highlight the badge in red when ANY correlation
                                // points to a known IOC / threat-feed entry.
                                const iocHit = meaningful.some(hasIocMatch);
                                return (
                                  <Tooltip
                                    title={
                                      iocHit
                                        ? "This observable matches a known Indicator of Compromise — open to investigate."
                                        : `${totalRefs} correlation${totalRefs !== 1 ? "s" : ""} found`
                                    }
                                    arrow
                                  >
                                    <Chip
                                      icon={
                                        iocHit ? (
                                          <WarningAmberIcon
                                            size={12}
                                            style={{
                                              color:
                                                "hsl(var(--destructive)) !important",
                                            }}
                                          />
                                        ) : undefined
                                      }
                                      label={
                                        iocHit
                                          ? `${totalRefs} IOC`
                                          : `${totalRefs} corr`
                                      }
                                      size="small"
                                      variant="outlined"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setObsCorrelationAnchor({
                                          el: e.currentTarget,
                                          obsKey,
                                        });
                                      }}
                                      sx={{
                                        height: 20,
                                        fontSize: "0.6rem",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        bgcolor: iocHit
                                          ? "hsl(var(--destructive) / 0.1)"
                                          : "transparent",
                                        borderColor: iocHit
                                          ? "hsl(var(--destructive) / 0.5)"
                                          : "hsl(var(--primary) / 0.4)",
                                        color: iocHit
                                          ? "hsl(var(--destructive))"
                                          : "hsl(var(--primary))",
                                        "& .MuiChip-icon": {
                                          ml: 0.5,
                                          mr: -0.25,
                                        },
                                        "&:hover": {
                                          bgcolor: iocHit
                                            ? "hsl(var(--destructive) / 0.16)"
                                            : "hsl(var(--primary) / 0.08)",
                                        },
                                      }}
                                    />
                                  </Tooltip>
                                );
                              })()}
                              {firstSeen && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "hsl(var(--muted-foreground))",
                                    fontSize: "0.55rem",
                                    whiteSpace: "nowrap",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {formatObsTime(firstSeen)}
                                </Typography>
                              )}
                              {/* Ignore / unignore — per-org list of uninteresting
                            observables, persisted in the `ignored-observables`
                            datastore category. Hidden by default in the list. */}
                              {(() => {
                                const isIgn = isObservableIgnored(
                                  obs.type,
                                  obs.value,
                                );
                                return (
                                  <Tooltip
                                    title={
                                      isIgn
                                        ? "Stop ignoring this observable"
                                        : "Hide this observable from the default view"
                                    }
                                    arrow
                                  >
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isIgn)
                                          unignoreObservable(
                                            obs.type,
                                            obs.value,
                                          );
                                        else
                                          ignoredObs.ignore(
                                            obs.type,
                                            obs.value,
                                          );
                                      }}
                                      sx={{
                                        p: 0.5,
                                        color: isIgn
                                          ? "hsl(var(--primary))"
                                          : "text.disabled",
                                        "&:hover": {
                                          color: "hsl(var(--primary))",
                                        },
                                      }}
                                    >
                                      {isIgn ? (
                                        <VisibilityIcon size={16} />
                                      ) : (
                                        <VisibilityOffIcon size={16} />
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                );
                              })()}
                              {obs._source === "manual" && (
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveObservable(obs._idx);
                                  }}
                                  sx={{
                                    p: 0.5,
                                    color: "text.disabled",
                                    "&:hover": { color: "#ef4444" },
                                  }}
                                >
                                  <DeleteIcon size={20} />
                                </IconButton>
                              )}
                              {/* Lookup dropdown — pinned to the far right so it
                            always sits at the trailing edge of the row,
                            regardless of which other actions are available. */}
                              <ObservableLookupMenu
                                type={obs.type}
                                value={obs.value}
                              />
                            </Box>
                            {/* Expanded detail panel */}

                            {isExpanded && (
                              <Box
                                sx={{
                                  mt: 1,
                                  pt: 1,
                                  borderTop:
                                    "1px solid hsl(var(--border-subtle))",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 0.75,
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    gap: 3,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <Box>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "hsl(var(--muted-foreground))",
                                        fontSize: "0.6rem",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      Type
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.8rem",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {obs.type}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "hsl(var(--muted-foreground))",
                                        fontSize: "0.6rem",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      Source
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.8rem",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {obs._source === "manual"
                                        ? "Manual"
                                        : "Enrichment"}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "hsl(var(--muted-foreground))",
                                        fontSize: "0.6rem",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      First seen
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.8rem",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {formatObsTime(firstSeen)}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "hsl(var(--muted-foreground))",
                                        fontSize: "0.6rem",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      Last seen
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.8rem",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {formatObsTime(lastSeen)}
                                    </Typography>
                                  </Box>
                                </Box>
                                <Box>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: "hsl(var(--muted-foreground))",
                                      fontSize: "0.6rem",
                                      textTransform: "uppercase",
                                      letterSpacing: 0.5,
                                    }}
                                  >
                                    Value
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontSize: "0.8rem",
                                      fontFamily: "monospace",
                                      wordBreak: "break-all",
                                    }}
                                  >
                                    {obs.value}
                                  </Typography>
                                </Box>
                                {/* Inline correlations */}
                                {(() => {
                                  const lowerValue = String(
                                    obs.value || "",
                                  ).toLowerCase();
                                  const obsKey = `${String(obs.type || "").toLowerCase()}::${lowerValue}`;
                                  const corr = obsCorrelations[obsKey];
                                  // Trigger fetch if not yet loaded
                                  if (!corr && obs.value) {
                                    const noiseKeys = new Set(
                                      [
                                        "new",
                                        "in_progress",
                                        "resolved",
                                        "escalated",
                                        "closed",
                                        "open",
                                        "pending",
                                        "critical",
                                        "high",
                                        "medium",
                                        "low",
                                        "informational",
                                        "info",
                                        id?.toLowerCase(),
                                      ].filter(Boolean),
                                    );
                                    setObsCorrelations((prev) => {
                                      if (prev[obsKey]) return prev;
                                      // Fire fetch
                                      fetch(getApiUrl("/api/v2/correlations"), {
                                        method: "POST",
                                        credentials: "include",
                                        headers: {
                                          "Content-Type": "application/json",
                                          ...getAuthHeader(),
                                          ...crossOrgHeaders,
                                        },
                                        body: JSON.stringify({
                                          type: "value",
                                          key: lowerValue,
                                        }),
                                      })
                                        .then(async (r) => {
                                          if (r.ok) {
                                            const data = await r.json();
                                            const corrData = Array.isArray(data)
                                              ? data
                                              : data.correlations ||
                                                data.data ||
                                                [];
                                            const filtered = corrData.filter(
                                              (c: { key: string }) =>
                                                !noiseKeys.has(
                                                  c.key.toLowerCase(),
                                                ),
                                            );
                                            setObsCorrelations((p) => ({
                                              ...p,
                                              [obsKey]: {
                                                loading: false,
                                                data: filtered,
                                              },
                                            }));
                                          } else {
                                            setObsCorrelations((p) => ({
                                              ...p,
                                              [obsKey]: {
                                                loading: false,
                                                data: [],
                                              },
                                            }));
                                          }
                                        })
                                        .catch(() => {
                                          setObsCorrelations((p) => ({
                                            ...p,
                                            [obsKey]: {
                                              loading: false,
                                              data: [],
                                            },
                                          }));
                                        });
                                      return {
                                        ...prev,
                                        [obsKey]: { loading: true, data: [] },
                                      };
                                    });
                                  }
                                  if (corr?.loading) {
                                    return (
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 1,
                                          mt: 0.5,
                                        }}
                                      >
                                        <CircularProgress size={14} />
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color:
                                              "hsl(var(--muted-foreground))",
                                            fontSize: "0.65rem",
                                          }}
                                        >
                                          Loading correlations…
                                        </Typography>
                                      </Box>
                                    );
                                  }
                                  if (!corr?.data?.length) {
                                    return (
                                      <Box sx={{ mt: 0.5 }}>
                                        <Box
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                          }}
                                        >
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color:
                                                "hsl(var(--muted-foreground))",
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                              letterSpacing: 0.5,
                                            }}
                                          >
                                            Correlations
                                          </Typography>
                                          <Tooltip
                                            title="Re-run correlation search for this observable"
                                            arrow
                                          >
                                            <IconButton
                                              size="small"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                refetchObsCorrelation(obs);
                                              }}
                                              sx={{
                                                p: 0.25,
                                                color:
                                                  "hsl(var(--muted-foreground))",
                                                "&:hover": {
                                                  color:
                                                    "hsl(var(--foreground))",
                                                },
                                              }}
                                            >
                                              <RefreshIcon size={12} />
                                            </IconButton>
                                          </Tooltip>
                                        </Box>
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            fontSize: "0.75rem",
                                            color:
                                              "hsl(var(--muted-foreground))",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          No correlations found
                                        </Typography>
                                      </Box>
                                    );
                                  }
                                  // Drop correlations whose only ref is the current incident itself.
                                  const meaningfulCorr =
                                    filterMeaningfulCorrelations(
                                      corr.data,
                                      correlationVisibilityOptions,
                                    );
                                  if (meaningfulCorr.length === 0) {
                                    return (
                                      <Box
                                        sx={{
                                          mt: 0.5,
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.5,
                                        }}
                                      >
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            fontSize: "0.75rem",
                                            color:
                                              "hsl(var(--muted-foreground))",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          No correlations found
                                        </Typography>
                                        <Tooltip
                                          title="Re-run correlation search for this observable"
                                          arrow
                                        >
                                          <IconButton
                                            size="small"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              refetchObsCorrelation(obs);
                                            }}
                                            sx={{
                                              p: 0.25,
                                              color:
                                                "hsl(var(--muted-foreground))",
                                              "&:hover": {
                                                color: "hsl(var(--foreground))",
                                              },
                                            }}
                                          >
                                            <RefreshIcon size={12} />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                    );
                                  }
                                  return (
                                    <Box sx={{ mt: 0.5 }}>
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.5,
                                          mb: 0.75,
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color:
                                              "hsl(var(--muted-foreground))",
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                            letterSpacing: 0.5,
                                          }}
                                        >
                                          Correlations ({meaningfulCorr.length})
                                        </Typography>
                                        <Tooltip
                                          title="Re-run correlation search for this observable"
                                          arrow
                                        >
                                          <IconButton
                                            size="small"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              refetchObsCorrelation(obs);
                                            }}
                                            sx={{
                                              p: 0.25,
                                              color:
                                                "hsl(var(--muted-foreground))",
                                              "&:hover": {
                                                color: "hsl(var(--foreground))",
                                              },
                                            }}
                                          >
                                            <RefreshIcon size={12} />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                      <Box
                                        sx={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 0.75,
                                        }}
                                      >
                                        {meaningfulCorr
                                          .slice(0, 8)
                                          .map((c, ci) => (
                                            <CorrelationRow
                                              key={c.key || ci}
                                              correlation={c}
                                              currentIncidentId={id}
                                              ignoredObservables={ignoredObs}
                                              compact
                                            />
                                          ))}
                                        {meaningfulCorr.length > 8 && (
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color:
                                                "hsl(var(--muted-foreground))",
                                              fontSize: "0.6rem",
                                            }}
                                          >
                                            +{meaningfulCorr.length - 8} more
                                            correlations
                                          </Typography>
                                        )}
                                      </Box>
                                      {/* Surface STIX IOC context (pattern + sources) when any correlation hits a known IOC. */}
                                      <IocDetailsCard
                                        correlations={meaningfulCorr}
                                        compact
                                      />
                                    </Box>
                                  );
                                })()}
                              </Box>
                            )}
                            {mismatch && (
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 0.5,
                                  pl: 0.5,
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{ color: "#fb923c", fontSize: "0.65rem" }}
                                >
                                  ⚠ Doesn't match pattern for "{obs.type}"
                                </Typography>
                                {suggestedTypes.length > 0 && (
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "hsl(var(--muted-foreground))",
                                        fontSize: "0.65rem",
                                      }}
                                    >
                                      Matches:
                                    </Typography>
                                    {suggestedTypes.map((st) => (
                                      <Chip
                                        key={st.name}
                                        label={`Change to ${st.name}`}
                                        size="small"
                                        variant="outlined"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = [
                                            ...editedObservables,
                                          ];
                                          updated[obs._idx] = {
                                            ...updated[obs._idx],
                                            type: st.name,
                                          };
                                          setEditedObservables(updated);
                                        }}
                                        sx={{
                                          height: 20,
                                          fontSize: "0.6rem",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          bgcolor: "transparent",
                                          borderColor: "rgba(34, 197, 94, 0.4)",
                                          color: "#22c55e",
                                          "&:hover": {
                                            bgcolor: "rgba(34, 197, 94, 0.08)",
                                          },
                                        }}
                                      />
                                    ))}
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  );
                })()}

                {/* Observable correlation popover */}
                <Popover
                  open={!!obsCorrelationAnchor}
                  anchorEl={obsCorrelationAnchor?.el}
                  onClose={() => setObsCorrelationAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  transformOrigin={{ vertical: "top", horizontal: "left" }}
                  slotProps={{
                    paper: {
                      sx: {
                        bgcolor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 2,
                        maxWidth: 460,
                        maxHeight: 460,
                        overflow: "auto",
                      },
                    },
                  }}
                >
                  {obsCorrelationAnchor &&
                    (() => {
                      const corr = obsCorrelations[obsCorrelationAnchor.obsKey];
                      const [type, ...valueParts] =
                        obsCorrelationAnchor.obsKey.split("::");
                      const value = valueParts.join("::");
                      // Reuse the same filtering logic as the inline view so the popover
                      // never shows correlations whose only ref is the current incident.
                      const meaningful = filterMeaningfulCorrelations(
                        corr?.data || [],
                        correlationVisibilityOptions,
                      );
                      return (
                        <Box sx={{ p: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              textTransform: "uppercase",
                              color: "hsl(var(--muted-foreground))",
                              letterSpacing: "0.05em",
                              fontSize: "0.65rem",
                            }}
                          >
                            Correlations for {type}: {value}
                          </Typography>
                          <Box
                            sx={{
                              mt: 1.5,
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.75,
                            }}
                          >
                            {meaningful.map((c, i) => (
                              <CorrelationRow
                                key={c.key || i}
                                correlation={c}
                                currentIncidentId={id}
                                ignoredObservables={ignoredObs}
                                compact
                              />
                            ))}
                          </Box>
                          {/* STIX context for any IOC matches in this observable. */}
                          <IocDetailsCard correlations={meaningful} compact />
                        </Box>
                      );
                    })()}
                </Popover>
              </Box>
            )}

            {activeTab === 3 && (
              /* Correlations Tab */
              <Box
                sx={{
                  bgcolor: "transparent",
                  borderRadius: 2,
                  border: "1px solid hsl(var(--border))",
                  p: 2.5,
                }}
              >
                {/* Thread-correlated incidents — other incidents sharing the same
              thread_id. Lives here rather than above the page header. */}
                {!isPublicView &&
                  incident?.id &&
                  !primaryPointer &&
                  (() => {
                    const excluded = new Set<string>();
                    if (relatedIncidents.primary?.id)
                      excluded.add(relatedIncidents.primary.id.toLowerCase());
                    relatedIncidents.linked.forEach((l) =>
                      excluded.add(l.id.toLowerCase()),
                    );
                    const filtered = threadCorrelated.incidents.filter(
                      (inc) => {
                        if (excluded.has(inc.id.toLowerCase())) return false;
                        const s = String(inc.status || "").toLowerCase();
                        if (s === "merged" || inc.status_id === 6) return false;
                        return true;
                      },
                    );
                    if (
                      filtered.length === 0 &&
                      threadCorrelated.discoveredCount === 0
                    )
                      return null;
                    return (
                      <ThreadCorrelatedBanner
                        threadId={threadCorrelated.threadId}
                        incidents={filtered}
                        discoveredCount={threadCorrelated.discoveredCount}
                        invisibleCount={threadCorrelated.invisibleCount}
                        loading={threadCorrelated.loading}
                        onAutoMerge={handleAutoMergeThread}
                        autoMergeBusy={autoMergeBusy}
                      />
                    );
                  })()}

                {/* Incidents that have been merged INTO this one — surfaced quietly
              here at the top of the Correlations tab instead of a page-level
              banner. Auto-hides when there is nothing to show. */}
                {!isPublicView && incident?.id && (
                  <RelatedIncidentsBanner
                    currentIncidentId={incident.id}
                    linked={relatedIncidents.linked}
                    invisibleCount={relatedIncidents.invisibleCount}
                    expectedCount={getLinkedPointers(incident?.rawOCSF).length}
                    loading={relatedIncidents.loading}
                    onUnlinked={() => loadIncident(false)}
                    highlightId={flashedRelatedId}
                  />
                )}
                {correlationsLoading ? (
                  <Box
                    sx={{ display: "flex", justifyContent: "center", py: 4 }}
                  >
                    <CircularProgress size={24} />
                  </Box>
                ) : correlationRows.length === 0 ? (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      py: 4,
                      gap: 1.5,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      No correlations found for this incident
                    </Typography>
                    <Tooltip title="Re-run correlation search" arrow>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => fetchCorrelations()}
                          disabled={correlationsLoading}
                          sx={{
                            p: 0.75,
                            color: "hsl(var(--muted-foreground))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 1,
                            "&:hover": {
                              color: "hsl(var(--primary))",
                              bgcolor: "hsl(var(--muted))",
                            },
                          }}
                        >
                          <RefreshIcon size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    {/* Correlation summary — quiet header */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        pb: 1.5,
                        borderBottom: "1px solid hsl(var(--border))",
                      }}
                    >
                      <LinkIcon
                        size={18}
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {visibleCorrelations.length} shared attribute
                        {visibleCorrelations.length !== 1 ? "s" : ""}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        · linked across other datastore items
                      </Typography>
                      {/* Reveal hidden correlations — same per-org ignore list the
                    Observables tab uses, so hiding is reversible from here. */}
                      {hiddenCorrelations.length > 0 && (
                        <Tooltip
                          title={
                            showIgnoredObs
                              ? "Hide correlations you have marked as ignored"
                              : "Reveal correlations you have marked as ignored"
                          }
                          arrow
                        >
                          <Chip
                            icon={
                              showIgnoredObs ? (
                                <VisibilityIcon size={12} />
                              ) : (
                                <VisibilityOffIcon size={12} />
                              )
                            }
                            label={
                              showIgnoredObs
                                ? `Hide hidden (${hiddenCorrelations.length})`
                                : `Show hidden (${hiddenCorrelations.length})`
                            }
                            size="small"
                            onClick={() => setShowIgnoredObs((s) => !s)}
                            sx={{
                              fontSize: "0.65rem",
                              height: 22,
                              cursor: "pointer",
                              color: showIgnoredObs
                                ? "hsl(var(--primary))"
                                : "hsl(var(--muted-foreground))",
                              bgcolor: showIgnoredObs
                                ? "hsl(var(--primary) / 0.1)"
                                : "transparent",
                              border: "1px solid",
                              borderColor: showIgnoredObs
                                ? "hsl(var(--primary) / 0.4)"
                                : "hsl(var(--border))",
                              "& .MuiChip-icon": {
                                ml: 0.75,
                                mr: -0.25,
                                color: "inherit",
                              },
                              "&:hover": {
                                bgcolor: showIgnoredObs
                                  ? "hsl(var(--primary) / 0.18)"
                                  : "hsl(var(--muted) / 0.25)",
                              },
                            }}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="Re-run correlation search" arrow>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => fetchCorrelations()}
                            disabled={correlationsLoading}
                            sx={{
                              ml: "auto",
                              p: 0.5,
                              color: "hsl(var(--muted-foreground))",
                              "&:hover": {
                                color: "hsl(var(--primary))",
                                bgcolor: "hsl(var(--muted))",
                              },
                            }}
                          >
                            {correlationsLoading ? (
                              <CircularProgress size={14} />
                            ) : (
                              <RefreshIcon size={16} />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>

                    {/* Correlation list */}
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      {[...correlationRows]
                        .map((corr, idx) => ({ corr, idx }))
                        .sort((a, b) => {
                          // Rank: known IOC / threat-feed first, then by match count.
                          // Stable on ties via original index.
                          const aIoc = hasIocMatch(a.corr) ? 1 : 0;
                          const bIoc = hasIocMatch(b.corr) ? 1 : 0;
                          if (aIoc !== bIoc) return bIoc - aIoc;
                          const aCount = getEffectiveCorrelationCount(a.corr, {
                            currentIncidentId: id,
                          });
                          const bCount = getEffectiveCorrelationCount(b.corr, {
                            currentIncidentId: id,
                          });
                          if (aCount !== bCount) return bCount - aCount;
                          return a.idx - b.idx;
                        })
                        .map(({ corr, idx }) => (
                          <CorrelationRow
                            key={corr.key || idx}
                            correlation={corr}
                            currentIncidentId={id}
                            ignoredObservables={ignoredObs}
                            revealIgnored={showIgnoredObs}
                            focusedIncidentKey={focusedReferrerIncidentKey}
                            className={
                              flashedCorrelationKey === corr.key
                                ? "incident-new-flash"
                                : undefined
                            }
                          />
                        ))}
                    </Box>
                    {/* The page-level "Known IOC details" card was removed — the
                  Known-IOC URL and its source already render inside the
                  matching CorrelationRow above, so repeating it here was
                  pure duplication. The compact variant inside the per-
                  observable popover (above) still surfaces STIX context
                  on demand. */}
                  </Box>
                )}
              </Box>
            )}

            {activeTab === 4 && (
              /* Raw JSON Tab */
              <Box
                sx={{
                  bgcolor: "rgba(255,255,255,0.02)",
                  borderRadius: 2,
                  border: "1px solid hsl(var(--border-subtle))",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    bgcolor: "hsl(var(--card))",
                    mx: -2,
                    px: 2,
                    py: 1.5,
                    borderBottom: "1px solid hsl(var(--border-subtle))",
                  }}
                >
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <DescriptionIcon size={18} style={{ color: "#ff6600" }} />
                      Raw OCSF
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                      }}
                    >
                      <a
                        href="https://schema.ocsf.io/1.7.0/classes/incident_finding"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "hsl(var(--primary))",
                          textDecoration: "underline",
                        }}
                      >
                        Incident Finding 2005
                      </a>
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    {revisions.length > 0 && (
                      <Select
                        size="small"
                        value={selectedRevisionIdx ?? ""}
                        displayEmpty
                        onChange={(e) => {
                          const idx = Number(e.target.value);
                          const rev = revisions[idx];
                          if (rev?.value !== undefined) {
                            try {
                              const payload =
                                typeof rev.value === "string"
                                  ? JSON.parse(rev.value)
                                  : rev.value;
                              setRawJsonText(JSON.stringify(payload, null, 2));
                              setSelectedRevisionIdx(idx);
                              toast.success(
                                `Change #${revisions.length - idx} loaded — hit Save to roll back to it`,
                              );
                            } catch {
                              setRawJsonText(
                                typeof rev.value === "string"
                                  ? rev.value
                                  : JSON.stringify(rev.value, null, 2),
                              );
                              setSelectedRevisionIdx(idx);
                            }
                          }
                        }}
                        renderValue={() => (
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: "0.75rem",
                              color: "text.secondary",
                            }}
                          >
                            {revisionsLoading
                              ? "Loading changes…"
                              : selectedRevisionIdx !== null
                                ? `Viewing change #${revisions.length - selectedRevisionIdx}`
                                : `Load change (${revisions.length})`}
                          </Typography>
                        )}
                        sx={{
                          height: 28,
                          fontSize: "0.75rem",
                          minWidth: 180,
                          "& .MuiSelect-select": { py: 0.5 },
                        }}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                      >
                        {(() => {
                          const parseVal = (v: any) => {
                            if (v === undefined || v === null) return null;
                            if (typeof v === "string") {
                              try {
                                return JSON.parse(v);
                              } catch {
                                return v;
                              }
                            }
                            return v;
                          };
                          const flatten = (
                            obj: any,
                            prefix = "",
                            out: Record<string, string> = {},
                          ) => {
                            if (obj === null || obj === undefined) {
                              out[prefix || "$"] = JSON.stringify(obj);
                              return out;
                            }
                            if (typeof obj !== "object") {
                              out[prefix || "$"] = JSON.stringify(obj);
                              return out;
                            }
                            if (Array.isArray(obj)) {
                              if (obj.length === 0) out[prefix || "$"] = "[]";
                              obj.forEach((v, i) =>
                                flatten(v, `${prefix}[${i}]`, out),
                              );
                              return out;
                            }
                            const keys = Object.keys(obj);
                            if (keys.length === 0) out[prefix || "$"] = "{}";
                            keys.forEach((k) =>
                              flatten(
                                obj[k],
                                prefix ? `${prefix}.${k}` : k,
                                out,
                              ),
                            );
                            return out;
                          };
                          const diffCount = (a: any, b: any) => {
                            const fa = flatten(parseVal(a));
                            const fb = flatten(parseVal(b));
                            const keys = new Set([
                              ...Object.keys(fa),
                              ...Object.keys(fb),
                            ]);
                            let added = 0,
                              removed = 0,
                              changed = 0;
                            keys.forEach((k) => {
                              const inA = k in fa,
                                inB = k in fb;
                              if (inA && !inB) removed++;
                              else if (!inA && inB) added++;
                              else if (fa[k] !== fb[k]) changed++;
                            });
                            return {
                              added,
                              removed,
                              changed,
                              total: added + removed + changed,
                            };
                          };
                          return revisions.map((rev: any, i: number) => {
                            const ts = normalizeToMs(
                              rev?.edited ?? rev?.created,
                            );
                            const label = ts
                              ? new Date(ts).toLocaleString()
                              : `Change ${i + 1}`;
                            // Compare against the previous (older) revision: index i+1
                            const prev = revisions[i + 1];
                            const counts = prev
                              ? diffCount(prev?.value, rev?.value)
                              : null;
                            const isSelected = selectedRevisionIdx === i;
                            return (
                              <MenuItem
                                key={i}
                                value={i}
                                sx={{
                                  fontSize: "0.75rem",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 2,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 14,
                                      display: "inline-flex",
                                      justifyContent: "center",
                                      color: "hsl(var(--primary))",
                                    }}
                                  >
                                    {isSelected ? "✓" : ""}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: isSelected ? 600 : 400,
                                    }}
                                  >
                                    {i === 0 ? `${label} · latest` : label}
                                    {isSelected ? " · current" : ""}
                                  </span>
                                </span>
                                {counts && counts.total > 0 ? (
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: "0.7rem",
                                      color: "hsl(var(--muted-foreground))",
                                    }}
                                  >
                                    {counts.added > 0 && (
                                      <span
                                        style={{ color: "hsl(142 70% 45%)" }}
                                      >
                                        +{counts.added}{" "}
                                      </span>
                                    )}
                                    {counts.removed > 0 && (
                                      <span style={{ color: "hsl(0 70% 55%)" }}>
                                        -{counts.removed}{" "}
                                      </span>
                                    )}
                                    {counts.changed > 0 && (
                                      <span
                                        style={{ color: "hsl(var(--primary))" }}
                                      >
                                        ~{counts.changed}
                                      </span>
                                    )}
                                  </span>
                                ) : prev ? (
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: "0.7rem",
                                      color: "hsl(var(--muted-foreground))",
                                    }}
                                  >
                                    no changes
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: "0.7rem",
                                      color: "hsl(var(--muted-foreground))",
                                    }}
                                  >
                                    initial
                                  </span>
                                )}
                              </MenuItem>
                            );
                          });
                        })()}
                      </Select>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={async () => {
                        // Pull the stored record fresh from the datastore so Reload
                        // always reflects server state, not just the in-memory copy.
                        setSelectedRevisionIdx(null);
                        forceRawReloadRef.current = true;
                        await loadIncident(false);
                        toast.success("Raw OCSF reloaded");
                        // Fallback if the fetch did not repopulate the editor.
                        if (!forceRawReloadRef.current) return;
                        forceRawReloadRef.current = false;
                        if (incident?.rawOCSF) {
                          setRawJsonText(
                            JSON.stringify(incident.rawOCSF, null, 2),
                          );
                        }
                      }}
                      sx={{
                        borderColor: "divider",
                        color: "text.secondary",
                        fontSize: "0.75rem",
                        height: 28,
                        "&:hover": { borderColor: "text.secondary" },
                      }}
                    >
                      Reload
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={async () => {
                        if (!incident?.id) return;
                        if (!rawJsonValid) {
                          toast.error("Cannot save: JSON is invalid");
                          return;
                        }
                        try {
                          const parsed = JSON.parse(rawJsonText);
                          const isRollback = selectedRevisionIdx !== null;
                          if (isRollback) {
                            // Lock out the background reconstruction passes so the
                            // rolled-back payload is not re-hydrated from newer
                            // revisions right after the write.
                            revisionRestoredRef.current = true;
                            ocsfFallbackAttemptedRef.current = true;
                            setOcsfFallbackInfo(null);
                          }
                          setIsSaving(true);
                          const result = await writeIncidentSafe(
                            incident.id,
                            parsed,
                            crossOrgId || undefined,
                          );
                          if (result.success) {
                            toast.success(
                              isRollback
                                ? `Rolled back to change #${revisions.length - (selectedRevisionIdx ?? 0)}`
                                : "Raw data saved",
                            );
                            setSelectedRevisionIdx(null);
                            setRawJsonText(JSON.stringify(parsed, null, 2));
                            loadIncident(false);
                            loadRevisions();
                          } else {
                            toast.error(result.error || "Failed to save");
                          }
                        } catch (e: any) {
                          toast.error(
                            e?.message?.includes("JSON")
                              ? "Invalid JSON"
                              : "Failed to save",
                          );
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving || !rawJsonValid}
                      sx={{
                        borderColor: "divider",
                        color: "primary.main",
                        fontSize: "0.75rem",
                        height: 28,
                        "&:hover": {
                          borderColor: "primary.main",
                          bgcolor: "action.hover",
                        },
                      }}
                    >
                      Save
                    </Button>
                  </Box>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.8rem",
                    lineHeight: 1.5,
                  }}
                >
                  The normalized <strong>OCSF Incident Finding</strong> output
                  after applying the Translation File to the original ingested
                  data. This is the final {"{ }"} structure stored for this
                  incident and used across the platform for display, automation,
                  and forwarding.
                </Typography>
                <HighlightedFileEditor
                  value={rawJsonText}
                  onChange={setRawJsonText}
                  validateJson={true}
                  onValidationChange={setRawJsonValid}
                  foldStateKey="incident-ocsf"
                />
              </Box>
            )}

            {activeTab === 6 && unmappedOriginal && (
              /* Original Data Tab */
              <Box
                sx={{
                  bgcolor: "rgba(255,255,255,0.02)",
                  borderRadius: 2,
                  border: "1px solid hsl(var(--border-subtle))",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    bgcolor: "hsl(var(--card))",
                    mx: -2,
                    px: 2,
                    py: 1.5,
                    borderBottom: "1px solid hsl(var(--border-subtle))",
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <DescriptionIcon
                      size={18}
                      style={{ color: "primary.main" }}
                    />
                    Original Data
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: "0.7rem" }}
                  >
                    The raw unmapped data as originally ingested before any
                    translation was applied.
                  </Typography>
                </Box>
                <HighlightedFileEditor
                  value={
                    typeof unmappedOriginal === "string"
                      ? unmappedOriginal
                      : JSON.stringify(unmappedOriginal, null, 2)
                  }
                  onChange={() => {}}
                  validateJson={false}
                  editable={false}
                  foldStateKey="incident-original"
                />
              </Box>
            )}

            {activeTab === 5 && (
              /* File Editor Tab */
              <Box
                sx={{
                  bgcolor: "rgba(255,255,255,0.02)",
                  borderRadius: 2,
                  border: "1px solid hsl(var(--border-subtle))",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    bgcolor: "hsl(var(--card))",
                    mx: -2,
                    px: 2,
                    py: 1.5,
                    borderBottom: "1px solid hsl(var(--border-subtle))",
                  }}
                >
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <DescriptionIcon
                        size={18}
                        style={{ color: "primary.main" }}
                      />
                      Translation File
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                      }}
                    >
                      {incidentFileRef}
                      {!fileIdResolved
                        ? " (resolving…)"
                        : resolvedFileId && resolvedFileId !== incidentFileRef
                          ? ` → ${resolvedFileId}`
                          : ""}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setFileLoaded(false);
                        loadFileContent();
                      }}
                      disabled={fileLoading}
                      sx={{
                        borderColor: "divider",
                        color: "text.secondary",
                        fontSize: "0.75rem",
                        height: 28,
                        "&:hover": { borderColor: "text.secondary" },
                      }}
                    >
                      {fileLoading ? <CircularProgress size={14} /> : "Reload"}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={async () => {
                        if (!resolvedFileId) return;
                        if (!fileJsonValid) {
                          toast.error("Cannot save: JSON is invalid");
                          return;
                        }
                        setFileSaving(true);
                        try {
                          const resp = await fetch(
                            getApiUrl(`/api/v1/files/${resolvedFileId}/edit`),
                            {
                              method: "PUT",
                              credentials: "include",
                              headers: {
                                ...getAuthHeader(),
                                ...crossOrgHeaders,
                                "Content-Type": "application/json",
                              },
                              body: fileContent,
                            },
                          );
                          if (!resp.ok)
                            throw new Error(`Save failed (${resp.status})`);
                          toast.success("File saved");
                        } catch (e: any) {
                          toast.error(e.message || "Failed to save file");
                        } finally {
                          setFileSaving(false);
                        }
                      }}
                      disabled={fileSaving || fileLoading || !fileJsonValid}
                      sx={{
                        borderColor: "divider",
                        color: "primary.main",
                        fontSize: "0.75rem",
                        height: 28,
                        "&:hover": {
                          borderColor: "primary.main",
                          bgcolor: "action.hover",
                        },
                      }}
                    >
                      {fileSaving ? <CircularProgress size={14} /> : "Save"}
                    </Button>
                  </Box>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.8rem",
                    lineHeight: 1.5,
                  }}
                >
                  This file maps fields from the{" "}
                  <strong>original ingested data</strong> into the{" "}
                  <strong>normalized incident format {"{ }"}</strong>. Variables
                  like{" "}
                  <code
                    style={{
                      color: "hsl(var(--primary))",
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                    }}
                  >
                    $field.subfield
                  </code>{" "}
                  reference the source data and are resolved when the
                  translation runs.
                </Typography>
                {fileError ? (
                  <Box sx={{ p: 3, textAlign: "center" }}>
                    <Typography variant="body2" sx={{ color: "error.main" }}>
                      {fileError}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => {
                        setFileLoaded(false);
                        loadFileContent();
                      }}
                      sx={{ mt: 1, color: "#ff6600" }}
                    >
                      Retry
                    </Button>
                  </Box>
                ) : fileLoading ? (
                  <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
                    <CircularProgress size={24} sx={{ color: "#ff6600" }} />
                  </Box>
                ) : (
                  <HighlightedFileEditor
                    value={fileContent}
                    onChange={setFileContent}
                    validateJson={true}
                    onValidationChange={setFileJsonValid}
                    foldStateKey="incident-translation"
                  />
                )}
              </Box>
            )}

            {/* Changes tab content removed — revisions now in Activity sidebar */}
          </Box>
          {/* End isPublicView pointer-events wrapper */}
        </Box>

        {/* Right Timeline Sidebar — hidden on Details (inlined there) and on Original / Translation / OCSF tabs */}
        {activeTab !== 0 &&
          activeTab !== 4 &&
          activeTab !== 5 &&
          activeTab !== 6 &&
          activeTab !== 7 && (
            <Box
              sx={{
                width: { xs: "100%", lg: 380 },
                flexShrink: 0,
                order: { xs: 2, lg: 0 },
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  ...(isPublicView ? { pointerEvents: "none" } : {}),
                }}
              >
                <IncidentSection
                  title="Timeline"
                  icon={HistoryIcon}
                  open={!timelineCollapsed}
                  onOpenChange={(o) => setTimelineCollapsed(!o)}
                  badge={renderTimelineBadge()}
                  actions={renderTimelineActionsChip(false)}
                  bodyPadded={false}
                  dataTour="incident-activity-feed"
                >
                  {renderTimelinePanel("sidebar")}
                </IncidentSection>
              </Box>
            </Box>
          )}
      </Box>

      {/* Revision Data Dialog */}
      <Dialog
        open={revisionDialogData !== null}
        onClose={() => setRevisionDialogData(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 2,
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            color: "hsl(var(--foreground))",
            fontSize: "0.9rem",
            fontWeight: 600,
            pb: 0.5,
          }}
        >
          Change Data
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              bgcolor: "hsl(var(--muted) / 0.3)",
              border: "1px solid hsl(var(--border))",
              borderRadius: 1.5,
              overflow: "auto",
              maxHeight: "60vh",
              m: 0,
            }}
          >
            {revisionDialogData &&
              revisionDialogData.json.split("\n").map((line, i) => {
                // Check if this line contains a changed key (top-level "key": pattern)
                const keyMatch = line.match(/^\s{2}"([^"]+)":/);
                const isChanged =
                  keyMatch && revisionDialogData.changedKeys.has(keyMatch[1]);
                return (
                  <Box
                    key={i}
                    component="pre"
                    sx={{
                      m: 0,
                      px: 2,
                      py: 0,
                      fontSize: "0.75rem",
                      fontFamily: "JetBrains Mono, monospace",
                      color: isChanged ? "#ff6600" : "hsl(var(--foreground))",
                      bgcolor: isChanged
                        ? "rgba(255, 102, 0, 0.08)"
                        : "transparent",
                      borderLeft: isChanged
                        ? "3px solid #ff6600"
                        : "3px solid transparent",
                      whiteSpace: "pre",
                      lineHeight: 1.6,
                      "&:hover": {
                        bgcolor: isChanged
                          ? "rgba(255, 102, 0, 0.12)"
                          : "hsl(var(--muted) / 0.3)",
                      },
                    }}
                  >
                    {line}
                  </Box>
                );
              })}
          </Box>
        </DialogContent>
      </Dialog>

      <ResolveIncidentDialog
        open={showResolveDialog}
        onClose={() => setShowResolveDialog(false)}
        onResolve={handleResolve}
        incidentTitle={incident?.title || ""}
        isLoading={isSaving}
        incidentCustomFields={
          incident?.customFields
            ? Object.fromEntries(
                Object.entries(incident.customFields).map(([k, v]) => [
                  k,
                  String(v ?? ""),
                ]),
              )
            : {}
        }
      />

      {/* Forward Dialog */}
      <Dialog
        open={showForwardDialog}
        onClose={() => setShowForwardDialog(false)}
        PaperProps={{
          sx: {
            bgcolor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            minWidth: 400,
            maxWidth: 500,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pb: 1,
          }}
        >
          <Typography variant="h6" sx={{ fontSize: "1rem" }}>
            {t("Forward Incident")}
          </Typography>
          <IconButton size="small" onClick={() => setShowForwardDialog(false)}>
            <CloseIcon size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            {t("Choose a tool to forward this incident to.")}
          </Typography>
          {forwardingAppsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : forwardingApps.length === 0 ? (
            <Box
              sx={{
                textAlign: "center",
                py: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                You do not have an email tool authenticated yet.
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", maxWidth: 340 }}
              >
                Connect a tool like Gmail, Outlook or Microsoft Defender 365 to
                forward this incident as an email.
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setShowForwardDialog(false);
                  setShowForwardAppsDrawer(true);
                }}
                sx={{
                  mt: 1,
                  textTransform: "none",
                  bgcolor: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                  "&:hover": { bgcolor: "hsl(var(--primary) / 0.9)" },
                }}
              >
                Connect an email tool
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {forwardingApps.map((app) => (
                <MenuItem
                  key={app.id}
                  onClick={async () => {
                    setShowForwardDialog(false);
                    try {
                      const categories = (app.categories || []).map(
                        (c: string) => c.toLowerCase(),
                      );
                      const isMessaging =
                        categories.includes("communication") ||
                        categories.includes("email") ||
                        app.id.toLowerCase() === "gmail";
                      const ticketPayload = incident?.rawOCSF || incident || {};
                      const forwardBody: Record<string, any> = isMessaging
                        ? {
                            action: "send_message",
                            category: "cases",
                            key: incident?.id,
                            app_name: app.id,
                            body: ticketPayload,
                            fields: {
                              body: ticketPayload,
                            },
                          }
                        : {
                            action: "update_ticket",
                            category: "cases",
                            key: incident?.id,
                            app_name: app.id,
                            fields: [
                              {
                                key: "key",
                                value: JSON.stringify(ticketPayload),
                              },
                            ],
                          };
                      const response = await fetch(
                        getApiUrl("/api/v1/apps/categories/run"),
                        {
                          method: "POST",
                          credentials: "include",
                          headers: {
                            "Content-Type": "application/json",
                            ...getAuthHeader(),
                            ...crossOrgHeaders,
                          },
                          body: JSON.stringify(forwardBody),
                        },
                      );
                      if (response.ok) {
                        toast.success(`Forwarded to ${app.name}`);
                      } else {
                        toast.error(`Failed to forward to ${app.name}`);
                      }
                    } catch {
                      toast.error(`Failed to forward to ${app.name}`);
                    }
                  }}
                  sx={{ borderRadius: 1, py: 1 }}
                >
                  <Avatar
                    src={app.large_image}
                    sx={{ width: 28, height: 28, mr: 1.5, borderRadius: 1 }}
                    variant="rounded"
                  >
                    {app.name.charAt(0)}
                  </Avatar>
                  <Typography variant="body2">{app.name}</Typography>
                </MenuItem>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <MergeIncidentDialog
        open={showMergeDialog}
        onClose={() => {
          setShowMergeDialog(false);
          setMergePreselectedId(undefined);
        }}
        currentIncidentId={incident?.id || ""}
        currentIncidentTitle={incident?.title || ""}
        preselectedTargetId={mergePreselectedId}
        onMergeComplete={() => {
          loadIncident(false);
        }}
      />

      {/* Move to Tenant Dialog — copies the incident into the chosen tenant
          then deletes it from the current one, and navigates to the new one. */}
      {/* Manage tenants dialog — writes the incident into every selected
          tenant (verifying each write) then removes it from any tenants that
          were unchecked. Deletions only happen after all adds are verified. */}
      <Dialog
        open={showMoveDialog}
        onClose={() => {
          if (!isMoving) setShowMoveDialog(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            maxWidth: 480,
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ color: "hsl(var(--foreground))" }}>
          Move to Tenant
        </DialogTitle>
        <DialogContent>
          {(() => {
            const sourceOrgId = crossOrgId || userInfo?.active_org?.id || "";
            const activeId = userInfo?.active_org?.id || "";
            // Build the full candidate list — every tenant the user could
            // place this incident in. Preserve current presence (source +
            // sharedOrgs) so a partial catalog never hides an existing copy.
            // Build a name lookup from every known tenant source first so
            // even the currently-viewed tenant (which may only be present as
            // a raw id from the URL) resolves to a friendly name.
            const nameLookup = new Map<string, string>();
            if (userInfo?.active_org?.id)
              nameLookup.set(
                userInfo.active_org.id,
                userInfo.active_org.name || userInfo.active_org.id,
              );
            if (parentOrg)
              nameLookup.set(parentOrg.id, parentOrg.name || parentOrg.id);
            for (const so of subOrgs) nameLookup.set(so.id, so.name || so.id);
            for (const so of sharedOrgs)
              nameLookup.set(so.id, so.name || so.id);
            if (crossOrgId && crossOrgInfo?.name)
              nameLookup.set(crossOrgId, crossOrgInfo.name);

            const seen = new Set<string>();
            const candidates: { id: string; name: string }[] = [];
            const addCandidate = (id: string, fallback?: string) => {
              if (!id || seen.has(id)) return;
              seen.add(id);
              candidates.push({
                id,
                name: nameLookup.get(id) || fallback || id,
              });
            };
            if (sourceOrgId) addCandidate(sourceOrgId);
            for (const so of sharedOrgs) addCandidate(so.id, so.name);
            if (activeId) addCandidate(activeId, userInfo?.active_org?.name);
            if (parentOrg) addCandidate(parentOrg.id, parentOrg.name);
            for (const so of subOrgs) addCandidate(so.id, so.name);

            const presentSet = new Set<string>();
            if (sourceOrgId) presentSet.add(sourceOrgId);
            for (const so of sharedOrgs) presentSet.add(so.id);

            const selectedCount = moveSelectedOrgIds.size;
            const noneSelected = selectedCount === 0;

            return (
              <>
                <Typography
                  variant="body2"
                  sx={{ color: "hsl(var(--muted-foreground))", mb: 2 }}
                >
                  {presentSet.size > 1
                    ? `This incident exists in ${presentSet.size} tenants. Check every tenant it should live in — additions are written and verified first, and unchecked tenants are only removed afterwards.`
                    : "Select every tenant this incident should live in. New tenants are written and verified first; unchecked tenants are only removed afterwards."}
                </Typography>
                {candidates.length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    No other tenants available.
                  </Typography>
                ) : (
                  <Autocomplete
                    multiple
                    size="small"
                    disableCloseOnSelect
                    disabled={isMoving}
                    options={candidates}
                    value={candidates.filter((c) =>
                      moveSelectedOrgIds.has(c.id),
                    )}
                    getOptionLabel={(opt) => opt.name}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    onChange={(_e, next) => {
                      setMoveSelectedOrgIds(new Set(next.map((n) => n.id)));
                    }}
                    renderOption={(props, opt, { selected }) => (
                      <li {...props} key={opt.id}>
                        <Checkbox
                          size="small"
                          checked={selected}
                          sx={{ p: 0.5, mr: 1 }}
                        />
                        <Box
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              color: "hsl(var(--foreground))",
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {opt.name}
                          </Typography>
                          {presentSet.has(opt.id) && (
                            <Chip
                              size="small"
                              label="Currently here"
                              sx={{
                                height: 20,
                                fontSize: "0.65rem",
                                bgcolor: "hsl(var(--muted))",
                                color: "hsl(var(--muted-foreground))",
                              }}
                            />
                          )}
                        </Box>
                      </li>
                    )}
                    renderTags={(value, getTagProps) =>
                      value.map((opt, index) => {
                        const { key, ...tagProps } = getTagProps({ index });
                        return (
                          <Chip
                            key={key}
                            {...tagProps}
                            size="small"
                            label={opt.name}
                            sx={{
                              height: 22,
                              fontSize: "0.72rem",
                              bgcolor: presentSet.has(opt.id)
                                ? "hsl(var(--muted))"
                                : "hsl(var(--primary) / 0.15)",
                              color: "hsl(var(--foreground))",
                            }}
                          />
                        );
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Tenants"
                        placeholder={
                          moveSelectedOrgIds.size === 0 ? "Search tenants…" : ""
                        }
                      />
                    )}
                    slotProps={{ popper: { sx: { zIndex: 9999 } } }}
                  />
                )}
                {noneSelected && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mt: 1,
                      color: "hsl(var(--destructive))",
                    }}
                  >
                    Select at least one tenant — an incident must live
                    somewhere.
                  </Typography>
                )}
              </>
            );
          })()}
          <Box
            sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 3 }}
          >
            <Button
              onClick={() => setShowMoveDialog(false)}
              disabled={isMoving}
              sx={{
                textTransform: "none",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={
                isMoving || !incident?.id || moveSelectedOrgIds.size === 0
              }
              onClick={async () => {
                if (!incident?.id) return;
                const sourceOrgId = crossOrgId || userInfo?.active_org?.id;
                if (!sourceOrgId) {
                  toast.error("Could not determine source tenant");
                  return;
                }

                const presentSet = new Set<string>();
                presentSet.add(sourceOrgId);
                for (const so of sharedOrgs) presentSet.add(so.id);

                const selected = moveSelectedOrgIds;
                const toAdd: string[] = [];
                const toRemove: string[] = [];
                for (const id of selected)
                  if (!presentSet.has(id)) toAdd.push(id);
                for (const id of presentSet)
                  if (!selected.has(id)) toRemove.push(id);

                if (toAdd.length === 0 && toRemove.length === 0) {
                  toast.info("No changes to apply");
                  setShowMoveDialog(false);
                  return;
                }

                setIsMoving(true);
                try {
                  const selectedList = Array.from(selected);
                  const selectedSet = new Set(selectedList);
                  const removeSet = new Set(toRemove);
                  const activeId = userInfo?.active_org?.id;

                  // Safety: never issue a request against an org that isn't
                  // explicitly in toAdd or toRemove. In particular, never
                  // touch the current active org unless it's one of those.
                  const overlap = [...selectedSet].filter((o) =>
                    removeSet.has(o),
                  );
                  if (overlap.length > 0) {
                    throw new Error(
                      "Internal conflict in tenant selection — aborted",
                    );
                  }
                  console.log("[MoveTenant] intent", {
                    incidentId: incident.id,
                    sourceOrgId,
                    activeOrgId: activeId,
                    toAdd,
                    toRemove,
                  });

                  // Grab the payload we'll write to new tenants. Prefer the
                  // already-loaded incident so we do NOT fire an extra read
                  // just to move it.
                  let value: any = incident.rawOCSF || incident;
                  if (toAdd.length > 0 && !value) {
                    const fresh = await getDatastoreItem(
                      incident.id,
                      DATASTORE_CATEGORIES.INCIDENTS,
                      sourceOrgId,
                      tenantRegionOptions(sourceOrgId),
                    );
                    if (fresh?.success && fresh.item?.value) {
                      try {
                        value =
                          typeof fresh.item.value === "string"
                            ? JSON.parse(fresh.item.value)
                            : fresh.item.value;
                      } catch {
                        value = fresh.item.value;
                      }
                    }
                  }

                  // Stamp the authoritative tenant set and log the move in the
                  // timeline before writing anywhere.
                  const stampedValue = stampTenantMove(
                    value,
                    selectedList,
                    toRemove,
                  );

                  // 1) Add to new tenants FIRST (safer: if writes fail we
                  //    haven't destroyed the source copy yet). Each write is
                  //    addressed to the tenant's own region.
                  const addedOk: string[] = [];
                  const addFailures: string[] = [];
                  for (const targetOrgId of toAdd) {
                    if (removeSet.has(targetOrgId)) {
                      throw new Error(
                        `[MoveTenant] refused add to removed tenant ${targetOrgId}`,
                      );
                    }
                    console.log(`[MoveTenant] add -> ${targetOrgId}`);
                    let written = false;
                    try {
                      const wr = await writeIncidentSafe(
                        incident.id,
                        stampedValue as object,
                        targetOrgId,
                        tenantRegionOptions(targetOrgId),
                      );
                      written = !!wr.success;
                    } catch {
                      written = false;
                    }
                    if (written) addedOk.push(targetOrgId);
                    else addFailures.push(targetOrgId);
                  }

                  // 1b) Re-stamp the copies that stay put, so every surviving
                  //     copy agrees on where this incident lives.
                  for (const stayOrgId of selectedList) {
                    if (toAdd.includes(stayOrgId)) continue;
                    try {
                      await writeIncidentSafe(
                        incident.id,
                        stampedValue as object,
                        stayOrgId,
                        tenantRegionOptions(stayOrgId),
                      );
                    } catch {
                      /* stamp is best-effort on existing copies */
                    }
                  }

                  // 2) Verify each addition (one read per added tenant).
                  const missingTargets: string[] = [];
                  for (const targetOrgId of toAdd) {
                    try {
                      const check = await getDatastoreItem(
                        incident.id,
                        DATASTORE_CATEGORIES.INCIDENTS,
                        targetOrgId,
                        tenantRegionOptions(targetOrgId),
                      );
                      if (!(check?.success && check.item?.value))
                        missingTargets.push(targetOrgId);
                    } catch {
                      missingTargets.push(targetOrgId);
                    }
                  }

                  // If any add failed OR verification came up empty, ABORT
                  // before deleting anything. This preserves the source copy
                  // so the user can retry / roll back manually.
                  if (addFailures.length > 0 || missingTargets.length > 0) {
                    console.error(
                      "[MoveTenant] add phase failed — skipping deletes",
                      { addFailures, missingTargets },
                    );
                    toast.error(
                      `Add failed for ${addFailures.length || missingTargets.length} target tenant(s) — old copies were NOT deleted so you can retry`,
                    );
                    setIsMoving(false);
                    return;
                  }

                  // 3) Now delete from old tenants (only reached if all adds
                  //    landed and verified).
                  const removedOk: string[] = [];
                  const removeFailures: string[] = [];
                  for (const oldOrgId of toRemove) {
                    if (selectedSet.has(oldOrgId)) {
                      throw new Error(
                        `[MoveTenant] refused delete on selected tenant ${oldOrgId}`,
                      );
                    }
                    console.log(`[MoveTenant] delete -> ${oldOrgId}`);
                    let deleted = false;
                    try {
                      const dr = await deleteDatastoreItem(
                        incident.id,
                        DATASTORE_CATEGORIES.INCIDENTS,
                        oldOrgId,
                        tenantRegionOptions(oldOrgId),
                      );
                      deleted = !!dr.success;
                    } catch {
                      deleted = false;
                    }
                    if (deleted) removedOk.push(oldOrgId);
                    else removeFailures.push(oldOrgId);
                  }

                  // 4) Verify each deletion (one read per removed tenant).
                  const stillPresent: string[] = [];
                  for (const oldOrgId of toRemove) {
                    try {
                      const check = await getDatastoreItem(
                        incident.id,
                        DATASTORE_CATEGORIES.INCIDENTS,
                        oldOrgId,
                        tenantRegionOptions(oldOrgId),
                      );
                      if (check?.success && check.item?.value)
                        stillPresent.push(oldOrgId);
                    } catch {
                      /* ignore */
                    }
                  }
                  if (stillPresent.length > 0) {
                    console.error(
                      "[MoveTenant] delete not honored by backend",
                      stillPresent,
                    );
                    toast.error(
                      `Incident still present in ${stillPresent.length} old tenant(s) — backend did not delete (new copies are live, safe to retry delete)`,
                    );
                  }

                  if (removeFailures.length > 0) {
                    toast.error(
                      `Removed from ${removedOk.length}/${toRemove.length} tenants — could not delete from ${removeFailures.length}`,
                    );
                  } else if (toAdd.length > 0 && toRemove.length > 0) {
                    toast.success(
                      `Incident moved — added to ${toAdd.length}, removed from ${toRemove.length}`,
                    );
                  } else if (toAdd.length > 0) {
                    toast.success(
                      `Incident added to ${toAdd.length} tenant${toAdd.length === 1 ? "" : "s"}`,
                    );
                  } else {
                    toast.success(
                      `Incident removed from ${toRemove.length} tenant${toRemove.length === 1 ? "" : "s"}`,
                    );
                  }

                  setShowMoveDialog(false);

                  // Refresh local presence state so the header banner and
                  // the next open of this dialog reflect the new tenant set
                  // without needing a page reload.
                  // `activeId` was already computed above for validation.
                  const stayingOrgId = toRemove.includes(sourceOrgId)
                    ? activeId && selected.has(activeId)
                      ? activeId
                      : Array.from(selected)[0]
                    : sourceOrgId;
                  const knownOrgLookup = new Map<
                    string,
                    { id: string; name: string; image?: string }
                  >();
                  if (userInfo?.active_org)
                    knownOrgLookup.set(userInfo.active_org.id, {
                      id: userInfo.active_org.id,
                      name: userInfo.active_org.name || userInfo.active_org.id,
                      image: userInfo.active_org.image,
                    });
                  if (parentOrg)
                    knownOrgLookup.set(parentOrg.id, {
                      id: parentOrg.id,
                      name: parentOrg.name || parentOrg.id,
                      image: (parentOrg as any).image,
                    });
                  for (const so of subOrgs)
                    knownOrgLookup.set(so.id, {
                      id: so.id,
                      name: so.name || so.id,
                      image: (so as any).image,
                    });
                  for (const so of sharedOrgs)
                    knownOrgLookup.set(so.id, {
                      id: so.id,
                      name: so.name || so.id,
                      image: so.image,
                    });
                  const nextSharedOrgs = Array.from(selected)
                    .filter((oid) => oid !== stayingOrgId)
                    .map(
                      (oid) =>
                        knownOrgLookup.get(oid) || {
                          id: oid,
                          name: oid.slice(0, 8) + "…",
                        },
                    );
                  setSharedOrgs(nextSharedOrgs);

                  // Strip the stale shared_orgs URL param so a later reload
                  // doesn't seed the old presence set back into state.
                  if (searchParams.get("shared_orgs")) {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete("shared_orgs");
                    setSearchParams(nextParams, { replace: true });
                  }

                  // Navigate away if the current tenant is no longer in the
                  // selection. Prefer active tenant if it still holds a copy,
                  // otherwise the first selected tenant.
                  if (toRemove.includes(sourceOrgId)) {
                    if (stayingOrgId) {
                      const newKey =
                        stayingOrgId === activeId
                          ? incident.id
                          : `${stayingOrgId}::${incident.id}`;
                      navigate(`${entityBasePath}/${newKey}`, {
                        replace: true,
                      });
                    } else {
                      navigate(entityBasePath, { replace: true });
                    }
                  }
                } catch (err: any) {
                  console.error("[MoveTenant] failed", err);
                  toast.error(err?.message || "Move failed");
                } finally {
                  setIsMoving(false);
                }
              }}
              sx={{
                textTransform: "none",
                bgcolor: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                "&:hover": { bgcolor: "hsl(var(--primary) / 0.9)" },
              }}
            >
              {isMoving ? "Applying…" : "Apply"}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Threat Intel App Search Drawer */}
      <AppSearchDrawer
        open={showThreatIntelDrawer}
        onClose={() => setShowThreatIntelDrawer(false)}
        initialQuery="threat intel"
        title="Threat Intel Apps"
        subtitle="Enable and authenticate an app to run IOC lookups"
        priorityCategory="Threat Intel"
      />

      {/* Forwarding / Email Tools App Search Drawer */}
      <AppSearchDrawer
        open={showForwardAppsDrawer}
        onClose={() => {
          setShowForwardAppsDrawer(false);
          // Re-open the forward dialog so the user lands back where they started
          // and any newly-authenticated app is picked up on the next fetch.
          setShowForwardDialog(true);
        }}
        initialQuery="email"
        title="Connect an Email Tool"
        subtitle="Authenticate Gmail, Outlook, or another tool to forward incidents"
        priorityCategory="Email"
      />

      {/*
        Soft-delete confirmation for timeline comments. We do NOT remove the
        activity item from the array — instead we flip `deleted: true` on the
        original entity so the timestamp, author and thread anchoring stay
        intact. The renderer shows a muted "Comment deleted" placeholder.
      */}
      <AlertDialog
        open={commentToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setCommentToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              The comment text will be removed, but the entry stays in the
              timeline so the original timestamp, author and thread position are
              preserved. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = commentToDelete;
                if (!id) return;
                setActivity((prev) =>
                  prev.map((a) =>
                    a.id === id
                      ? {
                          ...a,
                          deleted: true,
                          deletedAt: Date.now(),
                          // Strip body + attachments so the deleted text and
                          // any uploaded files are not still present in the
                          // persisted incident JSON. The shell of the entity
                          // (id, type, user, timestamp, replyTo*) survives.
                          content: "",
                          attachments: [],
                        }
                      : a,
                  ),
                );
                pendingSaveRef.current = true;
                if (saveTimeoutRef.current)
                  clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = setTimeout(() => {
                  saveToDatastore();
                }, 500);
                toast.success("Comment deleted");
                setCommentToDelete(null);
              }}
            >
              Delete comment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Agent execution drawer — opened when clicking an agent row in the timeline */}
      <AgentExecutionDrawer
        open={!!selectedAgentRun}
        onClose={() => setSelectedAgentRun(null)}
        run={selectedAgentRun}
        onSchedule={handleScheduleAgentRun}
      />

      {/* Workflow-run explorer — opened when clicking a "Workflow run" pill in the timeline */}
      <WorkflowRunExplorerDrawer
        open={!!selectedWorkflowExecutionId}
        executionId={selectedWorkflowExecutionId || ""}
        onClose={() => setSelectedWorkflowExecutionId(null)}
        theme={resolvedTheme}
      />
    </motion.div>
  );
};

export default IncidentDetailPage;
