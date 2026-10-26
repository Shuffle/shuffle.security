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
  type WidgetSpan,
} from './customDashboardTypes';
import { DATASTORE_CATEGORIES } from '../../datastore';

const DEFAULT_STAT_KEYS = [
  'total_workflow_executions',
  'total_workflow_executions_aborted',
  'total_app_executions',
  'total_app_executions_failed',
  'total_subflow_executions',
  'total_cloud_executions',
  'total_onprem_executions',
];

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

const prettyStatKey = (key: string): string => {
  let bare = key;
  if (bare.startsWith('total_')) bare = bare.slice(6);
  if (bare.toLowerCase().startsWith('categorylabel_')) bare = bare.slice('categorylabel_'.length);
  const spaced = bare.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
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
  onSave: (widget: CustomDashboardWidget) => void;
}

export const WidgetEditorDialog = ({
  open,
  onClose,
  initialWidget,
  availableStatKeys = [],
  onSave,
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
  const [aggregation, setAggregation] = useState<'count' | 'group_by'>('group_by');
  const [groupByField, setGroupByField] = useState('severity');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [builtinId, setBuiltinId] = useState<BuiltinMetricId>('open_incidents');

  const mergedStatKeys = useMemo(() => {
    const set = new Set<string>([...availableStatKeys, ...DEFAULT_STAT_KEYS]);
    return Array.from(set).sort((a, b) => prettyStatKey(a).localeCompare(prettyStatKey(b)));
  }, [availableStatKeys]);

  const suggestedGroupFields = useMemo(() => {
    const found = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === category);
    return found
      ? found.suggestedFields.map((s) => s.trim())
      : ['severity', 'status', 'type', 'source'];
  }, [category]);

  useEffect(() => {
    if (!open) return;
    if (initialWidget) {
      setTitle(initialWidget.title);
      setTitleTouched(true);
      setVisualization(initialWidget.visualization);
      setSpan(initialWidget.span);
      setAccentColor(initialWidget.accentColor || 'violet');
      const ds = initialWidget.dataSource;
      setSourceKind(ds.kind);
      if (ds.kind === 'custom_stat') {
        setStatKey(ds.statKey);
        setAdditionalStatKeys(ds.additionalStatKeys || []);
      } else if (ds.kind === 'datastore_category') {
        setCategory(ds.category);
        setAggregation(ds.aggregation);
        setGroupByField(ds.groupByField || 'severity');
        setFilterField(ds.filterField || '');
        setFilterValue(ds.filterValue || '');
      } else if (ds.kind === 'builtin') {
        setBuiltinId(ds.builtinId);
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
      const known = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === category);
      const shortName = known ? known.label.split(' (')[0] : category;
      if (!titleTouched) {
        setTitle(
          aggregation === 'group_by' && groupByField
            ? `${shortName} by ${groupByField}`
            : `Total ${shortName}`,
        );
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
      const known = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === nextCat.trim());
      const shortName = known ? known.label.split(' (')[0] : nextCat.trim();
      setTitle(
        aggregation === 'group_by' && groupByField
          ? `${shortName} by ${groupByField}`
          : `Total ${shortName}`,
      );
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
      if (aggregation === 'group_by' && !groupByField.trim()) return false;
      return true;
    }
    return Boolean(builtinId);
  }, [title, sourceKind, statKey, category, aggregation, groupByField, builtinId]);

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
        ...(aggregation === 'group_by' && groupByField.trim()
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
    onSave(widget);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, pb: 1 }}>
          {initialWidget ? 'Configure Widget' : 'Add Dashboard Widget'}
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
              <MenuItem value="custom_stat">Organization Custom Stat (/api/v1/orgs/stats)</MenuItem>
              <MenuItem value="datastore_category">Datastore Category Aggregation</MenuItem>
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
                onChange={(_e, val) => handleStatKeyChange(val || '')}
                onInputChange={(_e, val) => handleStatKeyChange(val || '')}
                getOptionLabel={(opt) => `${prettyStatKey(opt)} (${opt})`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Primary Stat Key"
                    placeholder="e.g. tickets_created or total_workflow_executions"
                    helperText="Select a discovered org stat key or type any custom addition key."
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
                  onChange={(_e, val) => setAdditionalStatKeys(val.map((v) => v.trim()).filter(Boolean))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Additional Stat Keys (optional)"
                      placeholder="Compare multiple stats on the same chart"
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
                options={KNOWN_DATASTORE_CATEGORIES.map((c) => c.value)}
                value={category}
                onChange={(_e, val) => handleCategoryChange(val || '')}
                onInputChange={(_e, val) => handleCategoryChange(val || '')}
                getOptionLabel={(opt) => {
                  const found = KNOWN_DATASTORE_CATEGORIES.find((c) => c.value === opt);
                  return found ? found.label : opt;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Datastore Category"
                    placeholder="e.g. shuffle-security_incidents"
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
                      const nextAgg = e.target.value as 'count' | 'group_by';
                      setAggregation(nextAgg);
                      if (nextAgg === 'count' && visualization !== 'kpi') {
                        setVisualization('kpi');
                        setSpan(3);
                      } else if (nextAgg === 'group_by' && visualization === 'kpi') {
                        setVisualization('horizontal_bar');
                        setSpan(6);
                      }
                    }}
                  >
                    <MenuItem value="count">Total Item Count</MenuItem>
                    <MenuItem value="group_by">Group by JSON Field</MenuItem>
                  </Select>
                </FormControl>

                {aggregation === 'group_by' && (
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={suggestedGroupFields}
                    value={groupByField}
                    onChange={(_e, val) => setGroupByField(val || '')}
                    onInputChange={(_e, val) => setGroupByField(val || '')}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Group By Field"
                        placeholder="e.g. severity, status, source"
                        required
                      />
                    )}
                  />
                )}
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField
                  size="small"
                  label="Filter Field (optional)"
                  placeholder="e.g. status"
                  value={filterField}
                  onChange={(e) => setFilterField(e.target.value)}
                />
                <TextField
                  size="small"
                  label="Filter Value (optional)"
                  placeholder="e.g. open"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                />
              </Box>
            </>
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
  onApply: (updated: CustomDashboardConfig) => Promise<void> | void;
}

export const DashboardJsonDialog = ({
  open,
  onClose,
  config,
  onApply,
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

    await onApply(normalized);
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

        <TextField
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value);
            if (error) setError(null);
          }}
          multiline
          minRows={16}
          maxRows={24}
          fullWidth
          InputProps={{
            sx: {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.78rem',
              lineHeight: 1.5,
            },
          }}
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
