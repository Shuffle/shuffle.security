/**
 * Types, constants, and validation helpers for user-defined Custom Dashboards.
 * Stored in the Shuffle Datastore under category `shuffle-security_dashboards`.
 */
import { NEON } from './_shared';
import { DATASTORE_CATEGORIES } from '../../datastore';

export type WidgetSpan = 3 | 4 | 6 | 8 | 12;

export const WIDGET_SPAN_OPTIONS: { value: WidgetSpan; label: string; description: string }[] = [
  { value: 3, label: '1/4 row (3 cols)', description: 'Compact KPI tile (4 per row)' },
  { value: 4, label: '1/3 row (4 cols)', description: 'Standard tile or small chart (3 per row)' },
  { value: 6, label: '1/2 row (6 cols)', description: 'Half-width panel (2 per row)' },
  { value: 8, label: '2/3 row (8 cols)', description: 'Wide panel (2/3 width)' },
  { value: 12, label: 'Full row (12 cols)', description: 'Full-width hero chart' },
];

export type CustomWidgetVisualization = 'kpi' | 'bar' | 'area' | 'horizontal_bar' | 'radial';

export const VISUALIZATION_OPTIONS: { value: CustomWidgetVisualization; label: string }[] = [
  { value: 'kpi', label: 'KPI Tile (Single Metric + Sparkline)' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'area', label: 'Area Chart (Time Series)' },
  { value: 'horizontal_bar', label: 'Horizontal Breakdown List' },
  { value: 'radial', label: 'Radial Distribution Chart' },
];

export type BuiltinMetricId =
  | 'open_incidents'
  | 'critical_high_incidents'
  | 'resolved_incidents'
  | 'critical_high_vulns'
  | 'total_vulns'
  | 'workflow_runs_success'
  | 'workflow_runs_failed'
  | 'app_runs_success'
  | 'hours_saved'
  | 'incident_activity'
  | 'workflow_activity'
  | 'vulnerability_severity';

export interface BuiltinMetricDefinition {
  id: BuiltinMetricId;
  label: string;
  category: 'Security' | 'Vulnerabilities' | 'Automation';
  defaultVisualization: CustomWidgetVisualization;
  defaultSpan: WidgetSpan;
  defaultAccent: keyof typeof NEON;
}

export const BUILTIN_METRICS: BuiltinMetricDefinition[] = [
  {
    id: 'open_incidents',
    label: 'Open Incidents',
    category: 'Security',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'magenta',
  },
  {
    id: 'critical_high_incidents',
    label: 'Critical & High Incidents',
    category: 'Security',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'red',
  },
  {
    id: 'resolved_incidents',
    label: 'Resolved Incidents',
    category: 'Security',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'green',
  },
  {
    id: 'critical_high_vulns',
    label: 'Critical & High Vulnerabilities',
    category: 'Vulnerabilities',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'amber',
  },
  {
    id: 'total_vulns',
    label: 'Total Vulnerabilities',
    category: 'Vulnerabilities',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'violet',
  },
  {
    id: 'workflow_runs_success',
    label: 'Successful Workflow Runs',
    category: 'Automation',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'green',
  },
  {
    id: 'workflow_runs_failed',
    label: 'Failed Workflow Runs',
    category: 'Automation',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'red',
  },
  {
    id: 'app_runs_success',
    label: 'Successful App Executions',
    category: 'Automation',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'cyan',
  },
  {
    id: 'hours_saved',
    label: 'Analyst Hours Saved (est.)',
    category: 'Automation',
    defaultVisualization: 'kpi',
    defaultSpan: 3,
    defaultAccent: 'green',
  },
  {
    id: 'incident_activity',
    label: 'Incident Volume Over Time',
    category: 'Security',
    defaultVisualization: 'area',
    defaultSpan: 6,
    defaultAccent: 'magenta',
  },
  {
    id: 'workflow_activity',
    label: 'Workflow Runs Over Time (Success vs Failed)',
    category: 'Automation',
    defaultVisualization: 'area',
    defaultSpan: 6,
    defaultAccent: 'green',
  },
  {
    id: 'vulnerability_severity',
    label: 'Vulnerabilities by Severity',
    category: 'Vulnerabilities',
    defaultVisualization: 'horizontal_bar',
    defaultSpan: 6,
    defaultAccent: 'amber',
  },
];

export const KNOWN_DATASTORE_CATEGORIES: { value: string; label: string; suggestedFields: string[] }[] = [
  {
    value: DATASTORE_CATEGORIES.INCIDENTS,
    label: 'Incidents (shuffle-security_incidents)',
    suggestedFields: ['severity', 'status', 'assignee.name', 'finding_info.title', 'confidence_score', 'risk_score'],
  },
  {
    value: DATASTORE_CATEGORIES.VULNERABILITIES,
    label: 'Vulnerabilities (shuffle-security_vulns)',
    suggestedFields: ['severity', 'status', 'source', 'cvss_score'],
  },
  {
    value: DATASTORE_CATEGORIES.ASSETS,
    label: 'Assets (shuffle-security_assets)',
    suggestedFields: ['type', 'os', 'status', 'criticality', 'risk_score'],
  },
  {
    value: DATASTORE_CATEGORIES.EVENTS,
    label: 'Events (shuffle-security_events)',
    suggestedFields: ['severity', 'source', 'type', 'count'],
  },
  {
    value: DATASTORE_CATEGORIES.IOCS,
    label: 'IOCs (shuffle-security_ioc-config)',
    suggestedFields: ['type', 'severity', 'source', 'confidence'],
  },
  {
    value: DATASTORE_CATEGORIES.THREAT_FEEDS,
    label: 'Threat Feeds (shuffle-security_threat-feeds)',
    suggestedFields: ['type', 'status', 'indicator_count'],
  },
  {
    value: DATASTORE_CATEGORIES.MONITORS,
    label: 'Monitors (shuffle-security_monitors)',
    suggestedFields: ['type', 'status', 'platform', 'environment'],
  },
  {
    value: DATASTORE_CATEGORIES.REPORTS,
    label: 'Reports (shuffle-security_reports)',
    suggestedFields: ['type', 'status', 'severity'],
  },
  {
    value: DATASTORE_CATEGORIES.DETECTION_ENGINES,
    label: 'Detection Engines (shuffle-security_detection-engines)',
    suggestedFields: ['type', 'status', 'vendor'],
  },
  {
    value: DATASTORE_CATEGORIES.CASE_MGMT_CONFIG,
    label: 'Case Management (shuffle-security_case-mgmt)',
    suggestedFields: ['type', 'status', 'priority'],
  },
];

export type DatastoreAggregation = 'count' | 'group_by' | 'sum' | 'avg' | 'max' | 'min';

export type CustomWidgetDataSource =
  | {
      kind: 'custom_stat';
      /** Stat key from /api/v1/orgs/{id}/stats (e.g. "tickets_created" or "total_workflow_executions") */
      statKey: string;
      /** Optional additional stat keys when charting multiple series */
      additionalStatKeys?: string[];
    }
  | {
      kind: 'datastore_category';
      /** Datastore category name, e.g. "shuffle-security_incidents" or any custom workflow category */
      category: string;
      /** Aggregation mode: total item count, group by JSON field, or numeric aggregation (sum/avg/max/min) */
      aggregation: DatastoreAggregation;
      /** Field path when aggregation !== 'count' (e.g. "severity", "status", "score", "metrics.latency_ms") */
      groupByField?: string;
      /** Optional filter expression (field = value) */
      filterField?: string;
      filterValue?: string;
    }
  | {
      kind: 'builtin';
      /** Reference to a pre-wired metric or panel */
      builtinId: BuiltinMetricId;
    };

export interface CustomDashboardWidget {
  id: string;
  title: string;
  visualization: CustomWidgetVisualization;
  span: WidgetSpan;
  accentColor?: keyof typeof NEON;
  dataSource: CustomWidgetDataSource;
}

export interface CustomDashboardConfig {
  id: string;
  name: string;
  description?: string;
  version: 1;
  createdAt: number;
  updatedAt: number;
  widgets: CustomDashboardWidget[];
}

export type CustomDashboardTab = `custom:${string}`;

export const isCustomDashboardTab = (tab: string): tab is CustomDashboardTab =>
  typeof tab === 'string' && tab.startsWith('custom:') && tab.length > 7;

export const toCustomDashboardTab = (id: string): CustomDashboardTab =>
  `custom:${id}`;

export const fromCustomDashboardTab = (tab: string): string | null =>
  isCustomDashboardTab(tab) ? tab.slice(7) : null;

const VALID_SPANS: WidgetSpan[] = [3, 4, 6, 8, 12];
const VALID_VISUALIZATIONS: CustomWidgetVisualization[] = ['kpi', 'bar', 'area', 'horizontal_bar', 'radial'];
const VALID_NEON_KEYS = Object.keys(NEON) as Array<keyof typeof NEON>;
const VALID_AGGREGATIONS: DatastoreAggregation[] = ['count', 'group_by', 'sum', 'avg', 'max', 'min'];

export function createStarterCustomDashboard(
  name: string,
  description?: string,
  customId?: string,
): CustomDashboardConfig {
  const now = Date.now();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'dashboard';
  const id = customId || `dash_${slug}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    name: name.trim() || 'Custom Dashboard',
    description: description?.trim() || undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
    widgets: [
      {
        id: `w_${now}_1`,
        title: 'Open Incidents',
        visualization: 'kpi',
        span: 3,
        accentColor: 'magenta',
        dataSource: { kind: 'builtin', builtinId: 'open_incidents' },
      },
      {
        id: `w_${now}_2`,
        title: 'Critical & High Vulns',
        visualization: 'kpi',
        span: 3,
        accentColor: 'amber',
        dataSource: { kind: 'builtin', builtinId: 'critical_high_vulns' },
      },
      {
        id: `w_${now}_3`,
        title: 'Successful Workflow Runs',
        visualization: 'kpi',
        span: 3,
        accentColor: 'green',
        dataSource: { kind: 'builtin', builtinId: 'workflow_runs_success' },
      },
      {
        id: `w_${now}_4`,
        title: 'Analyst Hours Saved (est.)',
        visualization: 'kpi',
        span: 3,
        accentColor: 'cyan',
        dataSource: { kind: 'builtin', builtinId: 'hours_saved' },
      },
      {
        id: `w_${now}_5`,
        title: 'Workflow Executions Trend',
        visualization: 'bar',
        span: 6,
        accentColor: 'violet',
        dataSource: {
          kind: 'custom_stat',
          statKey: 'total_workflow_executions',
        },
      },
      {
        id: `w_${now}_6`,
        title: 'Incidents by Severity',
        visualization: 'horizontal_bar',
        span: 6,
        accentColor: 'magenta',
        dataSource: {
          kind: 'datastore_category',
          category: DATASTORE_CATEGORIES.INCIDENTS,
          aggregation: 'group_by',
          groupByField: 'severity',
        },
      },
    ],
  };
}

export function validateCustomDashboardConfig(
  raw: unknown,
): { valid: true; config: CustomDashboardConfig } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Dashboard configuration must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '';
  if (!id) {
    return { valid: false, error: 'Missing or invalid "id" string field.' };
  }
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '';
  if (!name) {
    return { valid: false, error: 'Missing or invalid "name" string field.' };
  }
  if (!Array.isArray(obj.widgets)) {
    return { valid: false, error: '"widgets" must be an array.' };
  }

  const widgets: CustomDashboardWidget[] = [];
  for (let i = 0; i < obj.widgets.length; i++) {
    const w = obj.widgets[i] as Record<string, unknown> | null;
    if (!w || typeof w !== 'object') {
      return { valid: false, error: `Widget at index ${i} must be an object.` };
    }
    const wId = typeof w.id === 'string' && w.id.trim() ? w.id.trim() : `widget_${i + 1}`;
    const title = typeof w.title === 'string' && w.title.trim() ? w.title.trim() : `Widget ${i + 1}`;
    const vis = VALID_VISUALIZATIONS.includes(w.visualization as CustomWidgetVisualization)
      ? (w.visualization as CustomWidgetVisualization)
      : 'kpi';
    const span = VALID_SPANS.includes(Number(w.span) as WidgetSpan)
      ? (Number(w.span) as WidgetSpan)
      : (vis === 'kpi' ? 3 : 6);
    const accentColor = VALID_NEON_KEYS.includes(w.accentColor as keyof typeof NEON)
      ? (w.accentColor as keyof typeof NEON)
      : 'violet';

    const ds = w.dataSource as Record<string, unknown> | null;
    if (!ds || typeof ds !== 'object' || typeof ds.kind !== 'string') {
      return { valid: false, error: `Widget "${title}" is missing a valid "dataSource" object.` };
    }

    let dataSource: CustomWidgetDataSource;
    if (ds.kind === 'custom_stat') {
      if (typeof ds.statKey !== 'string' || !ds.statKey.trim()) {
        return { valid: false, error: `Widget "${title}" (custom_stat) requires a non-empty "statKey".` };
      }
      const additionalStatKeys = Array.isArray(ds.additionalStatKeys)
        ? ds.additionalStatKeys.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
        : undefined;
      dataSource = {
        kind: 'custom_stat',
        statKey: ds.statKey.trim(),
        ...(additionalStatKeys && additionalStatKeys.length > 0 ? { additionalStatKeys } : {}),
      };
    } else if (ds.kind === 'datastore_category') {
      if (typeof ds.category !== 'string' || !ds.category.trim()) {
        return { valid: false, error: `Widget "${title}" (datastore_category) requires a non-empty "category".` };
      }
      const aggregation: DatastoreAggregation = VALID_AGGREGATIONS.includes(ds.aggregation as DatastoreAggregation)
        ? (ds.aggregation as DatastoreAggregation)
        : 'count';
      dataSource = {
        kind: 'datastore_category',
        category: ds.category.trim(),
        aggregation,
        groupByField: typeof ds.groupByField === 'string' && ds.groupByField.trim() ? ds.groupByField.trim() : undefined,
        filterField: typeof ds.filterField === 'string' && ds.filterField.trim() ? ds.filterField.trim() : undefined,
        filterValue: typeof ds.filterValue === 'string' && ds.filterValue.trim() ? ds.filterValue.trim() : undefined,
      };
    } else if (ds.kind === 'builtin') {
      if (typeof ds.builtinId !== 'string' || !ds.builtinId.trim()) {
        return { valid: false, error: `Widget "${title}" (builtin) requires a non-empty "builtinId".` };
      }
      dataSource = {
        kind: 'builtin',
        builtinId: ds.builtinId.trim() as BuiltinMetricId,
      };
    } else {
      return { valid: false, error: `Widget "${title}" has unsupported dataSource.kind "${String(ds.kind)}".` };
    }

    widgets.push({
      id: wId,
      title,
      visualization: vis,
      span,
      accentColor,
      dataSource,
    });
  }

  const now = Date.now();
  return {
    valid: true,
    config: {
      id,
      name,
      description: typeof obj.description === 'string' && obj.description.trim() ? obj.description.trim() : undefined,
      version: 1,
      createdAt: typeof obj.createdAt === 'number' && obj.createdAt > 0 ? obj.createdAt : now,
      updatedAt: now,
      widgets,
    },
  };
}
