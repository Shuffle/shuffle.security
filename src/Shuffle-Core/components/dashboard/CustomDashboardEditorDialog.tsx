/**
 * Dialogs for creating/renaming a Custom Dashboard, adding/editing a widget
 * via a structured form, and inspecting/editing the underlying JSON schema.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { NEON } from './_shared';
import {
  BUILTIN_METRICS,
  KNOWN_DATASTORE_CATEGORIES,
  VISUALIZATION_OPTIONS,
  WIDGET_SPAN_OPTIONS,
  validateCustomDashboardConfig,
  type BuiltinMetricId,
  type CustomDashboardConfig,
  type CustomDashboardWidget,
  type CustomWidgetDataSource,
  type CustomWidgetVisualization,
  type DatastoreAggregation,
  type WidgetSpan,
} from './customDashboardTypes';
import { DATASTORE_CATEGORIES, getDatastoreByCategory } from '../../datastore';
import { HighlightedFileEditor } from '../HighlightedFileEditor';

const DEFAULT_STAT_KEYS = [
  'total_workflow_executions',
  'total_workflow_executions_aborted',
  'total_app_executions',
  'total_app_executions_failed',
  'total_subflow_executions',
  'total_cloud_executions',
  'total_onprem_executions',
  'workflow_executions_finished',
  'workflow_executions_failed',
  'tickets_created',
  'tickets_closed',
  'alerts_triaged',
  'phishing_blocked',
  'agent_executions',
];

const AGGREGATION_OPTIONS: { value: DatastoreAggregation; label: string; description: string }[] = [
  { value: 'count', label: 'Total Item Count', description: 'Count matching records (KPI or time series)' },
  { value: 'group_by', label: 'Group by JSON Field', description: 'Count records per unique field value' },
  { value: 'sum', label: 'Sum of Numeric Field', description: 'Add numeric values across matching records' },
  { value: 'avg', label: 'Average of Numeric Field', description: 'Mean of numeric values across matching records' },
  { value: 'max', label: 'Maximum of Numeric Field', description: 'Highest numeric value across matching records' },
  { value: 'min', label: 'Minimum of Numeric Field', description: 'Lowest numeric value across matching records' },
];

const INTERNAL_RECORD_KEYS = new Set([
  'org_id',
  'key',
  'value',
  'category',
  'Authorization',
  'authorization',
  'id',
]);

/** Extract candidate JSON field paths (top-level + 1-level nested) from a list of parsed datastore records. */
export const discoverFieldsFromRecords = (records: Record<string, any>[]): string[] => {
  const fields = new Set<string>();
  for (const r of records.slice(0, 40)) {
    if (!r || typeof r !== 'object') continue;
    for (const [k, v] of Object.entries(r)) {
      if (!k || INTERNAL_RECORD_KEYS.has(k)) continue;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const nestedKey of Object.keys(v)) {
          if (nestedKey) fields.add(`${k}.${nestedKey}`);
        }
      } else if (!Array.isArray(v)) {
        fields.add(k);
      }
    }
  }
  return Array.from(fields);
};

const ACCENT_OPTIONS: { value: keyof typeof NEON; label: string; hex: string }[] = [
  { value: 'violet', label: 'Violet', hex: NEON.violet },
  { value: 'magenta', label: 'Magenta', hex: NEON.magenta },
  { value: 'cyan', label: 'Cyan', hex: NEON.cyan },
  { value: 'green', label: 'Green', hex: NEON.green },
  { value: 'amber', label: 'Amber', hex: NEON.amber },
  { value: 'red', label: 'Red', hex: NEON.red },
  { value: 'orange', label: 'Orange', hex: NEON.orange },
  { value: 'pink', label: 'Pink', hex: NEON.pink },
];

const STAT_ACRONYMS: Record<string, string> = {
  ioc: 'IOC',
  iocs: 'IOCs',
  api: 'API',
  apis: 'APIs',
  sla: 'SLA',
  mfa: 'MFA',
  edr: 'EDR',
  siem: 'SIEM',
  soc: 'SOC',
  cve: 'CVE',
  cves: 'CVEs',
  ai: 'AI',
  llm: 'LLM',
  url: 'URL',
  urls: 'URLs',
  ip: 'IP',
  ips: 'IPs',
  dns: 'DNS',
  vpn: 'VPN',
  iam: 'IAM',
  onprem: 'On-Prem',
};

const prettyStatKey = (key: string): string => {
  if (!key || typeof key !== 'string') return '';
  let bare = key.trim();
  if (bare.toLowerCase().startsWith('total_')) bare = bare.slice(6);
  if (bare.toLowerCase().startsWith('categorylabel_')) bare = bare.slice('categorylabel_'.length);
  const words = bare.replace(/[_-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return key;
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (STAT_ACRONYMS[lower]) return STAT_ACRONYMS[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

// ── Create / Rename Dashboard Dialog ────────────────────────────────────────

export interface CreateDashboardDialogProps {
  open: boolean;
  onClose: () => void;
  /** When provided, dialog acts as "Rename / Edit Details" for an existing dashboard. */
  initialName?: string;
  initialDescription?: string;
  mode?: 'create' | 'rename';
  onSubmit?: (payload: { name: string; description?: string; useStarterTemplate: boolean }) => Promise<void> | void;
  onCreate?: (name: string, description: string | undefined, useStarterTemplate: boolean) => Promise<void> | void;
}

export const CreateDashboardDialog = ({
  open,
  onClose,
  initialName = '',
  initialDescription = '',
  mode = 'create',
  onSubmit,
  onCreate,
}: CreateDashboardDialogProps) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [templateMode, setTemplateMode] = useState<'starter' | 'blank'>('starter');

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setTemplateMode('starter');
    }
  }, [open, initialName, initialDescription]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const desc = description.trim() || undefined;
    const useStarterTemplate = mode === 'create' && templateMode === 'starter';
    if (typeof onSubmit === 'function') {
      await onSubmit({ name: trimmed, description: desc, useStarterTemplate });
    } else if (typeof onCreate === 'function') {
      await onCreate(trimmed, desc, useStarterTemplate);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSave}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, pb: 1 }}>
          {mode === 'rename' ? 'Edit Dashboard Details' : 'New Custom Dashboard'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField
            label="Dashboard Name"
            placeholder="e.g. SOC Executive Overview"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Description (optional)"
            placeholder="Short summary of what this dashboard tracks"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
          {mode === 'create' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Initial Layout</InputLabel>
              <Select
                label="Initial Layout"
                value={templateMode}
                onChange={(e) => setTemplateMode(e.target.value as 'starter' | 'blank')}
              >
                <MenuItem value="starter">Starter template (KPIs + trend + breakdown)</MenuItem>
                <MenuItem value="blank">Blank canvas (start with 0 widgets)</MenuItem>
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} size="small" sx={{ height: 32, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="small"
            disabled={!name.trim()}
            sx={{ height: 32, textTransform: 'none', fontWeight: 600 }}
          >
            {mode === 'rename' ? 'Save Changes' : 'Create Dashboard'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

// ── Add / Edit Widget Dialog ────────────────────────────────────────────────

export interface WidgetEditorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Existing widget when editing; null/undefined when adding a new widget. */
  initialWidget?: CustomDashboardWidget | null;
  /** Available custom stat keys discovered from `/api/v1/orgs/{orgId}/stats`. */
  availableStatKeys?: string[];
  /** Current totals per stat key for displaying live counts in the selector. */
  statTotals?: Record<string, number>;
  /** Additional datastore categories discovered from active widgets or org data. */
  discoveredCategories?: string[];
  /** Discovered JSON field paths per datastore category. */
  categoryFieldMap?: Record<string, string[]>;
  /** Record counts per datastore category. */
  categoryRecordCounts?: Record<string, number>;
  /** Active organization ID used for live field discovery and API snippets. */
  orgId?: string | null;
  /** Optional callback to open the full Dashboard Data Input Guide dialog. */
  onOpenDataGuide?: () => void;
  onSave?: (widget: CustomDashboardWidget) => Promise<void> | void;
  onSubmit?: (widget: CustomDashboardWidget) => Promise<void> | void;
}

const formatCompactCount = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
};

export const WidgetEditorDialog = ({
  open,
  onClose,
  initialWidget,
  availableStatKeys = [],
  statTotals = {},
  discoveredCategories = [],
  categoryFieldMap = {},
  categoryRecordCounts = {},
  orgId,
  onOpenDataGuide,
  onSave,
  onSubmit,
}: WidgetEditorDialogProps) => {
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [sourceKind, setSourceKind] = useState<'custom_stat' | 'datastore_category' | 'builtin'>('builtin');
  const [visualization, setVisualization] = useState<CustomWidgetVisualization>('kpi');
  const [span, setSpan] = useState<WidgetSpan>(3);
  const [accentColor, setAccentColor] = useState<keyof typeof NEON>('violet');

  // Source-specific fields
  const [statKey, setStatKey] = useState('total_workflow_executions');
  const [additionalStatKeys, setAdditionalStatKeys] = useState<string[]>([]);
  const [category, setCategory] = useState<string>(DATASTORE_CATEGORIES.INCIDENTS);
  const [aggregation, setAggregation] = useState<DatastoreAggregation>('group_by');
  const [groupByField, setGroupByField] = useState('severity');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [builtinId, setBuiltinId] = useState<BuiltinMetricId>('open_incidents');

  // Live field discovery for any typed or selected datastore category
  const [liveCategoryFields, setLiveCategoryFields] = useState<Record<string, string[]>>({});
  const [liveCategoryCounts, setLiveCategoryCounts] = useState<Record<string, number>>({});
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const mergedStatKeys = useMemo(() => {
    const set = new Set<string>([...availableStatKeys, ...DEFAULT_STAT_KEYS]);
    return Array.from(set).sort((a, b) => {
      const totalA = statTotals[a] ?? 0;
      const totalB = statTotals[b] ?? 0;
      if (totalA !== totalB) return totalB - totalA;
      return prettyStatKey(a).localeCompare(prettyStatKey(b));
    });
  }, [availableStatKeys, statTotals]);

  const mergedCategories = useMemo(() => {
    const set = new Set<string>([
      ...KNOWN_DATASTORE_CATEGORIES.map((c) => c.value),
      ...discoveredCategories,
    ]);
    return Array.from(set);
  }, [discoveredCategories]);

  // Fetch sample records from datastore when a category is selected to discover its JSON fields
  useEffect(() => {
    if (!open || sourceKind !== 'datastore_category') return;
    const cat = category.trim();
    if (!cat) return;
    if (categoryFieldMap[cat]?.length || liveCategoryFields[cat] !== undefined) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const resp = await getDatastoreByCategory(cat, undefined, 25, orgId || undefined);
        if (cancelled) return;
        if (resp.success && Array.isArray(resp.data)) {
          const parsedRecords = resp.data.map((item: any) => {
            if (!item || typeof item !== 'object') return {};
            let parsedVal: Record<string, any> = {};
            if (typeof item.value === 'string' && item.value.trim()) {
              try {
                const p = JSON.parse(item.value);
                if (p && typeof p === 'object') parsedVal = p;
              } catch {
                /* ignore non-JSON */
              }
            } else if (item.value && typeof item.value === 'object') {
              parsedVal = item.value;
            }
            return { ...item, ...parsedVal };
          });
          const fields = discoverFieldsFromRecords(parsedRecords);
          setLiveCategoryFields((prev) => ({ ...prev, [cat]: fields }));
          setLiveCategoryCounts((prev) => ({ ...prev, [cat]: parsedRecords.length }));
        } else {
          setLiveCategoryFields((prev) => ({ ...prev, [cat]: [] }));
        }
      } catch {
        if (!cancelled) {
          setLiveCategoryFields((prev) => ({ ...prev, [cat]: [] }));
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, sourceKind, category, categoryFieldMap, liveCategoryFields, orgId]);

  const suggestedGroupFields = useMemo(() => {
    const cat = category.trim();
    const known = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === cat);
    const fromKnown = known ? known.suggestedFields.map((s) => s.trim()) : [];
    const fromParent = categoryFieldMap[cat] || [];
    const fromLive = liveCategoryFields[cat] || [];
    const fallback = ['severity', 'status', 'type', 'source', 'score', 'count'];
    const merged = new Set<string>([...fromParent, ...fromLive, ...fromKnown, ...fallback]);
    return Array.from(merged);
  }, [category, categoryFieldMap, liveCategoryFields]);

  useEffect(() => {
    if (!open) return;
    setCopiedSnippet(false);
    if (initialWidget && initialWidget.dataSource) {
      setTitle(initialWidget.title || '');
      setTitleTouched(true);
      setVisualization(initialWidget.visualization || 'kpi');
      setSpan(initialWidget.span || 3);
      setAccentColor(initialWidget.accentColor || 'violet');
      const ds = initialWidget.dataSource;
      setSourceKind(ds.kind);
      if (ds.kind === 'custom_stat') {
        setStatKey(ds.statKey || availableStatKeys[0] || 'total_workflow_executions');
        setAdditionalStatKeys(ds.additionalStatKeys || []);
      } else if (ds.kind === 'datastore_category') {
        setCategory(ds.category || DATASTORE_CATEGORIES.INCIDENTS);
        setAggregation(ds.aggregation || 'group_by');
        setGroupByField(ds.groupByField || 'severity');
        setFilterField(ds.filterField || '');
        setFilterValue(ds.filterValue || '');
      } else if (ds.kind === 'builtin') {
        setBuiltinId(ds.builtinId || BUILTIN_METRICS[0].id);
      }
    } else {
      const def = BUILTIN_METRICS[0];
      setTitle(def.label);
      setTitleTouched(false);
      setSourceKind('builtin');
      setBuiltinId(def.id);
      setVisualization(def.defaultVisualization);
      setSpan(def.defaultSpan);
      setAccentColor(def.defaultAccent);
      setStatKey(availableStatKeys[0] || 'total_workflow_executions');
      setAdditionalStatKeys([]);
      setCategory(DATASTORE_CATEGORIES.INCIDENTS);
      setAggregation('group_by');
      setGroupByField('severity');
      setFilterField('');
      setFilterValue('');
    }
  }, [open, initialWidget, availableStatKeys]);

  const computeAutoDatastoreTitle = (
    cat: string,
    agg: DatastoreAggregation,
    field: string,
  ): string => {
    const known = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === cat.trim());
    const shortName = known ? known.label.split(' (')[0] : cat.trim() || 'Records';
    if (agg === 'count') return `Total ${shortName}`;
    if (agg === 'group_by') return field ? `${shortName} by ${field}` : shortName;
    const aggLabel: Record<string, string> = {
      sum: 'Sum of',
      avg: 'Avg',
      max: 'Max',
      min: 'Min',
    };
    return field ? `${aggLabel[agg] || agg} ${field} (${shortName})` : `${shortName} (${agg})`;
  };

  const handleSourceKindChange = (nextKind: 'custom_stat' | 'datastore_category' | 'builtin') => {
    setSourceKind(nextKind);
    if (nextKind === 'builtin') {
      const def = BUILTIN_METRICS.find((m) => m.id === builtinId) || BUILTIN_METRICS[0];
      if (!titleTouched) setTitle(def.label);
      setVisualization(def.defaultVisualization);
      setSpan(def.defaultSpan);
      setAccentColor(def.defaultAccent);
    } else if (nextKind === 'custom_stat') {
      if (!titleTouched) setTitle(prettyStatKey(statKey));
      setVisualization('bar');
      setSpan(6);
      setAccentColor('violet');
    } else if (nextKind === 'datastore_category') {
      if (!titleTouched) {
        setTitle(computeAutoDatastoreTitle(category, aggregation, groupByField));
      }
      setVisualization(aggregation === 'group_by' ? 'horizontal_bar' : 'kpi');
      setSpan(aggregation === 'group_by' ? 6 : 3);
      setAccentColor('cyan');
    }
  };

  const handleBuiltinChange = (nextId: BuiltinMetricId) => {
    setBuiltinId(nextId);
    const def = BUILTIN_METRICS.find((m) => m.id === nextId);
    if (def) {
      if (!titleTouched) setTitle(def.label);
      setVisualization(def.defaultVisualization);
      setSpan(def.defaultSpan);
      setAccentColor(def.defaultAccent);
    }
  };

  const handleStatKeyChange = (nextKey: string) => {
    setStatKey(nextKey);
    if (!titleTouched && nextKey.trim()) {
      setTitle(prettyStatKey(nextKey.trim()));
    }
  };

  const handleCategoryChange = (nextCat: string) => {
    setCategory(nextCat);
    if (!titleTouched && nextCat.trim()) {
      setTitle(computeAutoDatastoreTitle(nextCat, aggregation, groupByField));
    }
  };

  const handleVisualizationChange = (nextVis: CustomWidgetVisualization) => {
    setVisualization(nextVis);
    if (nextVis === 'kpi' && span > 4) {
      setSpan(3);
    } else if (nextVis !== 'kpi' && span < 4) {
      setSpan(6);
    }
  };

  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (sourceKind === 'custom_stat') return Boolean(statKey.trim());
    if (sourceKind === 'datastore_category') {
      if (!category.trim()) return false;
      if (aggregation !== 'count' && !groupByField.trim()) return false;
      return true;
    }
    return Boolean(builtinId);
  }, [title, sourceKind, statKey, category, aggregation, groupByField, builtinId]);

  const inlineSnippet = useMemo(() => {
    const cleanStatKey = (statKey || 'tickets_created').trim().replace(/^total_/, '');
    const cleanCat = (category || 'custom_metrics').trim();
    const cleanField = (groupByField || 'severity').trim();
    const isNumericAgg = aggregation === 'sum' || aggregation === 'avg' || aggregation === 'max' || aggregation === 'min';
    const sampleObj: Record<string, any> = isNumericAgg
      ? { [cleanField]: 42, status: 'open', created_at: Math.floor(Date.now() / 1000) }
      : { [cleanField]: 'high', status: 'open', created_at: Math.floor(Date.now() / 1000) };

    if (sourceKind === 'custom_stat') {
      return `POST /api/v1/orgs/${orgId || '{org_id}'}/stats\n${JSON.stringify(
        { key: cleanStatKey, value: 1 },
        null,
        2,
      )}`;
    }
    if (sourceKind === 'datastore_category') {
      return `POST /api/v2/datastore\n${JSON.stringify(
        {
          category: cleanCat,
          key: `record_${Date.now().toString(36)}`,
          value: JSON.stringify(sampleObj),
        },
        null,
        2,
      )}`;
    }
    return '';
  }, [sourceKind, statKey, category, groupByField, aggregation, orgId]);

  const handleCopyInlineSnippet = async () => {
    if (!inlineSnippet) return;
    try {
      await navigator.clipboard.writeText(inlineSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    let dataSource: CustomWidgetDataSource;
    if (sourceKind === 'custom_stat') {
      dataSource = {
        kind: 'custom_stat',
        statKey: statKey.trim(),
        ...(additionalStatKeys.length > 0 ? { additionalStatKeys } : {}),
      };
    } else if (sourceKind === 'datastore_category') {
      dataSource = {
        kind: 'datastore_category',
        category: category.trim(),
        aggregation,
        ...(aggregation !== 'count' && groupByField.trim()
          ? { groupByField: groupByField.trim() }
          : {}),
        ...(filterField.trim() ? { filterField: filterField.trim() } : {}),
        ...(filterValue.trim() ? { filterValue: filterValue.trim() } : {}),
      };
    } else {
      dataSource = {
        kind: 'builtin',
        builtinId,
      };
    }

    const widget: CustomDashboardWidget = {
      id: initialWidget?.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      visualization,
      span,
      accentColor,
      dataSource,
    };
    if (typeof onSave === 'function') {
      void onSave(widget);
    } else if (typeof onSubmit === 'function') {
      void onSubmit(widget);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            fontSize: '1rem',
            fontWeight: 600,
            pb: 1,
          }}
        >
          <span>{initialWidget ? 'Configure Widget' : 'Add Dashboard Widget'}</span>
          <Button
            component="a"
            href="/docs/API#stats-and-timelines"
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            variant="outlined"
            sx={{
              height: 28,
              px: 1.25,
              textTransform: 'none',
              fontSize: '0.72rem',
              fontWeight: 600,
              borderColor: 'hsl(var(--border))',
              color: NEON.cyan,
            }}
          >
            Stats API docs
          </Button>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {/* Data Source Kind */}
          <FormControl size="small" fullWidth>
            <InputLabel>Data Source</InputLabel>
            <Select
              label="Data Source"
              value={sourceKind}
              onChange={(e) =>
                handleSourceKindChange(
                  e.target.value as 'custom_stat' | 'datastore_category' | 'builtin',
                )
              }
            >
              <MenuItem value="builtin">Built-in Platform Metric (Security, Vulns, Automation)</MenuItem>
              <MenuItem value="custom_stat">Organization Custom Stat (/api/v1/orgs/stats — Any Counter)</MenuItem>
              <MenuItem value="datastore_category">Datastore Category (Any JSON Category & Field)</MenuItem>
            </Select>
          </FormControl>

          {/* Source-specific configuration */}
          {sourceKind === 'builtin' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Metric / Panel</InputLabel>
              <Select
                label="Metric / Panel"
                value={builtinId}
                onChange={(e) => handleBuiltinChange(e.target.value as BuiltinMetricId)}
              >
                {BUILTIN_METRICS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.category}: {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {sourceKind === 'custom_stat' && (
            <>
              <Autocomplete
                freeSolo
                size="small"
                options={mergedStatKeys}
                value={statKey}
                onChange={(_e, val) => {
                  const raw = typeof val === 'string' ? val.trim() : '';
                  if (!raw) {
                    handleStatKeyChange('');
                    return;
                  }
                  const lower = raw.toLowerCase();
                  const matched = mergedStatKeys.find(
                    (k) => k.toLowerCase() === lower || prettyStatKey(k).toLowerCase() === lower,
                  );
                  handleStatKeyChange(matched || raw.toLowerCase().replace(/\s+/g, '_'));
                }}
                getOptionLabel={(opt) => (typeof opt === 'string' ? prettyStatKey(opt) : String(opt))}
                filterOptions={(options, state) => {
                  const q = state.inputValue.trim().toLowerCase();
                  if (!q) return options;
                  return options.filter(
                    (opt) =>
                      opt.toLowerCase().includes(q) ||
                      prettyStatKey(opt).toLowerCase().includes(q),
                  );
                }}
                renderOption={(props, opt) => {
                  const total = statTotals[opt];
                  return (
                    <li {...props} key={opt}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, width: '100%' }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                          {prettyStatKey(opt)}
                        </Typography>
                        {total !== undefined && (
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              fontFamily: 'ui-monospace, monospace',
                              color: total > 0 ? NEON.cyan : 'hsl(var(--muted-foreground))',
                              flexShrink: 0,
                            }}
                          >
                            {formatCompactCount(total)}
                          </Typography>
                        )}
                      </Box>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Primary Stat"
                    placeholder="e.g. Tickets Created, Alerts Triaged, Workflow Executions"
                    helperText="Pick any stat or type a new custom stat name."
                    required
                  />
                )}
              />
              {visualization !== 'kpi' && (
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={mergedStatKeys.filter((k) => k !== statKey)}
                  value={additionalStatKeys}
                  onChange={(_e, val) =>
                    setAdditionalStatKeys(
                      val
                        .map((v) => {
                          const raw = String(v).trim();
                          if (!raw) return '';
                          const lower = raw.toLowerCase();
                          const matched = mergedStatKeys.find(
                            (k) => k.toLowerCase() === lower || prettyStatKey(k).toLowerCase() === lower,
                          );
                          return matched || raw.toLowerCase().replace(/\s+/g, '_');
                        })
                        .filter(Boolean),
                    )
                  }
                  getOptionLabel={(opt) => (typeof opt === 'string' ? prettyStatKey(opt) : String(opt))}
                  renderOption={(props, opt) => (
                    <li {...props} key={opt}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                        <span>{prettyStatKey(opt)}</span>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Additional Stats (optional)"
                      placeholder="Select or type more stats to compare on the same chart"
                    />
                  )}
                />
              )}
            </>
          )}

          {sourceKind === 'datastore_category' && (
            <>
              <Autocomplete
                freeSolo
                size="small"
                options={mergedCategories}
                value={category}
                onChange={(_e, val) => handleCategoryChange(typeof val === 'string' ? val : '')}
                onInputChange={(_e, val, reason) => {
                  if (reason === 'input' || reason === 'clear') {
                    handleCategoryChange(val || '');
                  }
                }}
                getOptionLabel={(opt) => (typeof opt === 'string' ? opt : String(opt))}
                renderOption={(props, opt) => {
                  const found = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === opt);
                  const count = categoryRecordCounts[opt] ?? liveCategoryCounts[opt];
                  return (
                    <li {...props} key={opt}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, width: '100%' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                            {found ? found.label.split(' (')[0] : opt}
                          </Typography>
                          <Typography sx={{ fontSize: '0.7rem', fontFamily: 'ui-monospace, monospace', color: 'hsl(var(--muted-foreground))' }}>
                            {opt}
                          </Typography>
                        </Box>
                        {count !== undefined && (
                          <Typography
                            sx={{
                              fontSize: '0.72rem',
                              fontFamily: 'ui-monospace, monospace',
                              color: count > 0 ? NEON.cyan : 'hsl(var(--muted-foreground))',
                              flexShrink: 0,
                            }}
                          >
                            {count} {count === 1 ? 'record' : 'records'}
                          </Typography>
                        )}
                      </Box>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Datastore Category"
                    placeholder="e.g. shuffle-security_incidents or any custom workflow category"
                    helperText="Choose a built-in category or type any custom Datastore category written by your workflows."
                    required
                  />
                )}
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Aggregation</InputLabel>
                  <Select
                    label="Aggregation"
                    value={aggregation}
                    onChange={(e) => {
                      const nextAgg = e.target.value as DatastoreAggregation;
                      setAggregation(nextAgg);
                      if (!titleTouched) {
                        setTitle(computeAutoDatastoreTitle(category, nextAgg, groupByField));
                      }
                      if (nextAgg === 'group_by' && visualization === 'kpi') {
                        setVisualization('horizontal_bar');
                        setSpan(6);
                      } else if (
                        nextAgg === 'count' &&
                        (visualization === 'horizontal_bar' || visualization === 'radial')
                      ) {
                        setVisualization('kpi');
                        setSpan(3);
                      }
                    }}
                  >
                    {AGGREGATION_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {aggregation !== 'count' && (
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={suggestedGroupFields}
                    value={groupByField}
                    onChange={(_e, val) => {
                      const nextField = typeof val === 'string' ? val : '';
                      setGroupByField(nextField);
                      if (!titleTouched && nextField.trim()) {
                        setTitle(computeAutoDatastoreTitle(category, aggregation, nextField));
                      }
                    }}
                    onInputChange={(_e, val, reason) => {
                      if (reason === 'input' || reason === 'clear') {
                        setGroupByField(val || '');
                        if (!titleTouched && val?.trim()) {
                          setTitle(computeAutoDatastoreTitle(category, aggregation, val));
                        }
                      }
                    }}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : String(opt))}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={aggregation === 'group_by' ? 'Group By JSON Field' : 'Numeric JSON Field'}
                        placeholder={
                          aggregation === 'group_by'
                            ? 'e.g. severity, status, assignee.name'
                            : 'e.g. risk_score, cvss_score, latency_ms'
                        }
                        required
                      />
                    )}
                  />
                )}
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={suggestedGroupFields}
                  value={filterField}
                  onChange={(_e, val) => setFilterField(typeof val === 'string' ? val : '')}
                  onInputChange={(_e, val, reason) => {
                    if (reason === 'input' || reason === 'clear') {
                      setFilterField(val || '');
                    }
                  }}
                  getOptionLabel={(opt) => (typeof opt === 'string' ? opt : String(opt))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Filter Field (optional)"
                      placeholder="e.g. status or severity"
                    />
                  )}
                />
                <TextField
                  size="small"
                  label="Filter Value (optional)"
                  placeholder="e.g. open or critical"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                />
              </Box>
            </>
          )}

          {/* Concise link to API documentation */}
          {(sourceKind === 'custom_stat' || sourceKind === 'datastore_category') && (
            <Box
              sx={{
                px: 1.25,
                py: 1,
                borderRadius: 1.5,
                border: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--muted) / 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                flexWrap: 'wrap',
              }}
            >
              <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                {sourceKind === 'custom_stat'
                  ? `Push values via POST /api/v1/orgs/${orgId || '{org_id}'}/stats.`
                  : 'Push JSON records via POST /api/v2/datastore.'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  onClick={handleCopyInlineSnippet}
                  sx={{ height: 24, px: 1, textTransform: 'none', fontSize: '0.7rem' }}
                >
                  {copiedSnippet ? 'Copied' : 'Copy payload'}
                </Button>
                <Button
                  component="a"
                  href="/docs/API#stats-and-timelines"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  sx={{ height: 24, px: 1, textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, color: NEON.violet }}
                >
                  Stats API docs
                </Button>
              </Box>
            </Box>
          )}

          {/* Widget Title */}
          <TextField
            size="small"
            label="Widget Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            fullWidth
            required
          />

          {/* Visualization, Span, and Accent Color */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Visualization</InputLabel>
              <Select
                label="Visualization"
                value={visualization}
                onChange={(e) => handleVisualizationChange(e.target.value as CustomWidgetVisualization)}
              >
                {VISUALIZATION_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Width (12-col Grid)</InputLabel>
              <Select
                label="Width (12-col Grid)"
                value={span}
                onChange={(e) => setSpan(Number(e.target.value) as WidgetSpan)}
              >
                {WIDGET_SPAN_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <FormControl size="small" fullWidth>
            <InputLabel>Accent Color</InputLabel>
            <Select
              label="Accent Color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value as keyof typeof NEON)}
            >
              {ACCENT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: opt.hex,
                        flexShrink: 0,
                      }}
                    />
                    <span>{opt.label}</span>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} size="small" sx={{ height: 32, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="small"
            disabled={!canSave}
            sx={{ height: 32, textTransform: 'none', fontWeight: 600 }}
          >
            {initialWidget ? 'Save Widget' : 'Add Widget'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

// ── Raw JSON Config Editor Dialog ───────────────────────────────────────────

export interface DashboardJsonDialogProps {
  open: boolean;
  onClose: () => void;
  config: CustomDashboardConfig;
  onApply?: (updated: CustomDashboardConfig) => Promise<void> | void;
  onSave?: (updated: CustomDashboardConfig) => Promise<void> | void;
  onSubmit?: (updated: CustomDashboardConfig) => Promise<void> | void;
}

export const DashboardJsonDialog = ({
  open,
  onClose,
  config,
  onApply,
  onSave,
  onSubmit,
}: DashboardJsonDialogProps) => {
  const [rawJson, setRawJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setRawJson(JSON.stringify(config, null, 2));
      setError(null);
      setCopied(false);
    }
  }, [open, config]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const handleSave = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err: any) {
      setError(`Invalid JSON syntax: ${err?.message || 'parse error'}`);
      return;
    }

    // Preserve dashboard id if user accidentally omitted it
    if (parsed && typeof parsed === 'object' && !(parsed as any).id) {
      (parsed as any).id = config.id;
    }

    const result = validateCustomDashboardConfig(parsed);
    if (result.valid === false) {
      setError(result.error);
      return;
    }

    // Keep the original dashboard id so we update the current dashboard record in-place
    const normalized: CustomDashboardConfig = {
      ...result.config,
      id: config.id,
    };

    if (typeof onApply === 'function') {
      await onApply(normalized);
    } else if (typeof onSave === 'function') {
      await onSave(normalized);
    } else if (typeof onSubmit === 'function') {
      await onSubmit(normalized);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pb: 1 }}>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>
            Dashboard JSON Configuration
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
            Stored in Datastore category <code>{DATASTORE_CATEGORIES.DASHBOARDS}</code> (key: <code>{config.id}</code>)
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={handleCopy}
          sx={{ height: 30, textTransform: 'none', fontSize: '0.75rem' }}
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </Button>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
        {error && (
          <Box
            sx={{
              p: 1.25,
              borderRadius: 1.5,
              border: `1px solid ${NEON.red}66`,
              bgcolor: `${NEON.red}14`,
              color: NEON.red,
              fontSize: '0.78rem',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {error}
          </Box>
        )}

        <HighlightedFileEditor
          value={rawJson}
          onChange={(nextVal) => {
            setRawJson(nextVal);
            if (error) setError(null);
          }}
          language="json"
          validateJson
          minHeight={360}
          maxHeight={520}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small" sx={{ height: 32, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          size="small"
          sx={{ height: 32, textTransform: 'none', fontWeight: 600 }}
        >
          Apply JSON
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Dashboard Data Input & Custom Stats Guide Dialog ────────────────────────

export interface DashboardDataGuideDialogProps {
  open: boolean;
  onClose: () => void;
  orgId?: string | null;
}

export const DashboardDataGuideDialog = ({
  open,
  onClose,
  orgId,
}: DashboardDataGuideDialogProps) => {
  const resolvedOrg = orgId || '{org_id}';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1, fontSize: '1rem', fontWeight: 600 }}>
        Custom Stats & Dashboard API
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
        <Typography sx={{ fontSize: '0.82rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
          Send custom counters via <code>POST /api/v1/orgs/{resolvedOrg}/stats</code> or structured JSON records via <code>POST /api/v2/datastore</code>.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button
          component="a"
          href="/docs/API#stats-and-timelines"
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          size="small"
          sx={{ height: 32, textTransform: 'none', fontWeight: 600 }}
        >
          Open Stats & Timelines API Docs
        </Button>
        <Button
          onClick={onClose}
          size="small"
          sx={{ height: 32, textTransform: 'none' }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
