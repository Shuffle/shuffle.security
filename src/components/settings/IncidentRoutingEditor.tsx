/**
 * IncidentRoutingEditor — multi-tenant incident routing rules.
 *
 * This is a STANDALONE component. It owns its own datastore I/O and does not
 * depend on whatever page hosts it, so it can be moved out of the Tenant
 * Preferences page later (e.g. to its own /routing settings route) by simply
 * importing it elsewhere.
 *
 * Storage:
 *   datastore category: `shuffle-security_routing` on the parent org.
 *   Each item is one rule with the shape defined in `RoutingRule` below.
 *
 * Execution model:
 *   The UI does NOT move incidents. A workflow ("When an Incident is
 *   edited") reads these rules, evaluates them, and writes a
 *   `routing_suggestions` array onto the incident. The incident detail page
 *   surfaces the suggestion as a CTA the user can act on.
 *
 * Visibility:
 *   Only meaningful on a parent org (tenants exist). The hosting page
 *   should hide this card when there are no sub-orgs.
 */
import { Plus as AddIcon, Trash as DeleteOutlineIcon, Copy as ContentCopyIcon, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon } from 'lucide-react';
import { useEffect, useMemo, useState, useCallback, type JSX } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  NEON,
  TooltipContent,
  buildBuckets,
  bucketIndexOf,
} from '@/Shuffle-Core/components/dashboard/_shared';
import {
  RoutingActionFields,
  ROUTING_ACTION_TYPE_LABELS,
  ROUTING_SEVERITY_OPTIONS,
  ROUTING_STATUS_OPTIONS,
  ROUTING_PRIORITY_OPTIONS,
  ROUTING_FIELD_SUGGESTIONS,
  defaultRoutingAction,
  validateRoutingAction,
  resolveTenantRegionPatch,
  type RoutingOrgOption,
} from './RoutingActionFields';

import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  MenuItem,
  Switch,
  Tooltip,
  Chip,
  Stack,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Select,
  Divider,
} from '@mui/material';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useDatastore } from '@/hooks/useDatastore';
import { useSubOrgs } from '@/hooks/useSubOrgs';
import { useAuth } from '@/context/AuthContext';
import { useWorkflows } from '@/hooks/useWorkflows';
import { invalidateWorkflowsCache } from '@/Shuffle-Core/views/appsFetchCache';
import { getDatastoreByCategory } from '@/Shuffle-Core/datastore';
import { DatastoreCategorySelect, DATASTORE_CATEGORY_OPTIONS } from '@/Shuffle-Core/components/DatastoreCategorySelect';
import {
  findRoutingWorkflow,
  getExpectedRoutingWorkflowLabel,
  evaluateRoutingWorkflowHealth,
  type RoutingWorkflowHealth,
  type RoutingWorkflowExecutionSummary,
} from '@/utils/routingWorkflowUtils';
import {
  evaluateRoutingRules,
} from '@/utils/routingRuleEvaluator';
import {
  MAX_GROUP_DEPTH,
  emptyLeaf,
  emptyGroup,
  migrateLegacyConditions,
  flattenTreeToLegacy,
  updateNode,
  removeNode,
  appendChild,
  treeDepth,
  type ConditionGroup,
  type ConditionLeaf,
  type ConditionNode,
  type NodePath,
} from '@/utils/routingConditionTree';

export const ROUTING_DATASTORE_CATEGORY = 'shuffle-security_routing';

export type RoutingConditionOp =
  | 'equals'
  | 'contains'
  | 'regex'
  | 'startsWith'
  | 'endsWith'
  | 'exists';

export interface RoutingCondition {
  field: string; // e.g. "title", "source", "observables.email", "labels", "stakeholders.email", or "*" for the whole object
  op: RoutingConditionOp;
  value?: string;
  /**
   * When true, this condition joins the PREVIOUS condition as an OR
   * alternative. Groups formed this way are then AND'd together. The first
   * condition in a rule ignores this flag (nothing to OR with).
   */
  or?: boolean;
}


export type RoutingActionType =
  | 'suggest_move'
  | 'set_severity'
  | 'set_status'
  | 'set_priority'
  | 'add_label'
  | 'assign_to'
  | 'add_comment'
  | 'run_agent'
  | 'set_field';

export interface RoutingAction {
  type: RoutingActionType;
  /** Target tenant id — only for suggest_move. */
  targetOrgId?: string;
  /** Target tenant display name — only for suggest_move. */
  targetOrgName?: string;
  /** Target tenant region code on Shuffle Cloud — only for suggest_move. */
  region?: string;
  targetRegion?: string;
  /** Target tenant regional backend URL on Shuffle Cloud — only for suggest_move. */
  region_url?: string;
  targetRegionUrl?: string;
  /** Target field path — only for set_field. */
  field?: string;
  /** Value applied / suggested. Severity/status use the canonical string. */
  value?: string;
  /** Optional human-readable reason shown in the suggestion banner. */
  reason?: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchMode: 'all' | 'any';
  conditions: RoutingCondition[];
  /**
   * Nested AND/OR condition tree (source of truth when present). Legacy
   * `conditions[]` + `matchMode` remain populated for backwards compat with
   * older workflow evaluators.
   */
  conditionTree?: ConditionGroup;
  /** Multiple suggestions can fire per rule. */
  actions: RoutingAction[];
  createdBy?: string;
  createdTs?: number;
  updatedTs?: number;
  lastMatchedTs?: number;
  matchCount?: number;
  /**
   * Datastore category this rule applies to (e.g.
   * `shuffle-security_incidents`, `shuffle-security_vulns`). Rules saved
   * before this field existed are treated as incident rules.
   */
  entityCategory?: string;
}

const FIELD_SUGGESTIONS = ROUTING_FIELD_SUGGESTIONS;

const FIELD_LABELS: Record<string, string> = {
  '*': '* (whole item, auto base64-decoded)',
};


const OP_LABELS: Record<RoutingConditionOp, string> = {
  equals: 'equals',
  contains: 'contains',
  regex: 'matches regex',
  startsWith: 'starts with',
  endsWith: 'ends with',
  exists: 'exists',
};

export const ACTION_TYPE_LABELS = ROUTING_ACTION_TYPE_LABELS;

const SEVERITY_OPTIONS = ROUTING_SEVERITY_OPTIONS;
const STATUS_OPTIONS = ROUTING_STATUS_OPTIONS;
const PRIORITY_OPTIONS = ROUTING_PRIORITY_OPTIONS;

const newId = () =>
  `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const defaultActionFor = defaultRoutingAction;


const emptyRule = (defaults: Partial<RoutingRule> = {}): RoutingRule => ({
  id: newId(),
  name: 'New rule',
  enabled: true,
  priority: 100,
  matchMode: 'all',
  conditions: [{ field: 'rawOCSF.unmapped_original.to', op: 'contains', value: '' }],
  conditionTree: emptyGroup('and', [
    emptyLeaf({ field: 'rawOCSF.unmapped_original.to', op: 'contains', value: '' }),
  ]),
  actions: [defaultActionFor('suggest_move')],
  createdTs: Date.now(),
  updatedTs: Date.now(),
  matchCount: 0,
  ...defaults,
});

const sanitizeTree = (raw: any): ConditionGroup | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const walk = (n: any, depth: number): ConditionNode | null => {
    if (!n || typeof n !== 'object') return null;
    if (n.kind === 'condition') {
      return {
        kind: 'condition',
        field: typeof n.field === 'string' ? n.field : 'title',
        op: n.op || 'contains',
        value: typeof n.value === 'string' ? n.value : undefined,
      };
    }
    if (n.kind === 'group' && Array.isArray(n.children)) {
      const children = n.children
        .map((c: any) => walk(c, depth + 1))
        .filter((c: any): c is ConditionNode => !!c);
      if (children.length === 0) return null;
      return { kind: 'group', op: n.op === 'or' ? 'or' : 'and', children };
    }
    return null;
  };
  const root = walk(raw, 1);
  return root && root.kind === 'group' ? root : undefined;
};

const parseRule = (key: string, value: string): RoutingRule | null => {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    // Backward compat: legacy single `action` -> `actions: [action]`.
    let actions: RoutingAction[] = [];
    if (Array.isArray(parsed.actions)) {
      actions = parsed.actions.filter((a: any) => a && typeof a.type === 'string');
    } else if (parsed.action && typeof parsed.action === 'object') {
      actions = [{
        type: (parsed.action.type as RoutingActionType) || 'suggest_move',
        targetOrgId: parsed.action.targetOrgId,
        targetOrgName: parsed.action.targetOrgName,
        region: parsed.action.region,
        targetRegion: parsed.action.targetRegion,
        region_url: parsed.action.region_url,
        targetRegionUrl: parsed.action.targetRegionUrl,
        field: parsed.action.field,
        value: parsed.action.value,
        reason: parsed.action.reason,
      }];
    }
    if (actions.length === 0) actions = [defaultActionFor('suggest_move')];
    return {
      id: parsed.id || key,
      name: typeof parsed.name === 'string' ? parsed.name : 'Untitled rule',
      enabled: parsed.enabled !== false,
      priority: Number.isFinite(parsed.priority) ? parsed.priority : 100,
      matchMode: parsed.matchMode === 'any' ? 'any' : 'all',
      conditions: Array.isArray(parsed.conditions)
        ? parsed.conditions.map((c: any) => ({
            field: typeof c?.field === 'string' ? c.field : 'title',
            op: c?.op || 'contains',
            value: typeof c?.value === 'string' ? c.value : undefined,
            or: c?.or === true,
          }))
        : [],

      conditionTree: sanitizeTree(parsed.conditionTree),
      actions,
      createdBy: parsed.createdBy,
      createdTs: parsed.createdTs,
      updatedTs: parsed.updatedTs,
      lastMatchedTs: parsed.lastMatchedTs,
      matchCount: Number.isFinite(parsed.matchCount) ? parsed.matchCount : 0,
      entityCategory: typeof parsed.entityCategory === 'string' ? parsed.entityCategory : undefined,
    };
  } catch {
    return null;
  }
};

const summarizeAction = (a: RoutingAction, orgName?: string): string => {
  switch (a.type) {
    case 'suggest_move': return `move to ${orgName || a.targetOrgId || 'no target'}`;
    case 'set_severity': return `set severity to ${a.value || '?'}`;
    case 'set_status': return `set status to ${a.value || '?'}`;
    case 'set_priority': return `set priority to ${a.value || '?'}`;
    case 'add_label': return `add label "${a.value || ''}"`;
    case 'assign_to': return `assign to ${a.value || '?'}`;
    case 'add_comment': return `add comment`;
    case 'run_agent': return `run AI agent`;
    case 'set_field': return `set ${a.field || '?'} = "${a.value || ''}"`;
  }
};

export const DEFAULT_ROUTING_ENTITY_CATEGORY = 'shuffle-security_incidents';

interface IncidentRoutingEditorProps {
  /**
   * When true, render even if no sub-orgs exist. The component will warn
   * inline that rules need a target tenant. Useful for previewing.
   */
  forceShow?: boolean;
  /**
   * Datastore category the rules apply to. Rules are stamped with it and
   * the list is filtered by it, so the same editor serves incidents,
   * vulnerabilities, assets and so on.
   */
  entityCategory?: string;
  /** Entity naming used in copy. Defaults to incident/incidents. */
  entityLabel?: { singular: string; plural: string };
  /**
   * Category passed to POST /api/v2/workflows/generate when the backing
   * routing workflow is auto-created. Defaults to "cases" for incidents, or
   * entityCategory for other entities.
   */
  generateCategory?: string;
  /**
   * Drop the editor's own card styling (borders and tinted fills) so its
   * sections sit directly on the surrounding surface. Used by the usecase
   * drawer, which has no paper of its own.
   */
  borderless?: boolean;
  /**
   * Show the shared datastore category dropdown in the rules toolbar so rules
   * can be managed per category. Defaults to true. Hosts that already render
   * the same dropdown (the "Automation for X" dialog) pass false.
   */
  showCategorySelect?: boolean;
  /**
   * Compact category control rendered next to the "Add rule" button. Set by
   * the wrapper when showCategorySelect is true; hosts that render their own
   * dropdown leave it undefined.
   */
  categorySelect?: React.ReactNode;
  /**
   * Called when the user picks another category in the shared dropdown. When
   * provided, the dropdown is controlled: `entityCategory` is the current
   * selection and the component stops keeping the selection itself, so a host
   * that shows the category elsewhere (e.g. the area title) can follow it.
   */
  onCategoryChange?: (category: string) => void;
}

export const IncidentRoutingEditor = ({
  showCategorySelect = true,
  onCategoryChange,
  ...props
}: IncidentRoutingEditorProps) => {
  const initial = props.entityCategory || DEFAULT_ROUTING_ENTITY_CATEGORY;
  const [selected, setSelected] = useState<string>(initial);
  useEffect(() => { setSelected(initial); }, [initial]);
  if (!showCategorySelect) return <IncidentRoutingEditorInner {...props} />;

  // Controlled when the host owns the selection, uncontrolled otherwise.
  const controlled = typeof onCategoryChange === 'function';
  const value = controlled ? initial : selected;
  const handleCategoryChange = (next: string) => {
    if (controlled) {
      if (next !== value) onCategoryChange?.(next);
    } else {
      setSelected(next);
    }
  };

  const opt = DATASTORE_CATEGORY_OPTIONS.find(o => o.category === value);
  // The category the host asked for keeps the host's own naming; a category
  // picked from the dropdown uses the shared option naming instead.
  const isInitial = controlled ? false : value === initial;
  return (
    <IncidentRoutingEditorInner
      key={value}
      {...props}
      entityCategory={value}
      entityLabel={isInitial ? props.entityLabel : (opt ? { singular: opt.singular, plural: opt.plural } : undefined)}
      generateCategory={isInitial ? props.generateCategory : undefined}
      categorySelect={
        <DatastoreCategorySelect
          value={value}
          onChange={handleCategoryChange}
          label="Category"
          compact
        />
      }
    />
  );
};

export { IncidentRoutingEditor as RoutingEditor };

const extractRuleStatValue = (entry: any, ruleId: string): number => {
  if (!entry || typeof entry !== 'object' || !ruleId) return 0;
  const statKey = `routing_rule_${ruleId}`;
  const totalKey = `total_routing_rule_${ruleId}`;
  if (entry[statKey] != null && typeof entry[statKey] !== 'object') {
    return Number(entry[statKey]) || 0;
  }
  if (entry[totalKey] != null && typeof entry[totalKey] !== 'object') {
    return Number(entry[totalKey]) || 0;
  }
  const additions = Array.isArray(entry.additions) ? entry.additions : [];
  const hit = additions.find(
    (a: any) => a?.key === statKey || a?.key === totalKey || a?.key === ruleId,
  );
  return hit ? Number(hit.value) || 0 : 0;
};

const IncidentRoutingEditorInner = ({
  forceShow = false,
  entityCategory = DEFAULT_ROUTING_ENTITY_CATEGORY,
  entityLabel = { singular: 'incident', plural: 'incidents' },
  generateCategory,
  borderless = false,
  categorySelect,
}: IncidentRoutingEditorProps) => {
  const entityPluralCap = entityLabel.plural.charAt(0).toUpperCase() + entityLabel.plural.slice(1);
  const effectiveGenerateCategory =
    generateCategory ||
    (entityCategory === DEFAULT_ROUTING_ENTITY_CATEGORY ? 'cases' : entityCategory);
  const { userInfo } = useAuth();
  const currentOrgId = userInfo?.active_org?.id;
  const { subOrgs, isParentOrg } = useSubOrgs(currentOrgId);

  const { items, isLoading, hasFetched, fetchItems, addItem, removeItem } = useDatastore({
    category: ROUTING_DATASTORE_CATEGORY,
  });

  const { data: workflows = [], isLoading: workflowsLoading, refetch: refetchWorkflows } = useWorkflows();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => {
      refetchWorkflows();
    };
    window.addEventListener('shuffle-workflows-updated', handleUpdate);
    window.addEventListener('shuffle-workflow-toggled', handleUpdate);
    return () => {
      window.removeEventListener('shuffle-workflows-updated', handleUpdate);
      window.removeEventListener('shuffle-workflow-toggled', handleUpdate);
    };
  }, [refetchWorkflows]);

  const matchedWorkflow = useMemo(
    () => findRoutingWorkflow(workflows, entityLabel, entityCategory),
    [workflows, entityLabel, entityCategory],
  );

  const [categoryConfig, setCategoryConfig] = useState<any>(null);
  const [lastExecution, setLastExecution] = useState<RoutingWorkflowExecutionSummary | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isHookingWorkflow, setIsHookingWorkflow] = useState(false);
  const [orgStats, setOrgStats] = useState<any>(null);

  const fetchOrgStats = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const res = await fetch(getApiUrl(`/api/v1/orgs/${currentOrgId}/stats`), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setOrgStats(data);
      }
    } catch (e) {
      console.warn('Failed to fetch org stats for routing rules:', e);
    }
  }, [currentOrgId]);

  useEffect(() => {
    fetchOrgStats();
  }, [fetchOrgStats]);

  const buckets30d = useMemo(() => buildBuckets(30, 'daily'), []);

  const getRuleTriggerStats = useCallback(
    (ruleId: string): { totalLast30Days: number; dailySeries: Array<{ date: string; Triggers: number }> } => {
      const acc = new Array(buckets30d.length).fill(0);
      const dailyList = Array.isArray(orgStats?.daily_statistics) ? orgStats.daily_statistics : [];
      for (const d of dailyList) {
        if (!d?.date) continue;
        const idx = bucketIndexOf(buckets30d, new Date(d.date).getTime());
        if (idx >= 0) {
          acc[idx] += extractRuleStatValue(d, ruleId);
        }
      }
      let dailySum = acc.reduce((a, b) => a + b, 0);
      if (dailySum === 0 && orgStats && acc.length > 0) {
        const topVal = extractRuleStatValue(orgStats, ruleId);
        if (topVal > 0) {
          acc[acc.length - 1] = topVal;
          dailySum = topVal;
        }
      }
      return {
        totalLast30Days: dailySum,
        dailySeries: buckets30d.map((b, i) => ({ date: b.label, Triggers: acc[i] })),
      };
    },
    [orgStats, buckets30d],
  );

  const fetchWorkflowHealth = useCallback(async () => {
    if (!currentOrgId) return;
    setIsLoadingHealth(true);
    try {
      const catRes: any = await getDatastoreByCategory(entityCategory, undefined, 1, currentOrgId).catch(() => null);
      if (catRes?.categoryConfig) {
        setCategoryConfig(catRes.categoryConfig);
      }

      if (matchedWorkflow?.id) {
        try {
          const execRes = await fetch(getApiUrl(`/api/v2/workflows/${matchedWorkflow.id}/executions?limit=1`), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
          if (execRes.ok) {
            const execData = await execRes.json();
            const list = Array.isArray(execData) ? execData : execData?.executions || [];
            if (list.length > 0) {
              const latest = list[0];
              setLastExecution({
                id: latest.execution_id || latest.id,
                status: latest.status || 'unknown',
                started_at: latest.started_at || latest.created_at,
                completed_at: latest.completed_at,
                error: latest.error || latest.failure_reason,
              });
            } else {
              setLastExecution(null);
            }
          }
        } catch (e) {
          console.warn('Failed to fetch workflow executions:', e);
        }
      }
    } catch (err) {
      console.warn('Failed to load category config:', err);
    } finally {
      setIsLoadingHealth(false);
    }
  }, [currentOrgId, entityCategory, matchedWorkflow?.id]);

  useEffect(() => {
    fetchWorkflowHealth();
    if (typeof window === 'undefined') return;
    const handleCatUpdate = () => { fetchWorkflowHealth(); };
    window.addEventListener('shuffle-category-automations-updated', handleCatUpdate);
    return () => window.removeEventListener('shuffle-category-automations-updated', handleCatUpdate);
  }, [fetchWorkflowHealth]);

  const workflowHealth: RoutingWorkflowHealth = useMemo(() => {
    return evaluateRoutingWorkflowHealth({
      workflow: matchedWorkflow,
      categoryConfig,
      lastExecution,
      loading: workflowsLoading || isLoadingHealth,
      entityLabel,
    });
  }, [matchedWorkflow, categoryConfig, lastExecution, workflowsLoading, isLoadingHealth, entityLabel]);

  const handleLinkHook = async () => {
    if (!matchedWorkflow?.id || !currentOrgId) return;
    setIsHookingWorkflow(true);
    try {
      const currentAutomations = Array.isArray(categoryConfig?.automations)
        ? [...categoryConfig.automations]
        : Array.isArray(categoryConfig?.Automations)
          ? [...categoryConfig.Automations]
          : [];

      const existingIdx = currentAutomations.findIndex(
        (a: any) => (a?.name || a?.Name || '').toLowerCase() === 'run workflow'
      );

      if (existingIdx >= 0) {
        const existingAuto = { ...currentAutomations[existingIdx] };
        existingAuto.enabled = true;
        const options = Array.isArray(existingAuto.options)
          ? [...existingAuto.options]
          : Array.isArray(existingAuto.Options)
            ? [...existingAuto.Options]
            : [];
        const wfOptIdx = options.findIndex((o: any) => (o.key || o.Key || '').toLowerCase() === 'workflow_id');
        if (wfOptIdx >= 0) {
          const currentVal = String(options[wfOptIdx].value || options[wfOptIdx].Value || '');
          const ids = currentVal.split(',').map((id: string) => id.trim()).filter(Boolean);
          if (!ids.includes(matchedWorkflow.id)) {
            ids.push(matchedWorkflow.id);
          }
          options[wfOptIdx] = { ...options[wfOptIdx], value: ids.join(',') };
        } else {
          options.push({ key: 'workflow_id', value: matchedWorkflow.id });
        }
        existingAuto.options = options;
        currentAutomations[existingIdx] = existingAuto;
      } else {
        currentAutomations.push({
          name: 'Run workflow',
          description: 'Runs one or more workflows with the updated value as runtime argument',
          type: 'workflow',
          enabled: true,
          options: [{ key: 'workflow_id', value: matchedWorkflow.id }],
        });
      }

      const payload = {
        category: entityCategory,
        automations: currentAutomations,
        settings: categoryConfig?.settings || categoryConfig?.Settings || {},
      };

      const res = await fetch(getApiUrl('/api/v2/datastore/automate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed to update category automation (${res.status})`);
      }

      toast.success(`Added "${matchedWorkflow.name}" to Automation for ${entityPluralCap}`);
      window.dispatchEvent(
        new CustomEvent('shuffle-category-automations-updated', {
          detail: { category: entityCategory },
        }),
      );
      await fetchWorkflowHealth();
    } catch (err: any) {
      console.error('Failed to link category automation hook:', err);
      toast.error(err?.message || 'Failed to add workflow to category automations');
    } finally {
      setIsHookingWorkflow(false);
    }
  };

  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const handleGenerateWorkflow = async () => {
    setIsGeneratingWorkflow(true);
    const targetLabel = getExpectedRoutingWorkflowLabel(entityLabel, entityCategory);
    const effectiveCategory =
      entityCategory === 'shuffle-security_incidents' ? 'cases' : entityCategory;
    try {
      const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(currentOrgId), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: targetLabel,
          category: effectiveCategory,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.reason || `Failed to create workflow (${res.status})`);
      }
      invalidateWorkflowsCache();
      toast.success(`Workflow "${targetLabel}" created`);
      window.dispatchEvent(
        new CustomEvent('shuffle-workflow-toggled', {
          detail: { label: targetLabel, enabled: true },
        }),
      );
      window.dispatchEvent(new CustomEvent('shuffle-workflows-updated'));
      window.dispatchEvent(
        new CustomEvent('shuffle-category-automations-updated', {
          detail: { category: entityCategory },
        }),
      );
      await refetchWorkflows();
      await fetchWorkflowHealth();
    } catch (err: any) {
      console.error('Failed to create routing workflow:', err);
      toast.error(err?.message || 'Failed to create routing workflow');
    } finally {
      setIsGeneratingWorkflow(false);
    }
  };

  // Test modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecords, setTestRecords] = useState<any[]>([]);
  const [loadingTestRecords, setLoadingTestRecords] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('manual');
  const [customRecordJson, setCustomRecordJson] = useState<string>(
    JSON.stringify(
      {
        title: 'Suspicious PowerShell Execution',
        description: 'Encoded PowerShell command executed by WIN-SRV01\\svc-backup',
        severity: 'high',
        status: 'open',
        source: 'CrowdStrike',
        labels: ['malware', 'powershell', 't1059.001'],
        observables: [
          { type: 'ip', value: '198.51.100.42' },
          { type: 'hostname', value: 'WIN-SRV01' },
        ],
      },
      null,
      2,
    ),
  );

  const handleOpenTestModal = async () => {
    setTestModalOpen(true);
    if (!currentOrgId) return;
    setLoadingTestRecords(true);
    try {
      const res: any = await getDatastoreByCategory(entityCategory, undefined, 5, currentOrgId).catch(() => null);
      const itemsList = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setTestRecords(itemsList);
      if (itemsList.length > 0) {
        const first = itemsList[0];
        const recordId = first.id || first.key || '0';
        setSelectedRecordId(recordId);
        setCustomRecordJson(JSON.stringify(first.data || first, null, 2));
      }
    } catch {
      // Best-effort
    } finally {
      setLoadingTestRecords(false);
    }
  };

  const handleSelectRecord = (id: string) => {
    setSelectedRecordId(id);
    if (id === 'manual') return;
    const found = testRecords.find((r) => (r.id || r.key) === id);
    if (found) {
      setCustomRecordJson(JSON.stringify(found.data || found, null, 2));
    }
  };

  const parsedTestContext = useMemo(() => {
    try {
      return JSON.parse(customRecordJson);
    } catch {
      return null;
    }
  }, [customRecordJson]);


  // Local draft state — only saved on explicit "Save" per rule.
  const [drafts, setDrafts] = useState<Record<string, RoutingRule>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // IDs that exist only in the browser (not yet saved to the datastore).
  const [localOnlyIds, setLocalOnlyIds] = useState<Set<string>>(new Set());
  // Per-rule expand/collapse. Saved rules default collapsed; new rules open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate drafts from the datastore, but PRESERVE any in-flight local drafts
  // (newly added rules that have not been saved yet).
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RoutingRule> = {};
      // Keep local-only drafts as-is.
      for (const id of localOnlyIds) {
        if (prev[id]) next[id] = prev[id];
      }
      for (const it of items) {
        const rule = parseRule(it.key, typeof it.value === 'string' ? it.value : JSON.stringify(it.value));
        if (!rule) continue;
        // Only show rules belonging to the entity this editor is scoped to.
        // Rules saved before `entityCategory` existed are incident rules.
        const cat = rule.entityCategory || DEFAULT_ROUTING_ENTITY_CATEGORY;
        if (cat !== entityCategory) continue;
        next[rule.id] = rule;
      }
      return next;
    });
  }, [items, localOnlyIds, entityCategory]);

  const sortedRules = useMemo(
    () =>
      Object.values(drafts).sort((a, b) => {
        // Unsaved (freshly added) rules always float to the top so it's
        // obvious a new one was just created.
        const aLocal = localOnlyIds.has(a.id) ? 0 : 1;
        const bLocal = localOnlyIds.has(b.id) ? 0 : 1;
        if (aLocal !== bLocal) return aLocal - bLocal;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.createdTs || 0) - (b.createdTs || 0);
      }),
    [drafts, localOnlyIds]
  );

  const testEvaluationResults = useMemo(() => {
    if (!parsedTestContext) return [];
    return evaluateRoutingRules(parsedTestContext, sortedRules, entityCategory);
  }, [parsedTestContext, sortedRules, entityCategory]);

  const updateRule = (id: string, patch: Partial<RoutingRule>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, updatedTs: Date.now() } }));
  };

  const updateCondition = (id: string, idx: number, patch: Partial<RoutingCondition>) => {
    setDrafts((prev) => {
      const r = prev[id];
      if (!r) return prev;
      const conds = r.conditions.slice();
      conds[idx] = { ...conds[idx], ...patch };
      return { ...prev, [id]: { ...r, conditions: conds, updatedTs: Date.now() } };
    });
  };

  const addCondition = (id: string, asOr: boolean = false) => {
    setDrafts((prev) => {
      const r = prev[id];
      if (!r) return prev;
      return {
        ...prev,
        [id]: {
          ...r,
          conditions: [
            ...r.conditions,
            { field: 'title', op: 'contains', value: '', or: asOr && r.conditions.length > 0 },
          ],
          updatedTs: Date.now(),
        },
      };
    });
  };

  const removeCondition = (id: string, idx: number) => {
    setDrafts((prev) => {
      const r = prev[id];
      if (!r) return prev;
      const conds = r.conditions.filter((_, i) => i !== idx);
      return { ...prev, [id]: { ...r, conditions: conds, updatedTs: Date.now() } };
    });
  };

  const orgOptions = useMemo(() => {
    const opts: RoutingOrgOption[] = [];
    if (currentOrgId) {
      opts.push({
        id: currentOrgId,
        name: `${userInfo?.active_org?.name || 'This tenant'} (current)`,
        region_url: userInfo?.active_org?.region_url,
      });
    }
    for (const so of subOrgs) {
      opts.push({
        id: so.id,
        name: so.name || so.id.slice(0, 8),
        region_url: so.region_url,
      });
    }
    return opts;
  }, [subOrgs, currentOrgId, userInfo]);

  const handleSave = async (rule: RoutingRule) => {
    if (!rule.name.trim()) {
      toast.error('Give the rule a name first');
      return;
    }
    if (rule.actions.length === 0) {
      toast.error('Add at least one action');
      return;
    }
    for (const a of rule.actions) {
      const err = validateRoutingAction(a);
      if (err) {
        toast.error(err);
        return;
      }

      if (a.type === 'set_field' && !a.field) {
        toast.error('Pick a field for "Set custom field"');
        return;
      }
      if (a.type === 'run_agent' && !String(a.value || '').trim()) {
        toast.error('Write the prompt the AI agent should run');
        return;
      }
    }
    setSaving((p) => ({ ...p, [rule.id]: true }));
    try {
      // Flatten the tree into legacy `conditions[] + matchMode` so external
      // (workflow-side) evaluators still receive something usable. Tree-aware
      // consumers use `conditionTree` as the source of truth.
      const tree = rule.conditionTree || emptyGroup('and', [emptyLeaf()]);
      const legacy = flattenTreeToLegacy(tree);
      const enrichedActions = rule.actions.map((a) =>
        a.type === 'suggest_move' && a.targetOrgId
          ? { ...a, ...resolveTenantRegionPatch(a.targetOrgId, orgOptions) }
          : a,
      );
      const payload: RoutingRule = {
        ...rule,
        actions: enrichedActions,
        conditions: legacy.conditions,
        matchMode: legacy.matchMode,
        conditionTree: tree,
        createdBy: rule.createdBy || userInfo?.username || userInfo?.id,
        createdTs: rule.createdTs || Date.now(),
        updatedTs: Date.now(),
        entityCategory,
      };
      // Pass skipRefresh=false so `items` includes the new rule before we
      // remove it from `localOnlyIds` — otherwise the drafts-rebuild effect
      // drops the just-saved rule from the list.
      const ok = await addItem(rule.id, JSON.stringify(payload), false);
      if (ok) {
        toast.success('Routing rule saved');
        if (items.length === 0 || !matchedWorkflow) {
          try {
            const genLabel = getExpectedRoutingWorkflowLabel(entityLabel, entityCategory);
            await fetch(getApiUrl('/api/v2/workflows/generate'), {
              method: 'POST',
              credentials: 'include',
              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                label: genLabel,
                category: effectiveGenerateCategory,
              }),
            });
            invalidateWorkflowsCache();
            window.dispatchEvent(
              new CustomEvent('shuffle-workflow-toggled', {
                detail: { label: genLabel, enabled: true },
              }),
            );
            window.dispatchEvent(new CustomEvent('shuffle-workflows-updated'));
            await refetchWorkflows();
          } catch (e) {
            console.warn('Auto-enable routing workflow failed:', e);
          }
        }
        // Update local draft in place — no full reload of the area.
        setDrafts((prev) => ({ ...prev, [rule.id]: payload }));
        // Promote local-only rule to "persisted".
        setLocalOnlyIds((prev) => {
          if (!prev.has(rule.id)) return prev;
          const next = new Set(prev);
          next.delete(rule.id);
          return next;
        });
        // Collapse saved rule for a clean overview.
        setExpanded((prev) => ({ ...prev, [rule.id]: false }));
      } else {
        toast.error('Failed to save routing rule');
      }
    } finally {
      setSaving((p) => ({ ...p, [rule.id]: false }));
    }
  };

  const [pendingDelete, setPendingDelete] = useState<RoutingRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = (rule: RoutingRule) => {
    // Local-only (never saved) — just drop it without confirmation.
    if (localOnlyIds.has(rule.id)) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
      setLocalOnlyIds((prev) => {
        const next = new Set(prev);
        next.delete(rule.id);
        return next;
      });
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
      return;
    }
    // Persisted — confirm first.
    setPendingDelete(rule);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const rule = pendingDelete;
    setDeleting(true);
    const snapshot = drafts[rule.id];
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });
    const ok = await removeItem(rule.id);
    setDeleting(false);
    setPendingDelete(null);
    if (ok) {
      toast.success(`Deleted "${rule.name}"`);
    } else {
      toast.error('Failed to delete rule');
      if (snapshot) {
        setDrafts((prev) => ({ ...prev, [rule.id]: snapshot }));
      }
    }
  };


  const handleDuplicate = (rule: RoutingRule) => {
    const copy = emptyRule({
      name: `${rule.name} (copy)`,
      priority: rule.priority + 1,
      matchMode: rule.matchMode,
      conditions: rule.conditions.map((c) => ({ ...c })),
      conditionTree: rule.conditionTree
        ? (JSON.parse(JSON.stringify(rule.conditionTree)) as ConditionGroup)
        : undefined,
      actions: rule.actions.map((a) => ({ ...a })),
      entityCategory,
    });
    setDrafts((prev) => ({ ...prev, [copy.id]: copy }));
    setLocalOnlyIds((prev) => new Set(prev).add(copy.id));
    setExpanded((prev) => ({ ...prev, [copy.id]: true }));
  };

  const handleAdd = () => {
    const defaultTargetOrgId = subOrgs[0]?.id || '';
    const regionPatch = defaultTargetOrgId ? resolveTenantRegionPatch(defaultTargetOrgId, orgOptions) : {};
    const fresh = emptyRule({
      actions: [{ type: 'suggest_move', targetOrgId: defaultTargetOrgId, reason: '', ...regionPatch }],
      entityCategory,
    });
    setDrafts((prev) => ({ ...prev, [fresh.id]: fresh }));
    setLocalOnlyIds((prev) => new Set(prev).add(fresh.id));
    setExpanded((prev) => ({ ...prev, [fresh.id]: true }));
  };

  const updateAction = (ruleId: string, idx: number, patch: Partial<RoutingAction>) => {
    setDrafts((prev) => {
      const r = prev[ruleId];
      if (!r) return prev;
      const actions = r.actions.slice();
      actions[idx] = { ...actions[idx], ...patch };
      return { ...prev, [ruleId]: { ...r, actions, updatedTs: Date.now() } };
    });
  };

  const changeActionType = (ruleId: string, idx: number, type: RoutingActionType) => {
    setDrafts((prev) => {
      const r = prev[ruleId];
      if (!r) return prev;
      const actions = r.actions.slice();
      const prevReason = actions[idx]?.reason;
      actions[idx] = { ...defaultActionFor(type), reason: prevReason };
      if (type === 'suggest_move' && !actions[idx].targetOrgId) {
        const defaultTargetOrgId = subOrgs[0]?.id || '';
        actions[idx] = {
          ...actions[idx],
          targetOrgId: defaultTargetOrgId,
          ...(defaultTargetOrgId ? resolveTenantRegionPatch(defaultTargetOrgId, orgOptions) : {}),
        };
      }
      return { ...prev, [ruleId]: { ...r, actions, updatedTs: Date.now() } };
    });
  };

  const addAction = (ruleId: string) => {
    setDrafts((prev) => {
      const r = prev[ruleId];
      if (!r) return prev;
      return { ...prev, [ruleId]: { ...r, actions: [...r.actions, defaultActionFor('set_severity')], updatedTs: Date.now() } };
    });
  };

  const removeAction = (ruleId: string, idx: number) => {
    setDrafts((prev) => {
      const r = prev[ruleId];
      if (!r) return prev;
      const actions = r.actions.filter((_, i) => i !== idx);
      return { ...prev, [ruleId]: { ...r, actions, updatedTs: Date.now() } };
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!isParentOrg && !forceShow) {
    return (
      <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
        {entityPluralCap} Routing Rules are only available when you have one or more child tenants.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        // Plain small text fields match the height of the small dropdowns next to them.
        '& .MuiInputBase-sizeSmall:not(.MuiInputBase-multiline)': { minHeight: 40 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
            {hasFetched ? `${sortedRules.length} rule${sortedRules.length === 1 ? '' : 's'}` : 'Loading…'}
            {hasFetched && sortedRules.length > 0 && ' · evaluated low-to-high priority'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {categorySelect}
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon size={16} />}
            onClick={handleAdd}
            sx={{
              height: 36,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              textTransform: 'none',
              whiteSpace: 'nowrap',
              '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
            }}
          >
            Add {entityLabel.singular} rule
          </Button>
        </Box>
      </Box>

      {isLoading && !hasFetched && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={20} sx={{ color: 'hsl(var(--primary))' }} />
        </Box>
      )}

      {hasFetched && sortedRules.length === 0 && (
        <Paper
          sx={{
            p: borderless ? 0 : 3,
            bgcolor: borderless ? 'transparent' : 'hsl(var(--muted) / 0.3)',
            border: borderless ? 'none' : '1px dashed hsl(var(--border))',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1 }}>
            No routing rules yet.
          </Typography>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Rules are evaluated by your {entityLabel.singular} automation. When a rule matches, a {entityLabel.singular} shows
            a suggestion banner with a "Move" CTA — your team confirms before anything happens.
          </Typography>
        </Paper>
      )}

      {sortedRules.map((rule) => {
        const isOpen = expanded[rule.id] ?? false;
        const actionSummary = rule.actions
          .map((a) => summarizeAction(a, a.type === 'suggest_move' ? orgOptions.find((o) => o.id === a.targetOrgId)?.name : undefined))
          .join(' · ');
        const ruleTree = rule.conditionTree || migrateLegacyConditions(rule);
        const leafCount = (function count(n: ConditionNode): number {
          return n.kind === 'condition' ? 1 : n.children.reduce((a, c) => a + count(c), 0);
        })(ruleTree);
        const depth = treeDepth(ruleTree);
        const condSummary =
          leafCount === 1 && ruleTree.children[0]?.kind === 'condition'
            ? (() => {
                const c = ruleTree.children[0] as ConditionLeaf;
                return `${c.field} ${OP_LABELS[c.op]}${c.op !== 'exists' ? ` "${c.value || ''}"` : ''}`;
              })()
            : `${leafCount} conditions${depth > 1 ? ` · ${depth} levels` : ''}`;
        const ruleStats = getRuleTriggerStats(rule.id);
        const safeGradId = `rule-stat-grad-${rule.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

        return (
        <Paper
          key={rule.id}
          sx={{
            p: isOpen ? 3 : 1.5,
            bgcolor: borderless ? 'transparent' : 'hsl(var(--card))',
            border: borderless ? 'none' : '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: isOpen ? 2.5 : 0,
            opacity: rule.enabled ? 1 : 0.6,
          }}
        >
          {/* Collapsed summary row */}
          {!isOpen && (
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Box
                onClick={() => toggleExpanded(rule.id)}
                sx={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 0.25 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.name || 'Untitled rule'}
                  </Typography>
                  <Chip
                    label={`p${rule.priority}`}
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                  />
                  {!rule.enabled && (
                    <Chip label="disabled" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }} />
                  )}
                  {localOnlyIds.has(rule.id) && (
                    <Chip label="unsaved" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }} />
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  When {condSummary} · Do {actionSummary}
                </Typography>
              </Box>
              <Tooltip title={`Triggered ${ruleStats.totalLast30Days.toLocaleString()} time${ruleStats.totalLast30Days === 1 ? '' : 's'} in the past 30 days (key: routing_rule_${rule.id})`}>
                <Box
                  onClick={() => toggleExpanded(rule.id)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    px: 1.25,
                    height: 36,
                    borderRadius: 1,
                    border: '1px solid hsl(var(--border))',
                    bgcolor: 'hsl(var(--muted) / 0.25)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    minWidth: 68,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      lineHeight: 1.15,
                      color: ruleStats.totalLast30Days > 0 ? NEON.violet : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {ruleStats.totalLast30Days.toLocaleString()}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.58rem',
                      color: 'hsl(var(--muted-foreground))',
                      lineHeight: 1.1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    last month
                  </Typography>
                </Box>
              </Tooltip>
              <Tooltip title={rule.enabled ? 'Disable rule' : 'Enable rule'}>
                <Switch
                  checked={rule.enabled}
                  onChange={(e) => {
                    updateRule(rule.id, { enabled: e.target.checked });
                    if (!localOnlyIds.has(rule.id)) {
                      // Persist toggle immediately for saved rules.
                      const updated = { ...drafts[rule.id], enabled: e.target.checked, updatedTs: Date.now() };
                      addItem(rule.id, JSON.stringify(updated));
                    }
                  }}
                  size="small"
                />
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => toggleExpanded(rule.id)} sx={{ width: 36, height: 36 }}>
                  <ExpandMoreIcon size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={() => handleDelete(rule)}
                  sx={{
                    width: 36,
                    height: 36,
                    color: 'hsl(var(--muted-foreground))',
                    '&:hover': { color: 'hsl(var(--destructive))' },
                  }}
                >
                  <DeleteOutlineIcon size={18} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {isOpen && (
          <>
          {/* Header row: name + enable + priority + actions */}
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              alignItems: 'center',
              flexWrap: 'wrap',
              pb: 2,
              borderBottom: '1px solid hsl(var(--border) / 0.6)',
            }}
          >
            <TextField
              size="small"
              value={rule.name}
              onChange={(e) => updateRule(rule.id, { name: e.target.value })}
              placeholder="Rule name"
              sx={{ flex: 1, minWidth: 220 }}
              inputProps={{ style: { fontWeight: 600 } }}
            />
            <TextField
              size="small"
              type="number"
              value={rule.priority}
              onChange={(e) => updateRule(rule.id, { priority: Number(e.target.value) || 0 })}
              label="Priority"
              sx={{ width: 100 }}
              inputProps={{ min: 0 }}
            />
            <Tooltip title={rule.enabled ? 'Disable rule' : 'Enable rule'}>
              <Switch
                checked={rule.enabled}
                onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                size="small"
              />
            </Tooltip>
            <Tooltip title="Duplicate">
              <IconButton size="small" onClick={() => handleDuplicate(rule)} sx={{ width: 36, height: 36 }}>
                <ContentCopyIcon size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Collapse">
              <IconButton size="small" onClick={() => toggleExpanded(rule.id)} sx={{ width: 36, height: 36 }}>
                <ExpandLessIcon size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                onClick={() => handleDelete(rule)}
                sx={{
                  width: 36,
                  height: 36,
                  color: 'hsl(var(--muted-foreground))',
                  '&:hover': { color: 'hsl(var(--destructive))' },
                }}
              >
                <DeleteOutlineIcon size={18} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Conditions — recursive AND/OR tree, capped at MAX_GROUP_DEPTH
              levels of nesting. */}
          {(() => {
            const tree = rule.conditionTree || migrateLegacyConditions(rule);

            const commitTree = (next: ConditionGroup) => {
              setDrafts((prev) => ({
                ...prev,
                [rule.id]: { ...prev[rule.id], conditionTree: next, updatedTs: Date.now() },
              }));
            };
            const patchNode = (path: NodePath, updater: (n: ConditionNode) => ConditionNode) => {
              commitTree(updateNode(tree, path, updater));
            };
            const dropNode = (path: NodePath) => commitTree(removeNode(tree, path));
            const pushChild = (path: NodePath, child: ConditionNode) =>
              commitTree(appendChild(tree, path, child));

            const renderOpToggle = (groupNode: ConditionGroup, path: NodePath) => {
              const opBorder =
                groupNode.op === 'or' ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--border))';
              return (
                <Box
                  sx={{
                    display: 'inline-flex',
                    bgcolor: 'hsl(var(--card))',
                    borderRadius: 1,
                    border: `1px solid ${opBorder}`,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    onClick={() =>
                      patchNode(path, (nn) => (nn.kind === 'group' ? { ...nn, op: 'and' } : nn))
                    }
                    sx={{
                      px: 1.25,
                      py: 0.35,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      bgcolor: groupNode.op === 'and' ? 'hsl(var(--foreground))' : 'transparent',
                      color:
                        groupNode.op === 'and'
                          ? 'hsl(var(--background))'
                          : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    Match all (AND)
                  </Box>
                  <Box
                    onClick={() =>
                      patchNode(path, (nn) => (nn.kind === 'group' ? { ...nn, op: 'or' } : nn))
                    }
                    sx={{
                      px: 1.25,
                      py: 0.35,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      bgcolor: groupNode.op === 'or' ? 'hsl(var(--primary))' : 'transparent',
                      color:
                        groupNode.op === 'or'
                          ? 'hsl(var(--primary-foreground))'
                          : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    Match any (OR)
                  </Box>
                </Box>
              );
            };

            const renderSeparator = (parent: ConditionGroup | null, siblingIndex: number) =>
              parent && siblingIndex > 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5 }}>
                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border) / 0.6)' }} />
                  <Chip
                    label={parent.op.toUpperCase()}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      bgcolor:
                        parent.op === 'or'
                          ? 'hsl(var(--primary) / 0.15)'
                          : 'hsl(var(--muted))',
                      color:
                        parent.op === 'or'
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--muted-foreground))',
                      borderRadius: 0.75,
                    }}
                  />
                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border) / 0.6)' }} />
                </Box>
              ) : null;

            const renderConditionLeaf = (
              node: ConditionLeaf,
              path: NodePath,
              parent: ConditionGroup | null,
              siblingIndex: number,
            ): JSX.Element => {
              const key = path.join('-') || 'leaf';
              return (
                <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {renderSeparator(parent, siblingIndex)}
                  <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                      size="small"
                      value={node.field}
                      onChange={(e) =>
                        patchNode(path, (n) =>
                          n.kind === 'condition' ? { ...n, field: e.target.value } : n,
                        )
                      }
                      placeholder="Field path"
                      select
                      SelectProps={{ native: false, renderValue: (v) => v as string }}
                      sx={{ minWidth: 220, flex: 1 }}
                    >
                      {FIELD_SUGGESTIONS.map((f) => (
                        <MenuItem key={f} value={f} sx={{ fontSize: '0.8rem' }}>
                          {FIELD_LABELS[f] || f}
                        </MenuItem>
                      ))}
                      {!FIELD_SUGGESTIONS.includes(node.field) && node.field && (
                        <MenuItem value={node.field}>{node.field}</MenuItem>
                      )}
                    </TextField>
                    <TextField
                      size="small"
                      select
                      value={node.op}
                      onChange={(e) =>
                        patchNode(path, (n) =>
                          n.kind === 'condition'
                            ? { ...n, op: e.target.value as RoutingConditionOp }
                            : n,
                        )
                      }
                      sx={{ width: 145 }}
                    >
                      {(Object.keys(OP_LABELS) as RoutingConditionOp[]).map((op) => (
                        <MenuItem key={op} value={op} sx={{ fontSize: '0.8rem' }}>
                          {OP_LABELS[op]}
                        </MenuItem>
                      ))}
                    </TextField>
                    {node.op !== 'exists' && (
                      <TextField
                        size="small"
                        value={node.value || ''}
                        onChange={(e) =>
                          patchNode(path, (n) =>
                            n.kind === 'condition' ? { ...n, value: e.target.value } : n,
                          )
                        }
                        placeholder="Value"
                        sx={{ flex: 1.2, minWidth: 200 }}
                      />
                    )}
                    <Tooltip title="Remove condition">
                      <IconButton
                        size="small"
                        onClick={() => dropNode(path)}
                        sx={{
                          width: 36,
                          height: 36,
                          color: 'hsl(var(--muted-foreground))',
                          '&:hover': { color: 'hsl(var(--destructive))' },
                        }}
                      >
                        <DeleteOutlineIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              );
            };

            const walkGroup = (
              n: ConditionNode,
              path: NodePath,
              parent: ConditionGroup | null,
              idx: number,
              depth: number,
            ): JSX.Element => {
              if (n.kind === 'condition') {
                return renderConditionLeaf(n, path, parent, idx);
              }
              const key = path.join('-') || 'root';
              const isRoot = path.length === 0;
              const opColor =
                n.op === 'or' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))';
              const opBg =
                n.op === 'or' ? 'hsl(var(--primary) / 0.03)' : 'hsl(var(--muted) / 0.15)';
              const opBorder =
                n.op === 'or' ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border) / 0.8)';
              const canNestDeeper = depth < MAX_GROUP_DEPTH;

              return (
                <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {renderSeparator(parent, idx)}
                  <Box
                    sx={{
                      border: isRoot ? '1px solid hsl(var(--border) / 0.6)' : `1px solid ${opBorder}`,
                      borderRadius: 1.5,
                      p: isRoot ? 2 : 1.75,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.25,
                      bgcolor: isRoot ? 'hsl(var(--muted) / 0.1)' : opBg,
                    }}
                  >
                    {!isRoot && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          pb: 0.5,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {renderOpToggle(n, path)}
                          <Typography
                            variant="caption"
                            sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.65rem' }}
                          >
                            Nested group (level {depth})
                          </Typography>
                        </Box>
                        <Tooltip title="Remove group">
                          <IconButton
                            size="small"
                            onClick={() => dropNode(path)}
                            sx={{
                              width: 28,
                              height: 28,
                              color: 'hsl(var(--muted-foreground))',
                              '&:hover': { color: 'hsl(var(--destructive))' },
                            }}
                          >
                            <DeleteOutlineIcon size={14} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}

                    {n.children.map((child, i) =>
                      walkGroup(child, [...path, i], n, i, depth + (child.kind === 'group' ? 1 : 0)),
                    )}

                    <Box sx={{ display: 'flex', gap: 1.5, pt: 0.5 }}>
                      <Button
                        size="small"
                        onClick={() => pushChild(path, emptyLeaf())}
                        startIcon={<AddIcon size={13} />}
                        sx={{
                          height: 28,
                          textTransform: 'none',
                          fontSize: '0.72rem',
                          color: 'hsl(var(--muted-foreground))',
                          '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                        }}
                      >
                        Add condition
                      </Button>
                      <Tooltip
                        title={
                          canNestDeeper
                            ? 'Add a nested AND/OR group inside this one'
                            : `Nesting is capped at ${MAX_GROUP_DEPTH} levels`
                        }
                      >
                        <span>
                          <Button
                            size="small"
                            disabled={!canNestDeeper}
                            onClick={() =>
                              pushChild(
                                path,
                                emptyGroup(n.op === 'and' ? 'or' : 'and', [emptyLeaf()]),
                              )
                            }
                            startIcon={<AddIcon size={13} />}
                            sx={{
                              height: 28,
                              textTransform: 'none',
                              fontSize: '0.72rem',
                              color: opColor,
                              '&:hover': { bgcolor: 'hsl(var(--primary) / 0.08)' },
                            }}
                          >
                            Add nested group
                          </Button>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              );
            };

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: '0.7rem',
                      letterSpacing: '0.06em',
                    }}
                  >
                    When
                  </Typography>
                  {tree.children.length > 1 && renderOpToggle(tree, [])}
                </Box>
                {walkGroup(tree, [], null, 0, 1)}
              </Box>
            );
          })()}

          {/* Actions ("Do") */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                color: 'hsl(var(--muted-foreground))',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: '0.7rem',
                letterSpacing: '0.06em',
              }}
            >
              Do
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                p: 2,
                borderRadius: 1.5,
                border: '1px solid hsl(var(--border) / 0.6)',
                bgcolor: 'hsl(var(--muted) / 0.1)',
              }}
            >
              {rule.actions.map((action, aIdx) => {
                const isMultilineAction = action.type === 'add_comment' || action.type === 'run_agent';
                return (
                  <Box
                    key={aIdx}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.25,
                      ...(aIdx > 0
                        ? { pt: 1.5, borderTop: '1px solid hsl(var(--border) / 0.5)' }
                        : {}),
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <Box sx={{ flex: 1.5, minWidth: 280 }}>
                        <RoutingActionFields
                          action={action}
                          variant="editor"
                          orgOptions={orgOptions}
                          onChange={(patch) => updateAction(rule.id, aIdx, patch)}
                          onTypeChange={(t) => changeActionType(rule.id, aIdx, t)}
                        />
                      </Box>
                      {!isMultilineAction && (
                        <TextField
                          size="small"
                          label="Reason (optional)"
                          value={action.reason || ''}
                          onChange={(e) => updateAction(rule.id, aIdx, { reason: e.target.value })}
                          placeholder="Shown in suggestion banner"
                          sx={{ flex: 1, minWidth: 200 }}
                        />
                      )}
                      <Tooltip title="Remove action">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => removeAction(rule.id, aIdx)}
                            disabled={rule.actions.length <= 1}
                            sx={{
                              width: 36,
                              height: 36,
                              color: 'hsl(var(--muted-foreground))',
                              '&:hover': { color: 'hsl(var(--destructive))' },
                            }}
                          >
                            <DeleteOutlineIcon size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>

                    {isMultilineAction && (
                      <TextField
                        size="small"
                        label="Reason (optional)"
                        value={action.reason || ''}
                        onChange={(e) => updateAction(rule.id, aIdx, { reason: e.target.value })}
                        placeholder="Reason shown to user (optional)"
                        sx={{ width: '100%' }}
                      />
                    )}
                  </Box>
                );
              })}
              <Button
                size="small"
                onClick={() => addAction(rule.id)}
                startIcon={<AddIcon size={13} />}
                sx={{
                  alignSelf: 'flex-start',
                  height: 28,
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  color: 'hsl(var(--muted-foreground))',
                  '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                }}
              >
                Add action
              </Button>
            </Box>
          </Box>

          {/* 30-day Trigger History (Stats API) */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              pt: 2,
              borderTop: '1px solid hsl(var(--border) / 0.6)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'hsl(var(--muted-foreground))',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.06em',
                }}
              >
                Trigger activity (past 30 days)
              </Typography>
              <Tooltip title={`Stats key: routing_rule_${rule.id}`}>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: ruleStats.totalLast30Days > 0 ? NEON.violet : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {ruleStats.totalLast30Days.toLocaleString()} trigger{ruleStats.totalLast30Days === 1 ? '' : 's'} last 30 days
                </Typography>
              </Tooltip>
            </Box>
            <Box
              sx={{
                height: 120,
                width: '100%',
                p: 1,
                borderRadius: 1.5,
                bgcolor: 'hsl(var(--muted) / 0.12)',
                border: '1px solid hsl(var(--border) / 0.6)',
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ruleStats.dailySeries} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id={safeGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={NEON.violet} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={NEON.violet} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <RechartsTooltip
                    content={<TooltipContent />}
                    cursor={{ stroke: NEON.violet, strokeOpacity: 0.3, strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Triggers"
                    name="Triggers"
                    stroke={NEON.violet}
                    strokeWidth={2}
                    fill={`url(#${safeGradId})`}
                    fillOpacity={0.6}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Box>

          {/* Footer: status + save */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.72rem' }}>
              {rule.lastMatchedTs
                ? `Last matched ${new Date(rule.lastMatchedTs).toLocaleString()}`
                : localOnlyIds.has(rule.id)
                  ? 'Unsaved rule draft'
                  : 'Saved'}
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => handleSave(rule)}
              disabled={!!saving[rule.id]}
              startIcon={
                saving[rule.id] ? (
                  <CircularProgress
                    size={14}
                    thickness={4}
                    sx={{ color: 'hsl(var(--primary-foreground))' }}
                  />
                ) : undefined
              }
              sx={{
                height: 36,
                bgcolor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                textTransform: 'none',
                fontWeight: 500,
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                '&.Mui-disabled': {
                  bgcolor: 'hsl(var(--primary) / 0.7)',
                  color: 'hsl(var(--primary-foreground))',
                },
              }}
            >
              {saving[rule.id] ? 'Saving...' : 'Save rule'}
            </Button>
          </Box>
          </>
          )}
        </Paper>
        );
      })}

      <Dialog
        open={!!pendingDelete}
        onClose={() => !deleting && setPendingDelete(null)}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          },
        }}
      >
        <DialogTitle sx={{ color: 'hsl(var(--foreground))' }}>Delete routing rule?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'hsl(var(--muted-foreground))' }}>
            This will permanently delete the rule <strong style={{ color: 'hsl(var(--foreground))' }}>"{pendingDelete?.name}"</strong>.
            {entityPluralCap} will no longer be evaluated against it. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setPendingDelete(null)}
            disabled={deleting}
            sx={{ height: 36, textTransform: 'none', color: 'hsl(var(--muted-foreground))' }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            disabled={deleting}
            variant="contained"
            startIcon={
              deleting ? (
                <CircularProgress
                  size={14}
                  thickness={4}
                  sx={{ color: 'hsl(var(--destructive-foreground))' }}
                />
              ) : undefined
            }
            sx={{
              height: 36,
              textTransform: 'none',
              bgcolor: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
              fontWeight: 500,
              '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.9)' },
              '&.Mui-disabled': {
                bgcolor: 'hsl(var(--destructive) / 0.7)',
                color: 'hsl(var(--destructive-foreground))',
              },
            }}
          >
            {deleting ? 'Deleting...' : 'Delete rule'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test Rules Dialog */}
      <Dialog
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 1.5,
            borderBottom: '1px solid hsl(var(--border))',
            fontSize: '1rem',
            fontWeight: 600,
          }}
        >
          <Box>Test {entityPluralCap} Routing Rules</Box>
          <Button
            size="small"
            variant="text"
            onClick={() => setTestModalOpen(false)}
            sx={{
              minWidth: 'auto',
              p: 0.5,
              fontSize: '0.8rem',
              color: 'hsl(var(--muted-foreground))',
              '&:hover': { color: 'hsl(var(--foreground))' },
            }}
          >
            Close
          </Button>
        </DialogTitle>

        <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Test Record Source
              </Typography>
              {loadingTestRecords && (
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  Loading recent {entityLabel.plural}...
                </Typography>
              )}
            </Box>
            <Select
              size="small"
              value={selectedRecordId}
              onChange={(e) => handleSelectRecord(e.target.value)}
              sx={{
                fontSize: '0.8rem',
                bgcolor: 'hsl(var(--muted) / 0.3)',
                '& .MuiSelect-select': { py: 0.75 },
              }}
            >
              <MenuItem value="manual" sx={{ fontSize: '0.8rem' }}>
                Custom JSON payload
              </MenuItem>
              {testRecords.map((rec) => {
                const recId = rec.id || rec.key || 'unknown';
                const recData = rec.data || rec;
                const desc = recData.title || recData.cve || recData.name || recId;
                return (
                  <MenuItem key={recId} value={recId} sx={{ fontSize: '0.8rem' }}>
                    {recId} — {desc}
                  </MenuItem>
                );
              })}
            </Select>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Record Payload (JSON)
            </Typography>
            <TextField
              multiline
              rows={6}
              value={customRecordJson}
              onChange={(e) => {
                setCustomRecordJson(e.target.value);
                setSelectedRecordId('manual');
              }}
              error={!parsedTestContext}
              helperText={!parsedTestContext ? 'Invalid JSON format' : undefined}
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  bgcolor: 'hsl(var(--muted) / 0.2)',
                },
              }}
            />
          </Box>

          <Divider sx={{ borderColor: 'hsl(var(--border))' }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Evaluation Results
              </Typography>
              <Chip
                size="small"
                label={
                  !parsedTestContext
                    ? 'Invalid input'
                    : testEvaluationResults.length > 0
                      ? `${testEvaluationResults.length} rule${testEvaluationResults.length === 1 ? '' : 's'} matched`
                      : '0 rules matched'
                }
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor:
                    testEvaluationResults.length > 0
                      ? 'hsl(var(--severity-low) / 0.15)'
                      : 'hsl(var(--muted))',
                  color:
                    testEvaluationResults.length > 0
                      ? 'hsl(var(--severity-low))'
                      : 'hsl(var(--muted-foreground))',
                  border: '1px solid',
                  borderColor:
                    testEvaluationResults.length > 0
                      ? 'hsl(var(--severity-low) / 0.4)'
                      : 'hsl(var(--border))',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            </Box>

            {testEvaluationResults.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  textAlign: 'center',
                  borderColor: 'hsl(var(--border))',
                  bgcolor: 'hsl(var(--muted) / 0.1)',
                }}
              >
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                  {!parsedTestContext
                    ? 'Enter a valid JSON payload above to run dry-run evaluation.'
                    : `No active rules in ${entityLabel.plural} matched this test record.`}
                </Typography>
              </Paper>
            ) : (
              <Stack spacing={1.5}>
                {testEvaluationResults.map((match, idx) => {
                  const rule = match.rule;
                  return (
                    <Paper
                      key={rule.id || idx}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderColor: 'hsl(var(--border))',
                        bgcolor: 'hsl(var(--muted) / 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {rule.name}
                          </Typography>
                          <Chip
                            size="small"
                            label={`Priority ${rule.priority}`}
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: 'hsl(var(--muted))',
                              color: 'hsl(var(--foreground))',
                            }}
                          />
                        </Box>
                        <Chip
                          size="small"
                          label="Matched"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            bgcolor: 'hsl(var(--severity-low) / 0.15)',
                            color: 'hsl(var(--severity-low))',
                          }}
                        />
                      </Box>

                      {/* Matched conditions */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
                          Matched conditions ({match.matched.length}):
                        </Typography>
                        {match.matched.map((c, cIdx) => (
                          <Box
                            key={cIdx}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              bgcolor: 'hsl(var(--muted) / 0.25)',
                              px: 1,
                              py: 0.25,
                              borderRadius: 0.75,
                            }}
                          >
                            <Box component="span" sx={{ color: 'hsl(var(--severity-low))', fontWeight: 600 }}>
                              Passed
                            </Box>
                            <Box component="span" sx={{ color: 'hsl(var(--foreground))' }}>
                              {c.field} {c.op} {c.value ? `"${c.value}"` : ''}
                            </Box>
                          </Box>
                        ))}
                      </Box>

                      {/* Resulting actions */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
                          Actions that would execute:
                        </Typography>
                        {(rule.actions || []).map((action, aIdx) => (
                          <Box
                            key={aIdx}
                            sx={{
                              fontSize: '0.75rem',
                              color: 'hsl(var(--foreground))',
                              bgcolor: 'hsl(var(--background))',
                              p: 0.75,
                              borderRadius: 0.75,
                              border: '1px solid hsl(var(--border))',
                            }}
                          >
                            <Box component="span" sx={{ fontWeight: 600 }}>
                              {ROUTING_ACTION_TYPE_LABELS[action.type] || action.type}
                            </Box>
                            {action.targetOrgId && ` -> tenant ${action.targetOrgId}`}
                            {action.field && ` -> field "${action.field}"`}
                            {action.value && ` -> ${action.value}`}
                            {action.reason && ` (reason: "${action.reason}")`}
                          </Box>
                        ))}
                      </Box>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default IncidentRoutingEditor;
