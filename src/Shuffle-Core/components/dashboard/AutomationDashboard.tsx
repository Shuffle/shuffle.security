/**
 * AutomationDashboard — Shuffle Automation analytics view.
 *
 * Fetches GET /api/v1/orgs/{orgId}/stats and renders:
 *   - Total errors / Errors resolved stat cards
 *   - Successful vs Failed Runs (Workflows) area chart
 *   - Workflow Success Rate radial gauges
 *   - Workflows per-month bar chart
 *
 * Standalone port (no host AuthContext / shadcn). Pass `orgId` + optional
 * `displayName`. API helpers come from `../../api` (Shuffle-Core).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Box, Typography, Skeleton, IconButton, Tooltip as MuiTooltip,
  Select, MenuItem, FormControl, InputLabel, Autocomplete, TextField,
} from '@mui/material';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, BarChart, Bar, RadialBarChart, RadialBar,
  PolarAngleAxis, Cell,
} from 'recharts';
import { AlertCircle, RefreshCw, Zap, Workflow, Activity, ExternalLink } from 'lucide-react';
import { SegmentedControl } from '../ui/segmented-control';
import { useWorkflows } from '../../hooks/useWorkflows';
import { getApiUrl, getAuthHeader, getShuffleCoreUrl, getShuffleCoreWorkflowUrl } from '../../api';
import { navigateToShuffleCore, isShuffleSecurityUrl } from '@/lib/authHandoff';
import { NEON, TooltipContent, KpiTile, Panel, EmptyState, buildBuckets, buildBucketsBetween, bucketIndexOf, useChartRangeDrag, ReferenceArea } from './_shared';
import { useSyncHostBaseUrl } from '../../useSyncHostBaseUrl';

import type { ShuffleCoreHostProps } from '../../types/host-props';

export interface AutomationDashboardProps extends ShuffleCoreHostProps {
  /** Organization id to fetch stats for. Falls back to `userdata.active_org.id`. */
  orgId?: string | null;
  /** Optional display name used in the greeting. Falls back to `userdata.username`. */
  displayName?: string;
  /** Optional content rendered on the left of the header row (e.g. dashboard tabs). */
  headerLeft?: React.ReactNode;
  /** Controlled time-range (in days). When provided, the internal "Last" filter is hidden — the parent owns it. */
  days?: string;
  /** Called when the user changes the time range. Required if `days` is controlled. */
  onDaysChange?: (days: string) => void;
  /** Controlled granularity (daily/monthly). When provided, the internal selector is hidden. */
  gran?: 'daily' | 'monthly';
  /** Called when the user changes granularity. Required if `gran` is controlled. */
  onGranChange?: (gran: 'daily' | 'monthly') => void;
  /** Controlled mode (workflows/apps). When provided, the internal toggle is hidden. */
  mode?: 'workflows' | 'apps';
  /** Called when the user changes the mode. Required if `mode` is controlled. */
  onModeChange?: (mode: 'workflows' | 'apps') => void;
  /** When this value changes, the dashboard re-fetches stats. Use to wire up an external refresh button. */
  refreshKey?: number;
  /** When provided, hides the internal refresh button (parent owns it). */
  hideRefresh?: boolean;
  /** Custom date range — when set, overrides `days` and is used for bucketing. */
  customRange?: { fromMs: number; toMs: number } | null;
  /** Called when the user click-drags on a chart to pick a range. */
  onRangeSelect?: (fromMs: number, toMs: number) => void;
}

/** Time-range options shared with parents that render the Last filter themselves. */
export const AUTOMATION_RANGE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
];

interface Addition { key: string; value: number }
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

type ModeKind = 'workflows' | 'apps';
type GranKind = 'daily' | 'monthly';

const RANGE_OPTIONS = AUTOMATION_RANGE_OPTIONS;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

/** Strip leading `total_`, replace underscores with spaces, sentence-case. */
const prettyStatLabel = (key: string): string => {
  let bare = key;
  if (bare.startsWith('total_')) bare = bare.slice(6);
  if (bare.toLowerCase().startsWith('categorylabel_')) bare = bare.slice('categorylabel_'.length);
  const spaced = bare.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

/** Compact number formatter (1.2k, 3.4M). */
const formatCompact = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
};

/** Magnitude-based color tier for custom-stat counts. */
const statColor = (n: number): string => {
  if (!n) return 'hsl(var(--muted-foreground))';
  if (n >= 1_000_000) return NEON.red;
  if (n >= 100_000) return NEON.amber;
  return NEON.green;
};

export const AutomationDashboard = ({
  orgId: orgIdProp,
  displayName,
  serverside,
  isLoaded = true,
  isLoggedIn = true,
  globalUrl,
  userdata,
  headerLeft,
  days: daysProp,
  onDaysChange,
  gran: granProp,
  onGranChange,
  mode: modeProp,
  onModeChange,
  refreshKey,
  hideRefresh,
  customRange,
  onRangeSelect,
}: AutomationDashboardProps) => {
  useSyncHostBaseUrl(globalUrl);
  const orgId = orgIdProp ?? userdata?.active_org?.id ?? null;
  const _name = (displayName || userdata?.username || '').split('@')[0] || 'there';

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [queuedAutomation, setQueuedAutomation] = useState<number>(0);
  const [queueLoading, setQueueLoading] = useState<boolean>(true);
  const [selectedStat, setSelectedStat] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('shuffle-automation-custom-stat') || ''; } catch { return ''; }
  });
  const pickSelectedStat = useCallback((key: string) => {
    setSelectedStat(key);
    try { localStorage.setItem('shuffle-automation-custom-stat', key); } catch {}
  }, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isDaysControlled = daysProp !== undefined;
  const [daysInternal, setDaysInternal] = useState<string>('30');
  const days = isDaysControlled ? (daysProp as string) : daysInternal;
  const setDays = (v: string) => {
    if (onDaysChange) onDaysChange(v);
    if (!isDaysControlled) setDaysInternal(v);
  };
  const isModeControlled = modeProp !== undefined;
  const [modeInternal, setModeInternal] = useState<ModeKind>('workflows');
  const { data: workflowList, isLoading: workflowsLoading } = useWorkflows();
  const workflowCount = Array.isArray(workflowList) ? workflowList.length : 0;
  const mode = isModeControlled ? (modeProp as ModeKind) : modeInternal;
  const setMode = (v: ModeKind) => {
    if (onModeChange) onModeChange(v);
    if (!isModeControlled) setModeInternal(v);
  };
  const isGranControlled = granProp !== undefined;
  const [granInternal, setGranInternal] = useState<GranKind>('daily');
  const gran = isGranControlled ? (granProp as GranKind) : granInternal;
  const setGran = (v: GranKind) => {
    if (onGranChange) onGranChange(v);
    if (!isGranControlled) setGranInternal(v);
  };


  const buildUrl = (path: string) =>
    globalUrl ? `${globalUrl.replace(/\/$/, '')}${path}` : getApiUrl(path);

  const load = async (silent = false) => {
    if (serverside || !isLoaded || !isLoggedIn || !orgId) { setLoading(false); return; }
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [statsRes, notifRes] = await Promise.all([
        fetch(buildUrl(`/api/v1/orgs/${orgId}/stats`), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
        fetch(buildUrl(`/api/v1/notifications`), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (notifRes.ok) {
        const nd = await notifRes.json();
        setNotifications(Array.isArray(nd) ? nd : (nd.notifications || []));
      }
    } catch { /* noop */ } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgId, isLoaded, isLoggedIn, globalUrl]);

  // Sum the execution queue across all running runtime locations.
  // A location counts as running when it is cloud, or checked in within 300s.
  useEffect(() => {
    if (serverside || !isLoaded || !isLoggedIn || !orgId) { setQueueLoading(false); return; }
    let cancelled = false;
    setQueueLoading(true);
    (async () => {
      try {
        const res = await fetch(buildUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Org-Id': orgId },
        });
        if (!res.ok) return;
        const envs = await res.json();
        if (cancelled || !Array.isArray(envs)) return;
        const now = Math.floor(Date.now() / 1000);
        const total = envs.reduce((sum: number, env: any) => {
          const running = env?.Type === 'cloud' || ((env?.checkin ?? 0) > 0 && now - (env?.checkin ?? 0) < 300);
          return running ? sum + Math.max(0, Number(env?.queue) || 0) : sum;
        }, 0);
        setQueuedAutomation(total);
      } catch { /* noop */ } finally {
        if (!cancelled) setQueueLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, isLoaded, isLoggedIn, globalUrl, refreshKey]);

  // External refresh trigger — parent bumps `refreshKey` to re-fetch silently.
  useEffect(() => {
    if (refreshKey === undefined) return;
    load(true); /* eslint-disable-next-line */
  }, [refreshKey]);

  const daily = stats?.daily_statistics || [];
  const rangeDays = parseInt(days, 10);

  // Time buckets (daily or monthly) — every chart in this dashboard renders
  // one section per bucket, so widths are uniform regardless of range.
  const buckets = useMemo(
    () => customRange
      ? buildBucketsBetween(customRange.fromMs, customRange.toMs, gran)
      : buildBuckets(rangeDays, gran),
    [rangeDays, gran, customRange],
  );

  const filtered = useMemo(() => {
    const start = buckets[0]?.startMs ?? (Date.now() - rangeDays * 86400_000);
    const end = buckets[buckets.length - 1]?.endMs ?? Date.now();
    return daily
      .filter(d => {
        const ms = new Date(d.date).getTime();
        return ms >= start && ms < end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [daily, rangeDays, buckets]);

  const isApps = mode === 'apps';
  const successKey = isApps ? 'app_executions' : 'workflow_executions_finished';
  const failedKey = isApps ? 'app_executions_failed' : 'workflow_executions_failed';

  /** Sum a numeric daily-stats field into the configured buckets. */
  const bucketed = (key: string): number[] => {
    const acc = new Array(buckets.length).fill(0);
    for (const d of filtered) {
      const ms = new Date(d.date).getTime();
      const idx = bucketIndexOf(buckets, ms);
      if (idx >= 0) acc[idx] += Number((d as any)[key]) || 0;
    }
    return acc;
  };

  const chartData = useMemo(() => {
    const s = bucketed(successKey);
    const f = bucketed(failedKey);
    return buckets.map((b, i) => ({ date: b.label, success: s[i], failed: f[i] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, filtered, successKey, failedKey]);

  const totalSuccess = chartData.reduce((s, d) => s + d.success, 0);
  const totalFailed = chartData.reduce((s, d) => s + d.failed, 0);
  const total = totalSuccess + totalFailed;
  const successRate = total > 0 ? Math.round((totalSuccess / total) * 100) : 0;
  const failRate = total > 0 ? 100 - successRate : 0;

  // Count of notifications whose created_at falls within the selected range.
  // `created_at` may arrive as seconds or milliseconds — normalise to ms.
  const notificationCount = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 86400_000;
    return notifications.filter((n: any) => {
      const type = String(n?.type || n?.notification_type || '').toLowerCase();
      // Exclude agent-driven notifications (approvals, questions, handoffs, etc.)
      if (type.startsWith('agent_') || type.startsWith('agent-')) return false;
      const raw = Number(n?.created_at) || 0;
      if (!raw) return false;
      const ms = raw < 1e12 ? raw * 1000 : raw;
      return ms >= cutoff;
    }).length;
  }, [notifications, rangeDays]);

  /**
   * Custom stat keys come from two places in /api/v1/orgs/{orgId}/stats:
   *   1. Top-level `total_*` keys (map to the matching field in daily entries)
   *   2. `additions[].key` across the org-level + daily-level additions arrays
   *
   * We dedupe on the canonical key (with `total_` stripped) so the user does
   * not see e.g. both "Workflow executions" and "Total workflow executions".
   * Preference order: top-level `total_*` > addition key.
   */
  const statKeys = useMemo(() => {
    if (!stats) return [] as string[];
    const map = new Map<string, string>(); // canonical -> rawKey
    Object.keys(stats)
      .filter(k => k.startsWith('total_'))
      .forEach(k => {
        const canon = k.slice(6);
        if (!map.has(canon)) map.set(canon, k);
      });
    const addAddition = (k?: string) => {
      if (!k) return;
      const canon = k.startsWith('total_') ? k.slice(6) : k;
      if (!map.has(canon)) map.set(canon, k);
    };
    (stats.additions || []).forEach(a => addAddition(a?.key));
    (stats.daily_statistics || []).forEach(d =>
      (d.additions || []).forEach(a => addAddition(a?.key))
    );
    return Array.from(map.values()).sort((a, b) =>
      prettyStatLabel(a).localeCompare(prettyStatLabel(b))
    );
  }, [stats]);

  useEffect(() => {
    if (!statKeys.length) return;
    if (selectedStat && statKeys.includes(selectedStat)) return;
    const firstWithData = statKeys.find(k =>
      filtered.reduce((sum, d) => sum + valueForStat(d, k), 0) > 0
    );
    setSelectedStat(firstWithData || statKeys[0]);
  }, [statKeys, selectedStat, filtered]);

  const valueForStat = (d: any, key: string): number => {
    const bare = key.startsWith('total_') ? key.slice(6) : key;
    if (d[bare] != null) return Number(d[bare]) || 0;
    if (d[key] != null) return Number(d[key]) || 0;
    const hit = (d.additions || []).find((a: Addition) => a?.key === key || a?.key === bare);
    return hit ? Number(hit.value) || 0 : 0;
  };

  const statSeries = useMemo(() => {
    if (!selectedStat) return [] as Array<{ date: string; value: number }>;
    const acc = new Array(buckets.length).fill(0);
    for (const d of filtered) {
      const idx = bucketIndexOf(buckets, new Date(d.date).getTime());
      if (idx >= 0) acc[idx] += valueForStat(d, selectedStat);
    }
    return buckets.map((b, i) => ({ date: b.label, value: acc[i] }));
  }, [filtered, selectedStat, buckets]);

  /** Aggregate value per stat key across the currently-filtered date range. */
  const statTotals = useMemo(() => {
    const out: Record<string, number> = {};
    statKeys.forEach(k => {
      out[k] = filtered.reduce((sum, d) => sum + valueForStat(d, k), 0);
    });
    return out;
  }, [statKeys, filtered]);

  // Click-drag a range on any time-series chart to zoom the dashboard.
  const activityDrag = useChartRangeDrag(buckets, onRangeSelect);
  const statsDrag = useChartRangeDrag(buckets, onRangeSelect);


  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
        {[140, 320, 240].map((h, i) => (
          <Skeleton key={i} variant="rounded" height={h} sx={{ borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.3)' }} />
        ))}
      </Box>
    );
  }

  const showHeader = !!headerLeft || !isDaysControlled || !isModeControlled || !isGranControlled || !hideRefresh;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: showHeader ? 2 : 0 }}>
      {/* Header row — caller-supplied left content (e.g. dashboard tabs) + filters */}
      {showHeader && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>
            {headerLeft}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {!isDaysControlled && (
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Last</InputLabel>
                <Select label="Last" value={days} onChange={(e) => setDays(String(e.target.value))}>
                  {RANGE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {!isModeControlled && (
              <Box sx={{ alignSelf: 'flex-end' }}>
                <SegmentedControl
                  ariaLabel="Mode"
                  value={mode}
                  onChange={(v) => setMode(v as ModeKind)}
                  options={[{ value: 'workflows', label: 'Workflows' }, { value: 'apps', label: 'Apps' }]}
                />
              </Box>
            )}
            {!isGranControlled && (
              <Box sx={{ alignSelf: 'flex-end' }}>
                <SegmentedControl
                  ariaLabel="Granularity"
                  value={gran}
                  onChange={(v) => setGran(v as GranKind)}
                  options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]}
                />
              </Box>
            )}
            {!hideRefresh && (
              <MuiTooltip title="Refresh">
                <IconButton size="small" onClick={() => load(true)} sx={{ color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-end' }}>
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                </IconButton>
              </MuiTooltip>
            )}
          </Box>
        </Box>
      )}

      {/* KPI tiles */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        <KpiTile
          icon={AlertCircle}
          glow={NEON.magenta}
          value={notificationCount}
          label="Notifications"
          isLoading={loading}
          delay={0}
          onClick={async () => await navigateToShuffleCore(getShuffleCoreUrl('/admin?admin_tab=notifications'), { newTab: true })}
        />
        <KpiTile
          icon={Workflow}
          glow={NEON.green}
          value={totalSuccess}
          label={`Successful ${isApps ? 'App' : 'Workflow'} Runs`}
          isLoading={loading}
          delay={0.05}
          onClick={async () => {
            if (typeof window !== 'undefined' && isShuffleSecurityUrl(window.location.href)) {
              window.location.href = '/workflows/debug';
            } else {
              await navigateToShuffleCore(getShuffleCoreUrl('/workflows/debug'), { newTab: true });
            }
          }}
        />
        <KpiTile
          icon={Zap}
          glow={NEON.red}
          value={totalFailed}
          label={`Failed ${isApps ? 'App' : 'Workflow'} Runs`}
          isLoading={loading}
          delay={0.1}
          onClick={async () => {
            if (typeof window !== 'undefined' && isShuffleSecurityUrl(window.location.href)) {
              window.location.href = '/workflows/debug';
            } else {
              await navigateToShuffleCore(getShuffleCoreUrl('/workflows/debug'), { newTab: true });
            }
          }}
        />
        <KpiTile
          icon={Activity}
          glow={NEON.cyan}
          value={workflowCount}
          label="Workflows"
          isLoading={loading || workflowsLoading}
          delay={0.15}
          onClick={async () => await navigateToShuffleCore(getShuffleCoreWorkflowUrl(), { newTab: true })}
        />
        <KpiTile
          icon={Clock}
          glow={NEON.amber}
          value={queuedAutomation}
          label="Queued Automation"
          isLoading={queueLoading}
          delay={0.2}
          onClick={async () => {
            if (typeof window !== 'undefined' && isShuffleSecurityUrl(window.location.href)) {
              window.location.href = '/admin?tab=locations';
            } else {
              await navigateToShuffleCore(getShuffleCoreUrl('/admin?admin_tab=locations'), { newTab: true });
            }
          }}
        />
      </Box>

      {/* Hero chart */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.5 }}>
        <Panel
          title={`${isApps ? 'App' : 'Workflow'} Activity`}
          accent={NEON.green}
          delay={0.2}
          action={
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {([['Successful', NEON.green], ['Failed', NEON.red]] as const).map(([label, color]) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                  <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>{label}</Typography>
                </Box>
              ))}
            </Box>
          }
        >
          <Box sx={{ height: 260 }}>
            {loading ? (
              <Skeleton variant="rounded" height={260} sx={{ bgcolor: 'hsl(var(--muted) / 0.3)' }} />
            ) : (totalSuccess + totalFailed) <= 2 ? (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <EmptyState
                  text={`Not enough ${isApps ? 'app' : 'workflow'} runs in this range to chart trends yet`}
                  ctaLabel="Build a workflow"
                  onCta={async () => await navigateToShuffleCore(getShuffleCoreWorkflowUrl(), { newTab: true })}
                />
              </Box>

            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} {...activityDrag.chartProps}>
                  <defs>
                    <linearGradient id="auto-grad-success" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={NEON.green} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={NEON.green} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="auto-grad-failed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={NEON.red} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={NEON.red} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <RechartsTooltip content={<TooltipContent />} cursor={{ stroke: NEON.violet, strokeOpacity: 0.3, strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="success" stroke={NEON.green} strokeWidth={2} fill="url(#auto-grad-success)" name="Successful" isAnimationActive={false} />
                  <Area type="monotone" dataKey="failed" stroke={NEON.red} strokeWidth={2} fill="url(#auto-grad-failed)" name="Failed" isAnimationActive={false} />
                  {activityDrag.refArea && (
                    <ReferenceArea x1={activityDrag.refArea.x1} x2={activityDrag.refArea.x2} stroke="hsl(var(--primary))" strokeOpacity={0.4} fill="hsl(var(--primary))" fillOpacity={0.12} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Panel>
      </Box>

      {/* Custom Stats */}
      <Panel
        title="Custom Stats"
        accent={NEON.violet}
        delay={0.3}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <Autocomplete
                size="small"
                options={statKeys}
                value={selectedStat ?? undefined}
                onChange={(_, v) => { if (v) pickSelectedStat(v); }}
                disableClearable
                getOptionLabel={(k) => prettyStatLabel(k)}
                isOptionEqualToValue={(a, b) => a === b}
                noOptionsText={statKeys.length === 0 ? 'No stats available' : 'No matches'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Find your stat"
                    placeholder="Type to search..."
                    InputLabelProps={{ sx: { color: NEON.violet } }}
                  />
                )}
                componentsProps={{
                  paper: {
                    sx: {
                      bgcolor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                    },
                  },
                }}
                ListboxProps={{ sx: { maxHeight: 420 } }}
                renderOption={(props, k) => {
                  const total = statTotals[k] || 0;
                  return (
                    <li {...props} key={k}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <Typography
                          sx={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 13,
                            fontWeight: 600,
                            color: statColor(total),
                            minWidth: 56,
                            textAlign: 'left',
                          }}
                        >
                          {formatCompact(total)}
                        </Typography>
                        <Typography sx={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>
                          {prettyStatLabel(k)}
                        </Typography>
                      </Box>
                    </li>
                  );
                }}
              />
            </FormControl>
            <MuiTooltip title="Increment any custom key from a workflow (Shuffle Tools → Repeat back / Stats actions, or the API) and it shows up here. Opens the Stats & Timelines API docs.">
              <Box
                component="a"
                href="https://shuffler.io/docs/API#stats-and-timelines"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  color: NEON.violet,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                Add custom stats
                <ExternalLink size={12} />
              </Box>
            </MuiTooltip>
          </Box>
        }

      >
        <Box sx={{ height: 260 }}>
          {statKeys.length === 0 ? (
            <EmptyState
              text="No custom stats yet. Any counter you increment from a workflow (via the Stats & Timelines API or a Shuffle Tools stat action) appears here automatically — for example agent_executions, tickets_closed, or phishing_blocked."
              ctaLabel="View Stats & Timelines API"
              onCta={() => window.open('https://shuffler.io/docs/API#stats-and-timelines', '_blank', 'noopener,noreferrer')}
            />
          ) : statSeries.every(p => p.value === 0) ? (
            <EmptyState text={`No values for "${prettyStatLabel(selectedStat)}" in the last ${days} days. Increment this key from a workflow and it will start charting here.`} />

                    ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} {...statsDrag.chartProps}>
                <defs>
                  <linearGradient id="auto-bar-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={NEON.violet} stopOpacity={1} />
                    <stop offset="100%" stopColor={NEON.violet} stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <RechartsTooltip content={<TooltipContent />} cursor={{ fill: 'hsl(var(--muted) / 0.15)' }} />
                <Bar dataKey="value" name={selectedStat ? prettyStatLabel(selectedStat) : 'value'} radius={[6, 6, 0, 0]} maxBarSize={64} fill="url(#auto-bar-fill)" />
                {statsDrag.refArea && (
                  <ReferenceArea x1={statsDrag.refArea.x1} x2={statsDrag.refArea.x2} stroke="hsl(var(--primary))" strokeOpacity={0.4} fill="hsl(var(--primary))" fillOpacity={0.12} />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Panel>
    </Box>
  );
};

const Gauge = ({ value, color, label }: { value: number; color: string; label: string }) => {
  const data = [{ name: 'v', value, fill: color }];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ width: 110, height: 110, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="75%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar background={{ fill: 'hsl(var(--muted) / 0.3)' }} dataKey="value" cornerRadius={20} />
          </RadialBarChart>
        </ResponsiveContainer>
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'hsl(var(--foreground))' }}>{value}%</Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>{label}</Typography>
    </Box>
  );
};

export default AutomationDashboard;
