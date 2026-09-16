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
import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  RoutingActionFields,
  ROUTING_ACTION_TYPE_LABELS,
  ROUTING_SEVERITY_OPTIONS,
  ROUTING_STATUS_OPTIONS,
  ROUTING_PRIORITY_OPTIONS,
  ROUTING_FIELD_SUGGESTIONS,
  defaultRoutingAction,
  validateRoutingAction,
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
} from '@mui/material';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { useDatastore } from '@/hooks/useDatastore';
import { useSubOrgs } from '@/hooks/useSubOrgs';
import { useAuth } from '@/context/AuthContext';
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
  '*': '* (whole incident, auto base64-decoded)',
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
   * routing workflow is auto-created. Defaults to "cases".
   */
  generateCategory?: string;
}

export const IncidentRoutingEditor = ({
  forceShow = false,
  entityCategory = DEFAULT_ROUTING_ENTITY_CATEGORY,
  entityLabel = { singular: 'incident', plural: 'incidents' },
  generateCategory = 'cases',
}: IncidentRoutingEditorProps) => {
  const { userInfo } = useAuth();
  const currentOrgId = userInfo?.active_org?.id;
  const { subOrgs, isParentOrg } = useSubOrgs(currentOrgId);

  const { items, isLoading, hasFetched, fetchItems, addItem, removeItem } = useDatastore({
    category: ROUTING_DATASTORE_CATEGORY,
  });

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
      const payload: RoutingRule = {
        ...rule,
        conditions: legacy.conditions,
        matchMode: legacy.matchMode,
        conditionTree: tree,
        createdBy: rule.createdBy || userInfo?.username || userInfo?.id,
        createdTs: rule.createdTs || Date.now(),
        updatedTs: Date.now(),
      };
      // Pass skipRefresh=false so `items` includes the new rule before we
      // remove it from `localOnlyIds` — otherwise the drafts-rebuild effect
      // drops the just-saved rule from the list.
      const ok = await addItem(rule.id, JSON.stringify(payload), false);
      if (ok) {
        toast.success('Routing rule saved');
        if (items.length === 0) {
          try {
            await fetch(getApiUrl('/api/v2/workflows/generate'), {
              method: 'POST',
              credentials: 'include',
              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                label: 'Incident Routing Rules',
                category: 'cases',
              }),
            });
            window.dispatchEvent(new CustomEvent('shuffle-workflow-toggled', {
              detail: { label: 'Incident Routing Rules', enabled: true },
            }));
            window.dispatchEvent(new CustomEvent('shuffle-workflows-updated'));
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
      actions: rule.actions.map((a) => ({ ...a })),
    });
    setDrafts((prev) => ({ ...prev, [copy.id]: copy }));
    setLocalOnlyIds((prev) => new Set(prev).add(copy.id));
    setExpanded((prev) => ({ ...prev, [copy.id]: true }));
  };

  const handleAdd = () => {
    const fresh = emptyRule({
      actions: [{ type: 'suggest_move', targetOrgId: subOrgs[0]?.id || '', reason: '' }],
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
        actions[idx].targetOrgId = subOrgs[0]?.id || '';
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

  const orgOptions = useMemo(() => {
    const opts: { id: string; name: string }[] = [];
    if (currentOrgId) opts.push({ id: currentOrgId, name: `${userInfo?.active_org?.name || 'This tenant'} (current)` });
    for (const so of subOrgs) opts.push({ id: so.id, name: so.name || so.id.slice(0, 8) });
    return opts;
  }, [subOrgs, currentOrgId, userInfo]);

  if (!isParentOrg && !forceShow) {
    return (
      <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
        Incident Routing Rules are only available when you have one or more child tenants.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
            {hasFetched ? `${sortedRules.length} rule${sortedRules.length === 1 ? '' : 's'}` : 'Loading…'}
            {hasFetched && sortedRules.length > 0 && ' · evaluated low-to-high priority'}
          </Typography>
        </Box>
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
            '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
          }}
        >
          Add rule
        </Button>
      </Box>

      {isLoading && !hasFetched && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {hasFetched && sortedRules.length === 0 && (
        <Paper
          sx={{
            p: 3,
            bgcolor: 'hsl(var(--muted) / 0.3)',
            border: '1px dashed hsl(var(--border))',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1 }}>
            No routing rules yet.
          </Typography>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Rules are evaluated by your incident automation. When a rule matches, an incident shows
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

        return (
        <Paper
          key={rule.id}
          sx={{
            p: isOpen ? 2 : 1.25,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: isOpen ? 1.5 : 0,
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
                  When {condSummary} → {actionSummary}
                </Typography>
              </Box>
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
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
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
              levels of nesting. Each group is a bordered box with an
              op-toggle (AND/OR). Children are either leaf conditions or
              nested groups; deeper nesting is disabled at the depth cap. */}
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

            // Renderer for a single node. Root group has no delete button;
            // deeper groups do.
            const renderNode = (
              node: ConditionNode,
              path: NodePath,
              parent: ConditionGroup | null,
              siblingIndex: number,
              currentDepth: number, // 1 for root
            ): JSX.Element => {
              const key = path.join('-') || 'root';

              // Sibling AND/OR separator (based on parent's op).
              const separator =
                parent && siblingIndex > 0 ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
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
                            : 'hsl(var(--foreground))',
                        borderRadius: 0.5,
                      }}
                    />
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
                  </Box>
                ) : null;

              if (node.kind === 'condition') {
                return (
                  <Box key={key} sx={{ display: 'flex', flexDirection: 'column' }}>
                    {separator}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        SelectProps={{ native: false, renderValue: (v) => (v as string) }}
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
                        sx={{ width: 140 }}
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
                          placeholder="value"
                          sx={{ flex: 1, minWidth: 200 }}
                        />
                      )}
                      <IconButton
                        size="small"
                        onClick={() => dropNode(path)}
                        sx={{ width: 36, height: 36 }}
                      >
                        <DeleteOutlineIcon size={16} />
                      </IconButton>
                    </Box>
                  </Box>
                );
              }

              // Group node
              const isRoot = path.length === 0;
              const opColor =
                node.op === 'or' ? 'hsl(var(--primary))' : 'hsl(var(--foreground))';
              const opBg =
                node.op === 'or' ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--muted) / 0.25)';
              const opBorder =
                node.op === 'or' ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--border))';
              const canNestDeeper = currentDepth < MAX_GROUP_DEPTH;

              return (
                <Box key={key} sx={{ display: 'flex', flexDirection: 'column' }}>
                  {separator}
                  <Box
                    sx={{
                      border: `1px solid ${opBorder}`,
                      borderRadius: 1,
                      p: 1.25,
                      pt: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      bgcolor: opBg,
                      position: 'relative',
                    }}
                  >
                    {/* Group header: MATCH ALL / MATCH ANY toggle + depth + delete */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -12,
                        left: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      <Box sx={{ display: 'flex', bgcolor: 'hsl(var(--card))', borderRadius: 0.5, border: `1px solid ${opBorder}`, overflow: 'hidden' }}>
                        <Box
                          onClick={() =>
                            patchNode(path, (n) =>
                              n.kind === 'group' ? { ...n, op: 'and' } : n,
                            )
                          }
                          sx={{
                            px: 1,
                            py: 0.25,
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            cursor: 'pointer',
                            bgcolor:
                              node.op === 'and' ? 'hsl(var(--foreground))' : 'transparent',
                            color:
                              node.op === 'and'
                                ? 'hsl(var(--background))'
                                : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          MATCH ALL
                        </Box>
                        <Box
                          onClick={() =>
                            patchNode(path, (n) =>
                              n.kind === 'group' ? { ...n, op: 'or' } : n,
                            )
                          }
                          sx={{
                            px: 1,
                            py: 0.25,
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            cursor: 'pointer',
                            bgcolor:
                              node.op === 'or' ? 'hsl(var(--primary))' : 'transparent',
                            color:
                              node.op === 'or'
                                ? 'hsl(var(--primary-foreground))'
                                : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          MATCH ANY
                        </Box>
                      </Box>
                    </Box>
                    {!isRoot && (
                      <Box sx={{ position: 'absolute', top: -14, right: 4 }}>
                        <Tooltip title="Remove group">
                          <IconButton
                            size="small"
                            onClick={() => dropNode(path)}
                            sx={{
                              width: 24,
                              height: 24,
                              bgcolor: 'hsl(var(--card))',
                              border: `1px solid ${opBorder}`,
                              color: 'hsl(var(--muted-foreground))',
                              '&:hover': { color: 'hsl(var(--destructive))' },
                            }}
                          >
                            <DeleteOutlineIcon size={12} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}

                    {node.children.map((child, i) =>
                      renderNode(child, [...path, i], node, i, currentDepth + (child.kind === 'group' ? 0 : 0)),
                    )}

                    {/* Add buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Button
                        size="small"
                        onClick={() => pushChild(path, emptyLeaf())}
                        startIcon={<AddIcon size={12} />}
                        sx={{
                          height: 24,
                          textTransform: 'none',
                          fontSize: '0.65rem',
                          color: 'hsl(var(--muted-foreground))',
                          '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                        }}
                      >
                        Condition
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
                                emptyGroup(node.op === 'and' ? 'or' : 'and', [emptyLeaf()]),
                              )
                            }
                            startIcon={<AddIcon size={12} />}
                            sx={{
                              height: 24,
                              textTransform: 'none',
                              fontSize: '0.65rem',
                              color: opColor,
                              '&:hover': { bgcolor: 'hsl(var(--primary) / 0.08)' },
                            }}
                          >
                            Nested group
                          </Button>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              );
            };

            // Track true depth: increment when descending INTO a group.
            const renderRoot = (root: ConditionGroup): JSX.Element => {
              const walk = (
                n: ConditionNode,
                path: NodePath,
                parent: ConditionGroup | null,
                idx: number,
                depth: number,
              ): JSX.Element => {
                if (n.kind === 'condition') {
                  return renderNode(n, path, parent, idx, depth);
                }
                const key = path.join('-') || 'root';
                const isRoot = path.length === 0;
                const opColor =
                  n.op === 'or' ? 'hsl(var(--primary))' : 'hsl(var(--foreground))';
                const opBg =
                  n.op === 'or' ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--muted) / 0.25)';
                const opBorder =
                  n.op === 'or' ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--border))';
                const canNestDeeper = depth < MAX_GROUP_DEPTH;
                const separator =
                  parent && idx > 0 ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                      <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
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
                              : 'hsl(var(--foreground))',
                          borderRadius: 0.5,
                        }}
                      />
                      <Box sx={{ flex: 1, height: '1px', bgcolor: 'hsl(var(--border))' }} />
                    </Box>
                  ) : null;

                return (
                  <Box key={key} sx={{ display: 'flex', flexDirection: 'column' }}>
                    {separator}
                    <Box
                      sx={{
                        border: `1px solid ${opBorder}`,
                        borderRadius: 1,
                        p: 1.25,
                        pt: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        bgcolor: opBg,
                        position: 'relative',
                      }}
                    >
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -12,
                          left: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <Box sx={{ display: 'flex', bgcolor: 'hsl(var(--card))', borderRadius: 0.5, border: `1px solid ${opBorder}`, overflow: 'hidden' }}>
                          <Box
                            onClick={() =>
                              patchNode(path, (nn) =>
                                nn.kind === 'group' ? { ...nn, op: 'and' } : nn,
                              )
                            }
                            sx={{
                              px: 1,
                              py: 0.25,
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              cursor: 'pointer',
                              bgcolor:
                                n.op === 'and' ? 'hsl(var(--foreground))' : 'transparent',
                              color:
                                n.op === 'and'
                                  ? 'hsl(var(--background))'
                                  : 'hsl(var(--muted-foreground))',
                            }}
                          >
                            MATCH ALL
                          </Box>
                          <Box
                            onClick={() =>
                              patchNode(path, (nn) =>
                                nn.kind === 'group' ? { ...nn, op: 'or' } : nn,
                              )
                            }
                            sx={{
                              px: 1,
                              py: 0.25,
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              cursor: 'pointer',
                              bgcolor:
                                n.op === 'or' ? 'hsl(var(--primary))' : 'transparent',
                              color:
                                n.op === 'or'
                                  ? 'hsl(var(--primary-foreground))'
                                  : 'hsl(var(--muted-foreground))',
                            }}
                          >
                            MATCH ANY
                          </Box>
                        </Box>
                        <Chip
                          label={`Level ${depth}${depth === MAX_GROUP_DEPTH ? ' · max' : ''}`}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.55rem',
                            bgcolor: 'hsl(var(--card))',
                            color: 'hsl(var(--muted-foreground))',
                            border: `1px solid ${opBorder}`,
                          }}
                        />
                      </Box>
                      {!isRoot && (
                        <Box sx={{ position: 'absolute', top: -14, right: 4 }}>
                          <Tooltip title="Remove group">
                            <IconButton
                              size="small"
                              onClick={() => dropNode(path)}
                              sx={{
                                width: 24,
                                height: 24,
                                bgcolor: 'hsl(var(--card))',
                                border: `1px solid ${opBorder}`,
                                color: 'hsl(var(--muted-foreground))',
                                '&:hover': { color: 'hsl(var(--destructive))' },
                              }}
                            >
                              <DeleteOutlineIcon size={12} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}

                      {n.children.map((child, i) =>
                        walk(child, [...path, i], n, i, depth + (child.kind === 'group' ? 1 : 0)),
                      )}

                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Button
                          size="small"
                          onClick={() => pushChild(path, emptyLeaf())}
                          startIcon={<AddIcon size={12} />}
                          sx={{
                            height: 24,
                            textTransform: 'none',
                            fontSize: '0.65rem',
                            color: 'hsl(var(--muted-foreground))',
                            '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
                          }}
                        >
                          Condition
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
                              startIcon={<AddIcon size={12} />}
                              sx={{
                                height: 24,
                                textTransform: 'none',
                                fontSize: '0.65rem',
                                color: opColor,
                                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.08)' },
                              }}
                            >
                              Nested group
                            </Button>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>
                );
              };
              return walk(root, [], null, 0, 1);
            };

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: '0.65rem',
                      letterSpacing: '0.05em',
                    }}
                  >
                    When
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.65rem' }}>
                    Toggle each group between MATCH ALL (AND) and MATCH ANY (OR). Nest groups up to {MAX_GROUP_DEPTH} levels deep.
                  </Typography>
                </Box>
                {renderRoot(tree)}
              </Box>
            );
          })()}

          {/* Actions */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1, borderTop: '1px solid hsl(var(--border))' }}>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
              Then
            </Typography>
            {rule.actions.map((action, aIdx) => {
              return (
                <Box key={aIdx} sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1, borderRadius: 1, bgcolor: 'hsl(var(--muted) / 0.3)' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <RoutingActionFields
                        action={action}
                        variant="editor"
                        orgOptions={orgOptions}
                        onChange={(patch) => updateAction(rule.id, aIdx, patch)}
                        onTypeChange={(t) => changeActionType(rule.id, aIdx, t)}
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => removeAction(rule.id, aIdx)}
                      disabled={rule.actions.length <= 1}
                      sx={{ width: 36, height: 36, color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--destructive))' } }}
                    >
                      <DeleteOutlineIcon size={16} />
                    </IconButton>
                  </Stack>

                  <TextField
                    size="small"
                    value={action.reason || ''}
                    onChange={(e) => updateAction(rule.id, aIdx, { reason: e.target.value })}
                    placeholder="Reason shown to user (optional)"
                    sx={{ width: '100%' }}
                  />
                </Box>
              );
            })}
            <Button
              size="small"
              onClick={() => addAction(rule.id)}
              startIcon={<AddIcon size={14} />}
              sx={{
                alignSelf: 'flex-start',
                height: 28,
                textTransform: 'none',
                fontSize: '0.7rem',
                color: 'hsl(var(--muted-foreground))',
                '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'transparent' },
              }}
            >
              Add action
            </Button>
          </Box>

          {/* Footer: stats + save */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
              {rule.matchCount ? `${rule.matchCount} match${rule.matchCount === 1 ? '' : 'es'}` : 'No matches yet'}
              {rule.lastMatchedTs ? ` · last ${new Date(rule.lastMatchedTs).toLocaleString()}` : ''}
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => handleSave(rule)}
              disabled={!!saving[rule.id]}
              sx={{
                height: 36,
                bgcolor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                textTransform: 'none',
                '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
              }}
            >
              {saving[rule.id] ? <CircularProgress size={16} /> : 'Save rule'}
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
            Incidents will no longer be evaluated against it. This action cannot be undone.
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
            sx={{
              height: 36,
              textTransform: 'none',
              bgcolor: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
              '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.9)' },
            }}
          >
            {deleting ? <CircularProgress size={16} /> : 'Delete rule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default IncidentRoutingEditor;
