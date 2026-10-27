/**
 * CustomDashboard — User-configurable 12-column grid dashboard.
 *
 * Supports widgets powered by:
 *   1. Built-in Security, Vulnerability, and Automation metrics (`builtin`)
 *   2. Organization custom stats from `/api/v1/orgs/{orgId}/stats` (`custom_stat`)
 *   3. Arbitrary Shuffle Datastore categories with count or field-level group-by (`datastore_category`)
 *
 * Persisted via `useCustomDashboards` in the `shuffle-security_dashboards`
 * datastore category with localStorage fallback.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Typography,
} from '@mui/material';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getApiUrl, getAuthHeader } from '../../api';
import { DATASTORE_CATEGORIES, getDatastoreByCategory } from '../../datastore';
import type { ShuffleCoreHostProps } from '../../types/host-props';
import { useSyncHostBaseUrl } from '../../useSyncHostBaseUrl';
import {
  EmptyState,
  KpiTile,
  NEON,
  Panel,
  ReferenceArea,
  TooltipContent,
  bucketIndexOf,
  buildBuckets,
  buildBucketsBetween,
  useChartRangeDrag,
  type Granularity,
  type TimeBucket,
} from './_shared';
import {
  CreateDashboardDialog,
  DashboardJsonDialog,
  WidgetEditorDialog,
} from './CustomDashboardEditorDialog';
import {
  WIDGET_SPAN_OPTIONS,
  createStarterCustomDashboard,
  type CustomDashboardConfig,
  type CustomDashboardWidget,
  type WidgetSpan,
} from './customDashboardTypes';
import { useCustomDashboards } from '../../hooks/useCustomDashboards';

export interface CustomDashboardIncident {
  status: string;
  severity: string;
  createdTs: number;
}

export interface CustomDashboardProps extends ShuffleCoreHostProps {
  /** Controlled dashboard config. When omitted, CustomDashboard loads from `useCustomDashboards` using `dashboardId` (or the first available dashboard). */
  dashboard?: CustomDashboardConfig;
  /** Optional ID to select when `dashboard` prop is not passed directly. */
  dashboardId?: string;
  onUpdateDashboard?: (updated: CustomDashboardConfig) => Promise<void> | void;
  onSaveDashboard?: (updated: CustomDashboardConfig) => Promise<unknown> | void;
  onDeleteDashboard?: (id: string) => Promise<void> | void;
  onCreateDashboard?: () => void;
  orgId?: string | null;
  days?: number;
  gran?: Granularity;
  customRange?: { fromMs: number; toMs: number } | null;
  onRangeSelect?: (fromMs: number, toMs: number) => void;
  refreshKey?: number;
  incidents?: CustomDashboardIncident[];
  incidentsLoading?: boolean;
  vulnSeverityCounts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  vulnLoading?: boolean;
  minutesSavedPerAppRun?: number;
}

interface Addition {
  key: string;
  value: number;
}

interface DailyStat {
  date: string;
  app_executions?: number;
  app_executions_failed?: number;
  workflow_executions?: number;
  workflow_executions_finished?: number;
  workflow_executions_failed?: number;
  additions?: Addition[] | null;
  [k: string]: any;
}

interface StatsResponse {
  org_id?: string;
  org_name?: string;
  daily_statistics?: DailyStat[];
  additions?: Addition[] | null;
  [k: string]: any;
}

const SERIES_COLORS = [
  NEON.violet,
  NEON.cyan,
  NEON.magenta,
  NEON.green,
  NEON.amber,
  NEON.red,
  NEON.orange,
  NEON.pink,
];

const SEVERITY_COLOR_MAP: Record<string, string> = {
  critical: NEON.red,
  high: NEON.orange,
  medium: NEON.amber,
  low: NEON.cyan,
  info: NEON.violet,
  informational: NEON.violet,
  resolved: NEON.green,
  closed: NEON.green,
  open: NEON.magenta,
  new: NEON.cyan,
  in_progress: NEON.amber,
  'in progress': NEON.amber,
};

const formatCompact = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  }
  if (abs >= 1_000) {
    return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  }
  return String(Math.round(n));
};

const prettyStatLabel = (key: string): string => {
  if (!key || typeof key !== 'string') return '';
  let bare = key;
  if (bare.startsWith('total_')) bare = bare.slice(6);
  if (bare.toLowerCase().startsWith('categorylabel_')) bare = bare.slice('categorylabel_'.length);
  const spaced = bare.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

const valueForStat = (d: DailyStat, key: string): number => {
  if (!d || typeof d !== 'object' || typeof key !== 'string' || !key) return 0;
  const bare = key.startsWith('total_') ? key.slice(6) : key;
  if (d[bare] != null && typeof d[bare] !== 'object') return Number(d[bare]) || 0;
  if (d[key] != null && typeof d[key] !== 'object') return Number(d[key]) || 0;
  const additions = Array.isArray(d.additions) ? d.additions : [];
  const hit = additions.find((a: Addition) => a?.key === key || a?.key === bare);
  return hit ? Number(hit.value) || 0 : 0;
};

/** Parse a raw datastore entry into a flat/nested object for field extraction. */
const parseDatastoreRecord = (item: any): Record<string, any> => {
  if (!item || typeof item !== 'object') return {};
  let parsedValue: Record<string, any> = {};
  if (typeof item.value === 'string' && item.value.trim()) {
    try {
      const p = JSON.parse(item.value);
      if (p && typeof p === 'object') parsedValue = p;
    } catch {
      /* non-JSON value */
    }
  } else if (item.value && typeof item.value === 'object') {
    parsedValue = item.value;
  }
  return { ...item, ...parsedValue };
};

/** Extract a top-level or dot-separated property from an object. */
const extractField = (record: Record<string, any>, fieldPath?: string): string => {
  if (!fieldPath) return 'Unspecified';
  const trimmed = fieldPath.trim();
  if (!trimmed) return 'Unspecified';

  if (record[trimmed] !== undefined && record[trimmed] !== null && record[trimmed] !== '') {
    return String(record[trimmed]);
  }

  const parts = trimmed.split('.');
  let cur: any = record;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') {
      cur = undefined;
      break;
    }
    cur = cur[part];
  }
  if (cur === undefined || cur === null || cur === '') return 'Unspecified';
  if (typeof cur === 'object') return JSON.stringify(cur);
  return String(cur);
};

interface ResolvedWidgetData {
  loading: boolean;
  kpiValue: number | string;
  spark: number[];
  /** Time-series rows (`{ date, value, ... }`) when applicable */
  timeSeries: Array<Record<string, any>>;
  seriesKeys: Array<{ key: string; label: string; color: string }>;
  /** Breakdown rows (`{ label, count, color }`) for categorical charts */
  breakdown: Array<{ label: string; count: number; color: string }>;
}

export const CustomDashboard = ({
  dashboard: dashboardProp,
  dashboardId,
  onUpdateDashboard: onUpdateDashboardProp,
  onSaveDashboard,
  onDeleteDashboard: onDeleteDashboardProp,
  orgId: orgIdProp,
  days = 30,
  gran = 'daily',
  customRange,
  onRangeSelect,
  refreshKey,
  incidents: incidentsProp,
  incidentsLoading: incidentsLoadingProp,
  vulnSeverityCounts: vulnSeverityCountsProp,
  vulnLoading: vulnLoadingProp,
  minutesSavedPerAppRun = 2,
  serverside,
  isLoaded = true,
  isLoggedIn = true,
  globalUrl,
  userdata,
}: CustomDashboardProps) => {
  useSyncHostBaseUrl(globalUrl);
  const orgId = orgIdProp ?? userdata?.active_org?.id ?? null;

  // Standalone fallback: when mounted without a parent passing `dashboard` or
  // `onUpdateDashboard`, load and persist directly via `useCustomDashboards`.
  const needsStandaloneStore =
    !dashboardProp || (!onUpdateDashboardProp && !onSaveDashboard);
  const {
    dashboards: storedDashboards,
    saveDashboard: saveStoredDashboard,
    deleteDashboard: deleteStoredDashboard,
  } = useCustomDashboards({
    orgId,
    enabled: !serverside && isLoaded !== false && needsStandaloneStore,
  });

  const fallbackDashboard = useMemo(
    () => createStarterCustomDashboard('Overview', 'Custom dashboard'),
    [],
  );

  const dashboard = useMemo<CustomDashboardConfig>(() => {
    let chosen: CustomDashboardConfig | undefined = dashboardProp;
    if (!chosen && dashboardId) {
      chosen = storedDashboards.find((d) => d.id === dashboardId);
    }
    const resolved = chosen || storedDashboards[0] || fallbackDashboard;
    return Array.isArray(resolved.widgets)
      ? resolved
      : { ...resolved, widgets: [] };
  }, [dashboardProp, dashboardId, storedDashboards, fallbackDashboard]);

  const onUpdateDashboard = useCallback(
    async (updated: CustomDashboardConfig) => {
      if (typeof onUpdateDashboardProp === 'function') {
        await onUpdateDashboardProp(updated);
      } else if (typeof onSaveDashboard === 'function') {
        await onSaveDashboard(updated);
      } else {
        await saveStoredDashboard(updated);
      }
    },
    [onUpdateDashboardProp, onSaveDashboard, saveStoredDashboard],
  );

  const onDeleteDashboard = useMemo(() => {
    if (typeof onDeleteDashboardProp === 'function') return onDeleteDashboardProp;
    if (!dashboardProp && storedDashboards.length > 0) return deleteStoredDashboard;
    return undefined;
  }, [onDeleteDashboardProp, dashboardProp, storedDashboards.length, deleteStoredDashboard]);

  const [isEditing, setIsEditing] = useState(false);
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<CustomDashboardWidget | null>(null);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Org stats state (for `custom_stat` and `builtin` automation widgets)
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Datastore category cache: category -> parsed records
  const [categoryData, setCategoryData] = useState<Record<string, Record<string, any>[]>>({});
  const [categoryLoading, setCategoryLoading] = useState<Record<string, boolean>>({});

  // Standalone vulnerability fallback when `vulnSeverityCounts` is not passed by parent
  const [fetchedVulns, setFetchedVulns] = useState({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  });
  const [fetchedVulnsLoading, setFetchedVulnsLoading] = useState(false);

  const buildUrl = useCallback(
    (path: string) =>
      globalUrl ? `${globalUrl.replace(/\/$/, '')}${path}` : getApiUrl(path),
    [globalUrl],
  );

  // Fetch org stats
  useEffect(() => {
    if (serverside || !isLoaded || !isLoggedIn || !orgId) {
      setStatsLoading(false);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    (async () => {
      try {
        const res = await fetch(buildUrl(`/api/v1/orgs/${orgId}/stats`), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (!cancelled && res.ok) {
          setStats(await res.json());
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, isLoaded, isLoggedIn, serverside, buildUrl, refreshKey]);

  const hasBuiltinIncidentWidget = useMemo(
    () =>
      (dashboard.widgets || []).some(
        (w) =>
          w?.dataSource?.kind === 'builtin' &&
          (w.dataSource.builtinId === 'open_incidents' ||
            w.dataSource.builtinId === 'critical_high_incidents' ||
            w.dataSource.builtinId === 'resolved_incidents' ||
            w.dataSource.builtinId === 'incident_activity'),
      ),
    [dashboard.widgets],
  );

  const hasBuiltinVulnWidget = useMemo(
    () =>
      (dashboard.widgets || []).some(
        (w) =>
          w?.dataSource?.kind === 'builtin' &&
          (w.dataSource.builtinId === 'critical_high_vulns' ||
            w.dataSource.builtinId === 'total_vulns' ||
            w.dataSource.builtinId === 'vulnerability_severity'),
      ),
    [dashboard.widgets],
  );

  // Determine which datastore categories are referenced by widgets (including standalone incidents fallback)
  const requiredCategories = useMemo(() => {
    const set = new Set<string>();
    for (const w of dashboard.widgets || []) {
      if (w?.dataSource?.kind === 'datastore_category' && w.dataSource.category?.trim()) {
        set.add(w.dataSource.category.trim());
      }
    }
    if (incidentsProp === undefined && hasBuiltinIncidentWidget) {
      set.add(DATASTORE_CATEGORIES.INCIDENTS);
    }
    return Array.from(set);
  }, [dashboard.widgets, incidentsProp, hasBuiltinIncidentWidget]);

  // Fetch standalone vulnerabilities when not supplied by parent
  useEffect(() => {
    if (
      serverside ||
      !isLoaded ||
      !isLoggedIn ||
      vulnSeverityCountsProp !== undefined ||
      !hasBuiltinVulnWidget
    ) {
      setFetchedVulnsLoading(false);
      return;
    }
    let cancelled = false;
    setFetchedVulnsLoading(true);
    (async () => {
      try {
        const res = await fetch(buildUrl('/api/v2/vulns?skip_fields=false&top=100'), {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.keys || data.data || [];
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const item of list) {
          try {
            const v =
              item?.value != null
                ? typeof item.value === 'string'
                  ? JSON.parse(item.value)
                  : item.value
                : item;
            const sevRaw = (v?.severity || v?.database_specific?.severity || '')
              .toString()
              .toLowerCase();
            if (sevRaw.startsWith('crit')) counts.critical++;
            else if (sevRaw.startsWith('high') || sevRaw === 'severe') counts.high++;
            else if (sevRaw.startsWith('mod') || sevRaw.startsWith('med')) counts.medium++;
            else if (sevRaw.startsWith('low')) counts.low++;
            else counts.info++;
          } catch {
            /* skip */
          }
        }
        if (!cancelled) setFetchedVulns(counts);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setFetchedVulnsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    serverside,
    isLoaded,
    isLoggedIn,
    vulnSeverityCountsProp,
    hasBuiltinVulnWidget,
    buildUrl,
    refreshKey,
  ]);

  const incidents = useMemo<CustomDashboardIncident[]>(() => {
    if (incidentsProp !== undefined) return incidentsProp;
    const raw = categoryData[DATASTORE_CATEGORIES.INCIDENTS] || [];
    return raw.map((r) => {
      const rawTs = r.created_time ?? r.created_at ?? r.created ?? r.timestamp ?? 0;
      const num = typeof rawTs === 'number' ? rawTs : Date.parse(String(rawTs || ''));
      const createdTs = Number.isFinite(num) && num > 0 ? (num < 1e12 ? num * 1000 : num) : 0;
      return {
        status: String(r.status || 'open').toLowerCase(),
        severity: String(r.severity || 'medium').toLowerCase(),
        createdTs,
      };
    });
  }, [incidentsProp, categoryData]);

  const incidentsLoading =
    incidentsLoadingProp !== undefined
      ? incidentsLoadingProp
      : Boolean(categoryLoading[DATASTORE_CATEGORIES.INCIDENTS]);

  const vulnSeverityCounts = vulnSeverityCountsProp ?? fetchedVulns;
  const vulnLoading = vulnLoadingProp !== undefined ? vulnLoadingProp : fetchedVulnsLoading;

  // Fetch required datastore categories
  useEffect(() => {
    if (serverside || !isLoaded || !requiredCategories.length) return;
    let cancelled = false;

    requiredCategories.forEach((cat) => {
      setCategoryLoading((prev) => ({ ...prev, [cat]: true }));
      (async () => {
        try {
          const resp = await getDatastoreByCategory(cat, undefined, 200, orgId || undefined);
          if (cancelled) return;
          if (resp.success && Array.isArray(resp.data)) {
            const parsed = resp.data.map(parseDatastoreRecord);
            setCategoryData((prev) => ({ ...prev, [cat]: parsed }));
          } else {
            setCategoryData((prev) => ({ ...prev, [cat]: [] }));
          }
        } catch {
          if (!cancelled) {
            setCategoryData((prev) => ({ ...prev, [cat]: [] }));
          }
        } finally {
          if (!cancelled) {
            setCategoryLoading((prev) => ({ ...prev, [cat]: false }));
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [requiredCategories, orgId, isLoaded, serverside, refreshKey]);

  // Discover all available custom stat keys from `/api/v1/orgs/{orgId}/stats`
  const availableStatKeys = useMemo(() => {
    if (!stats || typeof stats !== 'object') return [] as string[];
    const map = new Map<string, string>();
    Object.keys(stats)
      .filter((k) => typeof k === 'string' && k.startsWith('total_'))
      .forEach((k) => {
        const canon = k.slice(6);
        if (canon && !map.has(canon)) map.set(canon, k);
      });
    const addAddition = (k?: unknown) => {
      if (typeof k !== 'string' || !k) return;
      const canon = k.startsWith('total_') ? k.slice(6) : k;
      if (canon && !map.has(canon)) map.set(canon, k);
    };
    if (Array.isArray(stats.additions)) {
      stats.additions.forEach((a) => addAddition(a?.key));
    }
    if (Array.isArray(stats.daily_statistics)) {
      stats.daily_statistics.forEach((d) => {
        if (Array.isArray(d?.additions)) {
          d.additions.forEach((a) => addAddition(a?.key));
        }
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      prettyStatLabel(a).localeCompare(prettyStatLabel(b)),
    );
  }, [stats]);

  const safeDays = Math.max(1, parseInt(String(days ?? 30), 10) || 30);

  // Compute time buckets
  const buckets: TimeBucket[] = useMemo(
    () =>
      customRange
        ? buildBucketsBetween(customRange.fromMs, customRange.toMs, gran)
        : buildBuckets(safeDays, gran),
    [safeDays, gran, customRange],
  );

  const filteredDailyStats = useMemo(() => {
    const daily = Array.isArray(stats?.daily_statistics) ? stats.daily_statistics : [];
    const start = buckets[0]?.startMs ?? Date.now() - safeDays * 86400_000;
    const end = buckets[buckets.length - 1]?.endMs ?? Date.now();
    return daily
      .filter((d) => {
        if (!d?.date) return false;
        const ms = new Date(d.date).getTime();
        return Number.isFinite(ms) && ms >= start && ms < end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [stats, buckets, safeDays]);

  const drag = useChartRangeDrag(buckets, isEditing ? undefined : onRangeSelect);

  // Resolve data for a single widget
  const resolveWidgetData = useCallback(
    (widget: CustomDashboardWidget): ResolvedWidgetData => {
      const accentHex = NEON[widget?.accentColor || 'violet'] || NEON.violet;
      const ds = widget?.dataSource || { kind: 'builtin' as const, builtinId: 'open_incidents' as const };

      if (ds.kind === 'builtin') {
        const id = ds.builtinId;

        if (
          id === 'open_incidents' ||
          id === 'critical_high_incidents' ||
          id === 'resolved_incidents' ||
          id === 'incident_activity'
        ) {
          const matchingIncidents = incidents.filter((inc) => {
            const st = (inc.status || '').toLowerCase();
            const sev = (inc.severity || '').toLowerCase();
            if (id === 'open_incidents') return st !== 'resolved' && st !== 'closed';
            if (id === 'critical_high_incidents') {
              return (sev === 'critical' || sev === 'high') && st !== 'resolved' && st !== 'closed';
            }
            if (id === 'resolved_incidents') return st === 'resolved' || st === 'closed';
            return true;
          });

          const bucketCounts = new Array(buckets.length).fill(0);
          const resolvedCounts = new Array(buckets.length).fill(0);
          const openCounts = new Array(buckets.length).fill(0);

          for (const inc of matchingIncidents) {
            if (!inc.createdTs) continue;
            const idx = bucketIndexOf(buckets, inc.createdTs);
            if (idx >= 0) {
              bucketCounts[idx]++;
              const st = (inc.status || '').toLowerCase();
              if (st === 'resolved' || st === 'closed') resolvedCounts[idx]++;
              else openCounts[idx]++;
            }
          }

          if (id === 'incident_activity') {
            const timeSeries = buckets.map((b, i) => ({
              date: b.label,
              open: openCounts[i],
              resolved: resolvedCounts[i],
              value: bucketCounts[i],
            }));
            const breakdown = [
              {
                label: 'Open',
                count: openCounts.reduce((a, b) => a + b, 0),
                color: NEON.magenta,
              },
              {
                label: 'Resolved',
                count: resolvedCounts.reduce((a, b) => a + b, 0),
                color: NEON.green,
              },
            ];
            return {
              loading: incidentsLoading,
              kpiValue: formatCompact(matchingIncidents.length),
              spark: bucketCounts.slice(-14),
              timeSeries,
              seriesKeys: [
                { key: 'open', label: 'Open', color: NEON.magenta },
                { key: 'resolved', label: 'Resolved', color: NEON.green },
              ],
              breakdown,
            };
          }

          const sevMap = new Map<string, number>();
          for (const inc of matchingIncidents) {
            const s = (inc.severity || 'unspecified').toLowerCase();
            sevMap.set(s, (sevMap.get(s) || 0) + 1);
          }
          const breakdown = Array.from(sevMap.entries())
            .map(([label, count], idx) => ({
              label: label.charAt(0).toUpperCase() + label.slice(1),
              count,
              color: SEVERITY_COLOR_MAP[label] || SERIES_COLORS[idx % SERIES_COLORS.length],
            }))
            .sort((a, b) => b.count - a.count);

          return {
            loading: incidentsLoading,
            kpiValue: formatCompact(matchingIncidents.length),
            spark: bucketCounts.slice(-14),
            timeSeries: buckets.map((b, i) => ({ date: b.label, value: bucketCounts[i] })),
            seriesKeys: [{ key: 'value', label: widget.title, color: accentHex }],
            breakdown,
          };
        }

        if (
          id === 'critical_high_vulns' ||
          id === 'total_vulns' ||
          id === 'vulnerability_severity'
        ) {
          const critHigh = (vulnSeverityCounts.critical || 0) + (vulnSeverityCounts.high || 0);
          const totalVulns =
            critHigh +
            (vulnSeverityCounts.medium || 0) +
            (vulnSeverityCounts.low || 0) +
            (vulnSeverityCounts.info || 0);
          const kpiVal = id === 'critical_high_vulns' ? critHigh : totalVulns;
          const breakdown = [
            { label: 'Critical', count: vulnSeverityCounts.critical || 0, color: NEON.red },
            { label: 'High', count: vulnSeverityCounts.high || 0, color: NEON.orange },
            { label: 'Medium', count: vulnSeverityCounts.medium || 0, color: NEON.amber },
            { label: 'Low', count: vulnSeverityCounts.low || 0, color: NEON.cyan },
            { label: 'Info', count: vulnSeverityCounts.info || 0, color: NEON.violet },
          ].filter((row) => row.count > 0 || id === 'vulnerability_severity');

          return {
            loading: vulnLoading,
            kpiValue: formatCompact(kpiVal),
            spark: breakdown.map((b) => b.count),
            timeSeries: breakdown.map((b) => ({ date: b.label, value: b.count })),
            seriesKeys: [{ key: 'value', label: 'Vulnerabilities', color: accentHex }],
            breakdown,
          };
        }

        // Automation built-in metrics
        const bucketStat = (statKeyName: string): number[] => {
          const arr = new Array(buckets.length).fill(0);
          for (const d of filteredDailyStats) {
            const idx = bucketIndexOf(buckets, new Date(d.date).getTime());
            if (idx >= 0) arr[idx] += valueForStat(d, statKeyName);
          }
          return arr;
        };

        if (id === 'workflow_activity') {
          const s = bucketStat('workflow_executions_finished');
          const f = bucketStat('workflow_executions_failed');
          const totalS = s.reduce((a, b) => a + b, 0);
          const totalF = f.reduce((a, b) => a + b, 0);
          return {
            loading: statsLoading,
            kpiValue: formatCompact(totalS + totalF),
            spark: s.slice(-14),
            timeSeries: buckets.map((b, i) => ({
              date: b.label,
              success: s[i],
              failed: f[i],
              value: s[i] + f[i],
            })),
            seriesKeys: [
              { key: 'success', label: 'Success', color: NEON.green },
              { key: 'failed', label: 'Failed', color: NEON.red },
            ],
            breakdown: [
              { label: 'Successful Runs', count: totalS, color: NEON.green },
              { label: 'Failed Runs', count: totalF, color: NEON.red },
            ],
          };
        }

        const fieldMap: Record<string, string> = {
          workflow_runs_success: 'workflow_executions_finished',
          workflow_runs_failed: 'workflow_executions_failed',
          app_runs_success: 'app_executions',
          hours_saved: 'app_executions',
        };
        const targetField = fieldMap[id] || 'workflow_executions_finished';
        const series = bucketStat(targetField);
        const scaledSeries =
          id === 'hours_saved'
            ? series.map((v) => Math.round((v * minutesSavedPerAppRun) / 60))
            : series;
        const sum = scaledSeries.reduce((a, b) => a + b, 0);

        return {
          loading: statsLoading,
          kpiValue: id === 'hours_saved' ? `${formatCompact(sum)}h` : formatCompact(sum),
          spark: scaledSeries.slice(-14),
          timeSeries: buckets.map((b, i) => ({ date: b.label, value: scaledSeries[i] })),
          seriesKeys: [{ key: 'value', label: widget.title, color: accentHex }],
          breakdown: [{ label: widget.title, count: sum, color: accentHex }],
        };
      }

      if (ds.kind === 'custom_stat') {
        const allKeys = [ds.statKey, ...(ds.additionalStatKeys || [])].filter(Boolean);
        const seriesByKey: Record<string, number[]> = {};
        for (const k of allKeys) {
          const arr = new Array(buckets.length).fill(0);
          for (const d of filteredDailyStats) {
            const idx = bucketIndexOf(buckets, new Date(d.date).getTime());
            if (idx >= 0) arr[idx] += valueForStat(d, k);
          }
          seriesByKey[k] = arr;
        }

        const primarySeries = seriesByKey[ds.statKey] || new Array(buckets.length).fill(0);
        const primaryTotal = primarySeries.reduce((a, b) => a + b, 0);

        const timeSeries = buckets.map((b, i) => {
          const row: Record<string, any> = { date: b.label, value: primarySeries[i] };
          allKeys.forEach((k) => {
            row[k] = seriesByKey[k]?.[i] || 0;
          });
          return row;
        });

        const seriesKeys =
          allKeys.length > 1
            ? allKeys.map((k, idx) => ({
                key: k,
                label: prettyStatLabel(k),
                color: idx === 0 ? accentHex : SERIES_COLORS[(idx + 1) % SERIES_COLORS.length],
              }))
            : [{ key: 'value', label: prettyStatLabel(ds.statKey), color: accentHex }];

        const breakdown = allKeys.map((k, idx) => ({
          label: prettyStatLabel(k),
          count: (seriesByKey[k] || []).reduce((a, b) => a + b, 0),
          color: idx === 0 ? accentHex : SERIES_COLORS[(idx + 1) % SERIES_COLORS.length],
        }));

        return {
          loading: statsLoading,
          kpiValue: formatCompact(primaryTotal),
          spark: primarySeries.slice(-14),
          timeSeries,
          seriesKeys,
          breakdown,
        };
      }

      // ds.kind === 'datastore_category'
      const cat = (ds.category || '').trim();
      const isLoadingCat = Boolean(categoryLoading[cat]);
      let records = categoryData[cat] || [];

      // Fallback if incidents category hasn't finished or returned empty in guest mode
      if (cat === DATASTORE_CATEGORIES.INCIDENTS && records.length === 0 && incidents.length > 0) {
        records = incidents.map((inc) => ({
          status: inc.status,
          severity: inc.severity,
          created_at: inc.createdTs,
        }));
      }

      if (ds.filterField && ds.filterValue) {
        const targetVal = ds.filterValue.trim().toLowerCase();
        records = records.filter(
          (r) => extractField(r, ds.filterField).trim().toLowerCase() === targetVal,
        );
      }

      // Build time-series if records have a timestamp field
      const bucketCounts = new Array(buckets.length).fill(0);
      let hasTimestamps = false;
      for (const r of records) {
        const rawTs =
          r.created_at ?? r.createdTs ?? r.created ?? r.timestamp ?? r.updated_at ?? r.time;
        const num = typeof rawTs === 'number' ? rawTs : Date.parse(String(rawTs || ''));
        if (Number.isFinite(num) && num > 0) {
          const ms = num < 1e12 ? num * 1000 : num;
          const idx = bucketIndexOf(buckets, ms);
          if (idx >= 0) {
            bucketCounts[idx]++;
            hasTimestamps = true;
          }
        }
      }

      if (ds.aggregation === 'group_by' && ds.groupByField) {
        const counts = new Map<string, number>();
        for (const r of records) {
          const val = extractField(r, ds.groupByField);
          counts.set(val, (counts.get(val) || 0) + 1);
        }
        const breakdown = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([label, count], idx) => {
            const lower = label.toLowerCase();
            const color =
              SEVERITY_COLOR_MAP[lower] ||
              (idx === 0 ? accentHex : SERIES_COLORS[idx % SERIES_COLORS.length]);
            return { label, count, color };
          });

        return {
          loading: isLoadingCat,
          kpiValue: formatCompact(records.length),
          spark: breakdown.map((b) => b.count),
          timeSeries: breakdown.map((b) => ({ date: b.label, value: b.count })),
          seriesKeys: [{ key: 'value', label: ds.groupByField, color: accentHex }],
          breakdown,
        };
      }

      return {
        loading: isLoadingCat,
        kpiValue: formatCompact(records.length),
        spark: hasTimestamps ? bucketCounts.slice(-14) : [],
        timeSeries: hasTimestamps
          ? buckets.map((b, i) => ({ date: b.label, value: bucketCounts[i] }))
          : [{ date: 'Total', value: records.length }],
        seriesKeys: [{ key: 'value', label: widget.title, color: accentHex }],
        breakdown: [{ label: widget.title, count: records.length, color: accentHex }],
      };
    },
    [
      incidents,
      incidentsLoading,
      vulnSeverityCounts,
      vulnLoading,
      buckets,
      filteredDailyStats,
      statsLoading,
      minutesSavedPerAppRun,
      categoryData,
      categoryLoading,
    ],
  );

  // Optimistic local widget state so drag-drop and edge-resizing commit with 0ms frame latency
  const [optimisticWidgets, setOptimisticWidgets] = useState<CustomDashboardWidget[]>(
    () => dashboard.widgets,
  );
  useEffect(() => {
    setOptimisticWidgets(dashboard.widgets);
  }, [dashboard.widgets]);

  const commitWidgets = useCallback(
    async (nextWidgets: CustomDashboardWidget[]) => {
      setOptimisticWidgets(nextWidgets);
      await onUpdateDashboard({
        ...dashboard,
        updatedAt: Date.now(),
        widgets: nextWidgets,
      });
    },
    [dashboard, onUpdateDashboard],
  );

  // Widget mutation handlers
  const handleSaveWidget = async (widget: CustomDashboardWidget) => {
    const exists = optimisticWidgets.some((w) => w.id === widget.id);
    const nextWidgets = exists
      ? optimisticWidgets.map((w) => (w.id === widget.id ? widget : w))
      : [...optimisticWidgets, widget];
    setEditingWidget(null);
    await commitWidgets(nextWidgets);
  };

  const handleRemoveWidget = async (widgetId: string) => {
    await commitWidgets(optimisticWidgets.filter((w) => w.id !== widgetId));
  };

  const handleSpanChange = async (widgetId: string, nextSpan: WidgetSpan) => {
    await commitWidgets(
      optimisticWidgets.map((w) => (w.id === widgetId ? { ...w, span: nextSpan } : w)),
    );
  };

  // Allowed 12-column spans for edge-resize snapping and quick cycling
  const SNAP_SPANS: WidgetSpan[] = useMemo(
    () => WIDGET_SPAN_OPTIONS.map((o) => o.value),
    [],
  );

  const formatSpanShortLabel = (span: WidgetSpan): string => {
    if (span === 3) return '1/4';
    if (span === 4) return '1/3';
    if (span === 6) return '1/2';
    if (span === 8) return '2/3';
    return 'Full';
  };

  // Magnetic snapping with hysteresis so the span doesn't jitter on boundary midpoints
  const snapToSpanWithHysteresis = useCallback(
    (rawCols: number, currentSpan: WidgetSpan): WidgetSpan => {
      let best: WidgetSpan = currentSpan;
      let bestScore = Math.abs(rawCols - currentSpan) - 0.32; // magnetic pull toward current span
      for (const candidate of SNAP_SPANS) {
        const dist = Math.abs(rawCols - candidate);
        if (dist < bestScore) {
          bestScore = dist;
          best = candidate;
        }
      }
      return best;
    },
    [SNAP_SPANS],
  );

  const handleCycleSpan = async (widget: CustomDashboardWidget) => {
    const idx = SNAP_SPANS.indexOf(widget.span);
    const nextSpan = SNAP_SPANS[(idx + 1) % SNAP_SPANS.length] || 6;
    await handleSpanChange(widget.id, nextSpan);
  };

  // Refs & state for Edit Mode drag-and-drop reordering and edge resizing
  const gridRef = useRef<HTMLDivElement | null>(null);
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const floatingCardRef = useRef<HTMLDivElement | null>(null);
  const resizeContinuousBarRef = useRef<HTMLDivElement | null>(null);
  const resizeColsLabelRef = useRef<HTMLSpanElement | null>(null);

  const [activeDrag, setActiveDrag] = useState<{
    widgetId: string;
    initialWidth: number;
    initialHeight: number;
    grabOffsetX: number;
    grabOffsetY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);

  const [resizingState, setResizingState] = useState<{
    widgetId: string;
    edge: 'left' | 'right' | 'corner';
    span: WidgetSpan;
  } | null>(null);

  // Clear any active drag/resize state when leaving Edit Mode
  useEffect(() => {
    if (!isEditing) {
      setActiveDrag(null);
      setPreviewOrder(null);
      setResizingState(null);
    }
  }, [isEditing]);

  // Live-ordered widgets list (uses `previewOrder` while dragging so the grid reflows live)
  const displayedWidgets = useMemo(() => {
    if (!previewOrder || !activeDrag) return optimisticWidgets;
    const byId = new Map(optimisticWidgets.map((w) => [w.id, w]));
    const ordered: CustomDashboardWidget[] = [];
    for (const id of previewOrder) {
      const found = byId.get(id);
      if (found) {
        ordered.push(found);
        byId.delete(id);
      }
    }
    byId.forEach((w) => ordered.push(w));
    return ordered;
  }, [optimisticWidgets, previewOrder, activeDrag]);

  const startEdgeResize = (
    e: React.PointerEvent<HTMLElement>,
    widget: CustomDashboardWidget,
    edge: 'left' | 'right' | 'corner',
  ) => {
    if (!isEditing) return;
    e.stopPropagation();
    e.preventDefault();

    const gridEl = gridRef.current;
    const widgetEl = widgetRefs.current[widget.id];
    if (!gridEl || !widgetEl) return;

    const gridRect = gridEl.getBoundingClientRect();
    const initialRect = widgetEl.getBoundingClientRect();
    const gridWidth = Math.max(240, gridRect.width);
    const startX = e.clientX;
    let latestSpan: WidgetSpan = widget.span;
    let rafId: number | null = null;

    setResizingState({ widgetId: widget.id, edge, span: widget.span });

    const updateContinuousHud = (rawCols: number, snapped: WidgetSpan) => {
      const clampedCols = Math.max(2.2, Math.min(12, rawCols));
      const pct = Math.max(8, Math.min(100, (clampedCols / 12) * 100));
      if (resizeContinuousBarRef.current) {
        resizeContinuousBarRef.current.style.width = `${pct}%`;
      }
      if (resizeColsLabelRef.current) {
        resizeColsLabelRef.current.textContent = `${formatSpanShortLabel(snapped)} (${snapped}/12 cols)`;
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      // Delta-based width calculation is immune to CSS Grid row-wrapping jumps during resize
      const deltaPx = edge === 'left' ? startX - ev.clientX : ev.clientX - startX;
      const desiredWidthPx = Math.max(72, initialRect.width + deltaPx);
      const rawCols = (desiredWidthPx / gridWidth) * 12;
      const snapped = snapToSpanWithHysteresis(rawCols, latestSpan);

      updateContinuousHud(rawCols, snapped);

      if (snapped !== latestSpan) {
        latestSpan = snapped;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          setResizingState({ widgetId: widget.id, edge, span: latestSpan });
        });
      }
    };

    const onPointerUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      setResizingState(null);
      if (latestSpan !== widget.span) {
        void handleSpanChange(widget.id, latestSpan);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const startWidgetDrag = (
    e: React.PointerEvent<HTMLElement>,
    widget: CustomDashboardWidget,
  ) => {
    if (!isEditing) return;
    if (e.button !== 0) return;

    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('button, [data-no-widget-drag="true"]')) {
      return;
    }

    const widgetEl = widgetRefs.current[widget.id];
    if (!widgetEl) return;

    const initialRect = widgetEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const grabOffsetX = startX - initialRect.left;
    const grabOffsetY = startY - initialRect.top;

    let isDraggingNow = false;
    let currentOrder = optimisticWidgets.map((w) => w.id);
    let lastSwapTs = 0;

    const computeNextOrderAt = (cx: number, cy: number, order: string[]): string[] | null => {
      // Anti-oscillation guard: if the cursor is currently inside the dragged widget's
      // own placeholder cell, keep the current order so mixed-width swaps never flicker.
      const ownEl = widgetRefs.current[widget.id];
      if (ownEl) {
        const ownRect = ownEl.getBoundingClientRect();
        if (
          cx >= ownRect.left - 6 &&
          cx <= ownRect.right + 6 &&
          cy >= ownRect.top - 6 &&
          cy <= ownRect.bottom + 6
        ) {
          return null;
        }
      }

      const draggedIdx = order.indexOf(widget.id);
      if (draggedIdx < 0) return null;

      let bestTargetId: string | null = null;
      let bestSide: 'before' | 'after' = 'before';
      let bestScore = Infinity;

      for (const candidateId of order) {
        if (candidateId === widget.id) continue;
        const el = widgetRefs.current[candidateId];
        if (!el) continue;
        const rect = el.getBoundingClientRect();

        // Require cursor to enter 15% inside the target edge to prevent boundary jitter
        const insetX = Math.min(28, rect.width * 0.15);
        const insetY = Math.min(24, rect.height * 0.15);
        const insideX = cx >= rect.left + insetX && cx <= rect.right - insetX;
        const insideY = cy >= rect.top + insetY && cy <= rect.bottom - insetY;

        const targetIdx = order.indexOf(candidateId);
        // When moving forward in the grid, insert 'after' the target; when moving backward, insert 'before'
        const naturalSide: 'before' | 'after' =
          cx < rect.left + rect.width * 0.45
            ? 'before'
            : cx > rect.left + rect.width * 0.55
              ? 'after'
              : draggedIdx < targetIdx
                ? 'after'
                : 'before';

        if (insideX && insideY) {
          bestTargetId = candidateId;
          bestSide = naturalSide;
          bestScore = 0;
          break;
        }

        const dx = cx < rect.left ? rect.left - cx : cx > rect.right ? cx - rect.right : 0;
        const dy = cy < rect.top ? rect.top - cy : cy > rect.bottom ? cy - rect.bottom : 0;
        const score = dx + dy * 2.5;
        if (score < bestScore && score < 90) {
          bestScore = score;
          bestTargetId = candidateId;
          bestSide = naturalSide;
        }
      }

      if (!bestTargetId) return null;

      const next = order.filter((id) => id !== widget.id);
      const targetIdx = next.indexOf(bestTargetId);
      if (targetIdx < 0) return null;

      const insertIdx = bestSide === 'before' ? targetIdx : targetIdx + 1;
      next.splice(insertIdx, 0, widget.id);

      const unchanged =
        next.length === order.length && next.every((id, idx) => id === order[idx]);
      return unchanged ? null : next;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!isDraggingNow && dist < 4) return;

      const nextX = ev.clientX - grabOffsetX;
      const nextY = ev.clientY - grabOffsetY;

      if (!isDraggingNow) {
        isDraggingNow = true;
        setPreviewOrder(currentOrder);
        setActiveDrag({
          widgetId: widget.id,
          initialWidth: initialRect.width,
          initialHeight: initialRect.height,
          grabOffsetX,
          grabOffsetY,
          initialX: nextX,
          initialY: nextY,
        });
      }

      // Direct GPU transform update on the floating card — 0 React re-renders per mouse move
      if (floatingCardRef.current) {
        floatingCardRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) scale(1.015)`;
      }

      const now = performance.now();
      if (now - lastSwapTs < 65) return;

      const nextOrder = computeNextOrderAt(ev.clientX, ev.clientY, currentOrder);
      if (nextOrder) {
        currentOrder = nextOrder;
        lastSwapTs = now;
        setPreviewOrder(nextOrder);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      const finalOrder = isDraggingNow ? currentOrder : null;
      setActiveDrag(null);
      setPreviewOrder(null);

      if (!finalOrder) return;

      const originalIds = optimisticWidgets.map((w) => w.id);
      const changed =
        finalOrder.length === originalIds.length &&
        finalOrder.some((id, idx) => id !== originalIds[idx]);

      if (changed) {
        const byId = new Map(optimisticWidgets.map((w) => [w.id, w]));
        const reordered = finalOrder
          .map((id) => byId.get(id))
          .filter((w): w is CustomDashboardWidget => Boolean(w));
        void commitWidgets(reordered);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleRenameDashboard = async ({
    name,
    description,
  }: {
    name: string;
    description?: string;
  }) => {
    await onUpdateDashboard({
      ...dashboard,
      name,
      description,
      updatedAt: Date.now(),
    });
  };

  const renderWidgetBody = (widget: CustomDashboardWidget) => {
    const accentHex = NEON[widget.accentColor || 'violet'] || NEON.violet;
    const resolved = resolveWidgetData(widget);

    if (widget.visualization === 'kpi') {
      return (
        <KpiTile
          glow={accentHex}
          value={resolved.kpiValue}
          label={widget.title}
          spark={resolved.spark}
          isLoading={resolved.loading}
        />
      );
    }

    return (
      <Panel
        title={widget.title}
        action={
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: accentHex,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {resolved.kpiValue}
          </Typography>
        }
      >
        {resolved.loading ? (
          <Skeleton
            variant="rounded"
            height={210}
            sx={{ borderRadius: 1.5, bgcolor: 'hsl(var(--muted) / 0.3)' }}
          />
        ) : widget.visualization === 'bar' ? (
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={resolved.timeSeries}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                {...drag.chartProps}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border) / 0.5)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<TooltipContent />} />
                {resolved.seriesKeys.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive={!isEditing}
                  />
                ))}
                {drag.refArea && (
                  <ReferenceArea
                    x1={drag.refArea.x1}
                    x2={drag.refArea.x2}
                    strokeOpacity={0.3}
                    fill={accentHex}
                    fillOpacity={0.15}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : widget.visualization === 'area' ? (
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={resolved.timeSeries}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                {...drag.chartProps}
              >
                <defs>
                  {resolved.seriesKeys.map((s) => (
                    <linearGradient
                      key={s.key}
                      id={`grad-${widget.id}-${s.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border) / 0.5)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<TooltipContent />} />
                {resolved.seriesKeys.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#grad-${widget.id}-${s.key})`}
                    isAnimationActive={!isEditing}
                  />
                ))}
                {drag.refArea && (
                  <ReferenceArea
                    x1={drag.refArea.x1}
                    x2={drag.refArea.x2}
                    strokeOpacity={0.3}
                    fill={accentHex}
                    fillOpacity={0.15}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        ) : widget.visualization === 'horizontal_bar' ? (
          resolved.breakdown.length === 0 ? (
            <EmptyState text="No matching records for this breakdown." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, my: 'auto', py: 0.5 }}>
              {(() => {
                const maxCount = Math.max(1, ...resolved.breakdown.map((b) => b.count));
                const totalCount = Math.max(
                  1,
                  resolved.breakdown.reduce((acc, b) => acc + b.count, 0),
                );
                return resolved.breakdown.map((row) => {
                  const pct = Math.round((row.count / totalCount) * 100);
                  const barWidth = Math.max(3, Math.round((row.count / maxCount) * 100));
                  return (
                    <Box key={row.label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color: 'hsl(var(--foreground))',
                          }}
                        >
                          {row.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.72rem',
                            color: 'hsl(var(--muted-foreground))',
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {row.count} ({pct}%)
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: '100%',
                          height: 6,
                          borderRadius: 1,
                          bgcolor: 'hsl(var(--muted) / 0.45)',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            width: `${barWidth}%`,
                            height: '100%',
                            borderRadius: 1,
                            bgcolor: row.color,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </Box>
                    </Box>
                  );
                });
              })()}
            </Box>
          )
        ) : (
          // radial
          resolved.breakdown.length === 0 ? (
            <EmptyState text="No matching records for this distribution." />
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' },
                alignItems: 'center',
                gap: 2,
                height: 210,
              }}
            >
              <Box sx={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="32%"
                    outerRadius="95%"
                    data={resolved.breakdown.map((b) => ({
                      name: b.label,
                      value: b.count,
                      fill: b.color,
                    }))}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <PolarAngleAxis
                      type="number"
                      domain={[
                        0,
                        Math.max(1, ...resolved.breakdown.map((b) => b.count)),
                      ]}
                      angleAxisId={0}
                      tick={false}
                    />
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={4}
                      isAnimationActive={!isEditing}
                    >
                      {resolved.breakdown.map((b, idx) => (
                        <Cell key={idx} fill={b.color} />
                      ))}
                    </RadialBar>
                    <RechartsTooltip content={<TooltipContent />} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {resolved.breakdown.slice(0, 6).map((b) => (
                  <Box
                    key={b.label}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: b.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        noWrap
                        sx={{ fontSize: '0.74rem', color: 'hsl(var(--foreground))' }}
                      >
                        {b.label}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        fontFamily: 'ui-monospace, monospace',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {b.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )
        )}
      </Panel>
    );
  };

  const controlButtonSx = {
    height: 32,
    px: 1.5,
    borderRadius: 1.5,
    fontSize: '0.76rem',
    fontWeight: 500,
    textTransform: 'none' as const,
    border: '1px solid hsl(var(--border))',
    color: 'hsl(var(--foreground))',
    bgcolor: 'transparent',
    '&:hover': {
      bgcolor: 'hsl(var(--muted) / 0.4)',
      borderColor: 'hsl(var(--border))',
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Custom Dashboard Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card) / 0.45)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography
              sx={{
                fontSize: '0.92rem',
                fontWeight: 600,
                color: 'hsl(var(--foreground))',
              }}
            >
              {dashboard.name}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.72rem',
                color: 'hsl(var(--muted-foreground))',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {dashboard.widgets.length} {dashboard.widgets.length === 1 ? 'widget' : 'widgets'}
            </Typography>
          </Box>
          {dashboard.description && (
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: 'hsl(var(--muted-foreground))',
                mt: 0.25,
              }}
            >
              {dashboard.description}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            onClick={() => {
              setEditingWidget(null);
              setWidgetDialogOpen(true);
            }}
            sx={{
              ...controlButtonSx,
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              borderColor: 'hsl(var(--primary))',
              fontWeight: 600,
              '&:hover': {
                bgcolor: 'hsl(var(--primary) / 0.9)',
                borderColor: 'hsl(var(--primary))',
              },
            }}
          >
            Add widget
          </Button>
          <Button
            size="small"
            onClick={() => setIsEditing((prev) => !prev)}
            sx={{
              ...controlButtonSx,
              ...(isEditing
                ? {
                    borderColor: NEON.cyan,
                    color: NEON.cyan,
                    bgcolor: `${NEON.cyan}14`,
                  }
                : {}),
            }}
          >
            {isEditing ? 'Done editing' : 'Edit layout'}
          </Button>
          <Button size="small" onClick={() => setJsonDialogOpen(true)} sx={controlButtonSx}>
            JSON config
          </Button>
          <Button size="small" onClick={() => setRenameDialogOpen(true)} sx={controlButtonSx}>
            Rename
          </Button>
          {onDeleteDashboard && (
            <Button
              size="small"
              onClick={() => setDeleteConfirmOpen(true)}
              sx={{
                ...controlButtonSx,
                color: NEON.red,
                '&:hover': {
                  bgcolor: `${NEON.red}14`,
                  borderColor: `${NEON.red}66`,
                },
              }}
            >
              Delete
            </Button>
          )}
        </Box>
      </Box>

      {isEditing && dashboard.widgets.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            px: 1.75,
            py: 0.85,
            borderRadius: 1.5,
            border: `1px dashed ${NEON.cyan}66`,
            bgcolor: `${NEON.cyan}0D`,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: 'hsl(var(--foreground))',
              fontWeight: 500,
            }}
          >
            Layout edit mode: Drag any widget card to reorder. Hover and drag a widget's left or right edge to resize (1/4, 1/3, 1/2, 2/3, Full).
          </Typography>
        </Box>
      )}

      {/* 12-Column Widget Grid */}
      {dashboard.widgets.length === 0 ? (
        <Panel title="Empty Custom Dashboard">
          <EmptyState
            text="This custom dashboard has no widgets yet. Add a Built-in metric, an Organization Custom Stat, or a Datastore Category chart."
            ctaLabel="Add first widget"
            onCta={() => {
              setEditingWidget(null);
              setWidgetDialogOpen(true);
            }}
          />
        </Panel>
      ) : (
        <Box
          ref={gridRef}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' },
            gap: 1.5,
            userSelect: isEditing ? 'none' : 'auto',
          }}
        >
          {dashboard.widgets.map((widget) => {
            const isBeingDragged = dragState?.widgetId === widget.id;
            const isBeingResized = resizingState?.widgetId === widget.id;
            const effectiveSpan: WidgetSpan = isBeingResized
              ? resizingState.span
              : widget.span;
            const isDropTarget =
              Boolean(dragState) &&
              dropTarget?.widgetId === widget.id &&
              dragState?.widgetId !== widget.id;
            const dropSide = isDropTarget ? dropTarget?.side : null;

            return (
              <Box
                key={widget.id}
                ref={(el: HTMLDivElement | null) => {
                  widgetRefs.current[widget.id] = el;
                }}
                onPointerDown={(e) => startWidgetDrag(e, widget)}
                sx={{
                  position: 'relative',
                  gridColumn: { xs: 'span 12', md: `span ${effectiveSpan}` },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  minWidth: 0,
                  cursor: isEditing
                    ? isBeingDragged
                      ? 'grabbing'
                      : 'grab'
                    : 'default',
                  opacity: isBeingDragged ? 0.45 : 1,
                  borderRadius: 2,
                  outline: isEditing
                    ? isBeingResized || isDropTarget
                      ? `1.5px solid ${NEON.cyan}`
                      : `1px dashed ${NEON.cyan}55`
                    : 'none',
                  outlineOffset: isEditing ? 2 : 0,
                  transition: isBeingResized
                    ? 'none'
                    : 'opacity 0.15s ease, outline-color 0.15s ease',
                  '&:hover .widget-edge-pill': {
                    opacity: 0.9,
                    bgcolor: NEON.cyan,
                  },
                }}
              >
                {/* Drop target indicator line (before / after) */}
                {dropSide && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -4,
                      bottom: -4,
                      width: 4,
                      borderRadius: 999,
                      bgcolor: NEON.cyan,
                      boxShadow: `0 0 12px ${NEON.cyan}`,
                      zIndex: 30,
                      pointerEvents: 'none',
                      ...(dropSide === 'before' ? { left: -8 } : { right: -8 }),
                    }}
                  />
                )}

                {/* Left & Right Edge-Hover Resize Handles */}
                {isEditing && (
                  <>
                    <Box
                      data-no-widget-drag="true"
                      title="Drag left edge to resize widget width"
                      onPointerDown={(e) => startEdgeResize(e, widget, 'left')}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: -6,
                        width: 14,
                        cursor: 'col-resize',
                        zIndex: 25,
                        display: { xs: 'none', md: 'flex' },
                        alignItems: 'center',
                        justifyContent: 'center',
                        '&:hover .widget-edge-pill': {
                          height: 56,
                          bgcolor: NEON.cyan,
                          boxShadow: `0 0 10px ${NEON.cyan}`,
                          opacity: 1,
                        },
                      }}
                    >
                      <Box
                        className="widget-edge-pill"
                        sx={{
                          width: 4,
                          height:
                            isBeingResized && resizingState?.edge === 'left' ? 56 : 34,
                          borderRadius: 999,
                          bgcolor:
                            isBeingResized && resizingState?.edge === 'left'
                              ? NEON.cyan
                              : 'hsl(var(--muted-foreground))',
                          opacity:
                            isBeingResized && resizingState?.edge === 'left' ? 1 : 0.35,
                          transition: 'all 0.15s ease',
                        }}
                      />
                    </Box>

                    <Box
                      data-no-widget-drag="true"
                      title="Drag right edge to resize widget width"
                      onPointerDown={(e) => startEdgeResize(e, widget, 'right')}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: -6,
                        width: 14,
                        cursor: 'col-resize',
                        zIndex: 25,
                        display: { xs: 'none', md: 'flex' },
                        alignItems: 'center',
                        justifyContent: 'center',
                        '&:hover .widget-edge-pill': {
                          height: 56,
                          bgcolor: NEON.cyan,
                          boxShadow: `0 0 10px ${NEON.cyan}`,
                          opacity: 1,
                        },
                      }}
                    >
                      <Box
                        className="widget-edge-pill"
                        sx={{
                          width: 4,
                          height:
                            isBeingResized && resizingState?.edge === 'right' ? 56 : 34,
                          borderRadius: 999,
                          bgcolor:
                            isBeingResized && resizingState?.edge === 'right'
                              ? NEON.cyan
                              : 'hsl(var(--muted-foreground))',
                          opacity:
                            isBeingResized && resizingState?.edge === 'right' ? 1 : 0.35,
                          transition: 'all 0.15s ease',
                        }}
                      />
                    </Box>
                  </>
                )}

                {/* Compact Non-Wrapping Edit Action Bar */}
                {isEditing && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'nowrap',
                      gap: 0.75,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1.5,
                      border: '1px solid hsl(var(--border))',
                      bgcolor: 'hsl(var(--card) / 0.88)',
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.6,
                        minWidth: 0,
                        flexShrink: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <Typography
                        noWrap
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: 'hsl(var(--muted-foreground))',
                          letterSpacing: '0.02em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Drag
                      </Typography>
                      <Box
                        component="button"
                        type="button"
                        title="Click to cycle width or drag left/right widget edges to resize"
                        onClick={() => void handleCycleSpan(widget)}
                        sx={{
                          height: 22,
                          px: 0.75,
                          borderRadius: 1,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          fontFamily: 'ui-monospace, monospace',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: 'pointer',
                          border: `1px solid ${NEON.cyan}66`,
                          bgcolor: `${NEON.cyan}1A`,
                          color: NEON.cyan,
                        }}
                      >
                        {formatSpanShortLabel(effectiveSpan)}
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      <Box
                        component="button"
                        type="button"
                        onClick={() => {
                          setEditingWidget(widget);
                          setWidgetDialogOpen(true);
                        }}
                        sx={{
                          height: 22,
                          px: 0.75,
                          borderRadius: 1,
                          fontSize: '0.68rem',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: 'pointer',
                          border: '1px solid hsl(var(--border))',
                          bgcolor: 'transparent',
                          color: 'hsl(var(--foreground))',
                          '&:hover': {
                            bgcolor: 'hsl(var(--muted) / 0.45)',
                          },
                        }}
                      >
                        Configure
                      </Box>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => void handleRemoveWidget(widget.id)}
                        sx={{
                          height: 22,
                          px: 0.75,
                          borderRadius: 1,
                          fontSize: '0.68rem',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: 'pointer',
                          border: `1px solid ${NEON.red}55`,
                          bgcolor: 'transparent',
                          color: NEON.red,
                          '&:hover': {
                            bgcolor: `${NEON.red}14`,
                          },
                        }}
                      >
                        Remove
                      </Box>
                    </Box>
                  </Box>
                )}

                <Box sx={{ flex: 1, minHeight: 0 }}>{renderWidgetBody(widget)}</Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Floating ghost badge while dragging a widget */}
      {dragState && (() => {
        const draggedWidget = dashboard.widgets.find((w) => w.id === dragState.widgetId);
        if (!draggedWidget) return null;
        return (
          <Box
            sx={{
              position: 'fixed',
              left: dragState.clientX + 14,
              top: dragState.clientY + 14,
              zIndex: 10060,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.65,
              borderRadius: 1.5,
              border: `1px solid ${NEON.cyan}`,
              bgcolor: 'hsl(var(--popover))',
              color: 'hsl(var(--popover-foreground))',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'hsl(var(--foreground))',
                whiteSpace: 'nowrap',
              }}
            >
              {draggedWidget.title}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.68rem',
                fontWeight: 700,
                fontFamily: 'ui-monospace, monospace',
                color: NEON.cyan,
                whiteSpace: 'nowrap',
              }}
            >
              {formatSpanShortLabel(draggedWidget.span)}
            </Typography>
          </Box>
        );
      })()}

      {/* Dialogs */}
      <WidgetEditorDialog
        open={widgetDialogOpen}
        onClose={() => {
          setWidgetDialogOpen(false);
          setEditingWidget(null);
        }}
        initialWidget={editingWidget}
        availableStatKeys={availableStatKeys}
        onSave={handleSaveWidget}
      />

      <DashboardJsonDialog
        open={jsonDialogOpen}
        onClose={() => setJsonDialogOpen(false)}
        config={dashboard}
        onApply={onUpdateDashboard}
      />

      <CreateDashboardDialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        mode="rename"
        initialName={dashboard.name}
        initialDescription={dashboard.description || ''}
        onSubmit={handleRenameDashboard}
      />

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>
          Delete Custom Dashboard
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.84rem', color: 'hsl(var(--muted-foreground))' }}>
            Are you sure you want to delete <strong>{dashboard.name}</strong>? This removes its
            configuration from the datastore.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            size="small"
            sx={{ height: 32, textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setDeleteConfirmOpen(false);
              if (onDeleteDashboard) {
                await onDeleteDashboard(dashboard.id);
              }
            }}
            variant="contained"
            size="small"
            sx={{
              height: 32,
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: NEON.red,
              '&:hover': { bgcolor: `${NEON.red}DD` },
            }}
          >
            Delete Dashboard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomDashboard;

