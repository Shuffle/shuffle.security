/**
 * Dashboard Overview — cyberpunk-inspired analytics: neon gradients,
 * glow effects, vivid bar/area gradients. Reference: Vicarius / cyberpunk
 * dashboards with magenta→violet→cyan palette over dark surfaces.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  Radar,
  Bug,
  Flame,
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { useNavigate } from '@/lib/router-compat';
import { NEON, TooltipContent, KpiTile, Panel, EmptyState, buildBuckets, buildBucketsBetween, bucketIndexOf, useChartRangeDrag, ReferenceArea, useSeriesVisibility, SeriesLegend, type Granularity } from './_shared';
import { ChartShimmer } from './ChartShimmer';
import { useSyncHostBaseUrl } from '../../useSyncHostBaseUrl';

import type { ShuffleCoreHostProps } from '../../types/host-props';
import { fetchIocEntries, sumIocEntries } from '../../utils/iocFeedTotals';
import { isSlaBreached, type SlaTargets } from '../../utils/slaBreach';

interface OverviewIncident {
  status: string;
  severity: string;
  createdTs: number;
  /** First response time (ms), when known. */
  respondedTs?: number;
  /** Resolution time (ms), when known. */
  resolvedTs?: number;
}

export interface OverviewProps extends ShuffleCoreHostProps {
  incidents: OverviewIncident[];
  incidentsLoading?: boolean;
  /** True when the incidents source has more items beyond what was fetched
   *  (e.g. hit the page/fetch cap). Renders counts as "N+". */
  incidentsHasMore?: boolean;
  vulnSeverityCounts: { critical: number; high: number; medium: number; low: number; info: number };
  vulnLoading?: boolean;
  monitorHostCount: number | null;
  runningSensorCount: number | null;
  monitorsLoading?: boolean;
  /** Time-range in days for the incident trend chart. Defaults to 30. */
  days?: number;
  /** Bucketing granularity for the incident trend chart. Defaults to 'daily'. */
  gran?: Granularity;
  /** Custom date range — when set, overrides `days` and is used for bucketing. */
  customRange?: { fromMs: number; toMs: number } | null;
  /** Called when the user click-drags on a chart to pick a range. */
  onRangeSelect?: (fromMs: number, toMs: number) => void;
  /** When provided, the "Set up X" empty-state CTAs open the matching
   *  usecase in-place via the host (typically by rendering <UsecaseDrawer>)
   *  instead of redirecting to /usecases or to shuffle.security. */
  onOpenUsecase?: (flowId: string) => void;
  /** Per-severity respond/resolve targets in minutes. When set, the
   *  dashboard shows SLA breaches in Incident Activity and as a tile. */
  slaTargets?: SlaTargets;
}

// Resolved first so it sits at the bottom of the stack; the top edge is
// every incident created in that bucket.
const STATUS_COLORS = {
  Resolved: NEON.green,
  New: NEON.cyan,
  'In Progress': NEON.orange,
};

// ── Main ────────────────────────────────────────────────────────────────────
export const DashboardOverview = ({
  incidents,
  incidentsLoading,
  incidentsHasMore,
  vulnSeverityCounts,
  vulnLoading,
  monitorHostCount,
  runningSensorCount,
  monitorsLoading,
  days = 30,
  gran = 'daily',
  customRange,
  onRangeSelect,
  onOpenUsecase,
  slaTargets,
  // Standard Shuffle-Core host props — accepted for API consistency across
  // components mounted in multiple places. Not currently consumed because this
  // surface is purely presentational over host-supplied data.
  serverside: _serverside,
  isLoaded: _isLoaded,
  isLoggedIn: _isLoggedIn,
  globalUrl,
  userdata: _userdata,
}: OverviewProps) => {
  useSyncHostBaseUrl(globalUrl);
  const rrNavigate = useNavigate();
  const isShuffleSecurityHost = () => {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      // Only the real production Shuffle Security hosts route to local
      // pages like /incidents and /vulnerabilities. Every other host
      // (including Lovable previews and shuffler.io) opens the matching
      // Usecase so the user can configure ingestion from there.
      return (
        host === 'shuffle.security' ||
        host === 'www.shuffle.security' ||
        host === 'security.shuffler.io' ||
        host === 'shutdown.no' ||
        host === 'www.shutdown.no'
      );
    } catch { return false; }
  };
  const navigate = (path: string) => {
    // When this surface is embedded outside Shuffle Security (e.g. on
    // shuffler.io / Shuffle Core), Security Operations links should open
    // on the Shuffle Security app instead of trying to route locally.
    if (!isShuffleSecurityHost()) {
      window.open(`https://shuffle.security${path.startsWith('/') ? '' : '/'}${path}`, '_blank', 'noopener,noreferrer');
      return;
    }
    rrNavigate(path);
  };
  // For "set up X" CTAs:
  //   1. If the host wired `onOpenUsecase`, open the specific usecase drawer
  //      right here on the dashboard (no redirect).
  //   2. Otherwise, on Shuffle Security stay local and deep-link to the page.
  //   3. Otherwise, fall back to /usecases pre-filtered by area + category.
  const navigateSetup = (flowId: string, securityPath: string, usecasesQuery: string) => {
    if (onOpenUsecase) {
      onOpenUsecase(flowId);
      return;
    }
    if (isShuffleSecurityHost()) {
      rrNavigate(securityPath);
      return;
    }
    rrNavigate(`/usecases${usecasesQuery ? `?${usecasesQuery}` : ''}`);
  };

  // IOC feeds total — shares the SAME fetchIocEntries helper with the
  // IOC feeds usecase outcome block so the two counts always agree.
  const [iocTotal, setIocTotal] = useState<number | null>(null);
  const [iocLoading, setIocLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIocLoading(true);
      try {
        const entries = await fetchIocEntries({ baseUrl: globalUrl || '' });
        if (!cancelled) setIocTotal(sumIocEntries(entries));
      } catch {
        if (!cancelled) setIocTotal(0);
      } finally {
        if (!cancelled) setIocLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [globalUrl]);

  const incidentStats = useMemo(() => {
    const open = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed');
    const critical = incidents.filter(i =>
      (i.severity === 'critical' || i.severity === 'high') &&
      i.status !== 'resolved' && i.status !== 'closed'
    ).length;
    // Compare selected window (customRange or `days`) against the previous
    // same-sized window. E.g. "Last 30 days" → previous 30 days before that.
    const now = Date.now();
    const windowMs = customRange
      ? Math.max(1, customRange.toMs - customRange.fromMs)
      : Math.max(1, days) * 86400_000;
    const currentEnd = customRange ? customRange.toMs : now;
    const currentStart = currentEnd - windowMs;
    const previousEnd = currentStart;
    const previousStart = previousEnd - windowMs;
    const isOpen = (i: OverviewIncident) => i.status !== 'resolved' && i.status !== 'closed';
    const currentCount = incidents.filter(i => i.createdTs && i.createdTs >= currentStart && i.createdTs < currentEnd && isOpen(i)).length;
    const previousCount = incidents.filter(i => i.createdTs && i.createdTs >= previousStart && i.createdTs < previousEnd && isOpen(i)).length;
    let delta: { value: string; positive: boolean } | null = null;
    if (previousCount > 0) {
      const pct = Math.round(((currentCount - previousCount) / previousCount) * 100);
      if (pct !== 0) delta = { value: `${Math.abs(pct)}%`, positive: pct < 0 };
    }
    return { openCount: open.length, criticalCount: critical, last24h: currentCount, delta };
  }, [incidents, days, customRange]);

  const incidentSpark = useMemo(() => {
    const days = 14;
    const arr = new Array(days).fill(0);
    const today = startOfDay(new Date()).getTime();
    for (const inc of incidents) {
      if (!inc.createdTs) continue;
      const day = startOfDay(new Date(inc.createdTs)).getTime();
      const diff = Math.round((today - day) / 86400_000);
      if (diff >= 0 && diff < days) arr[days - 1 - diff]++;
    }
    return arr;
  }, [incidents]);

  const trendBuckets = useMemo(
    () => customRange
      ? buildBucketsBetween(customRange.fromMs, customRange.toMs, gran)
      : buildBuckets(days, gran),
    [days, gran, customRange],
  );

  const trendData = useMemo(() => {
    const now = Date.now();
    const rows = trendBuckets.map(b => ({ date: b.label, New: 0, 'In Progress': 0, Resolved: 0, 'SLA Breached': 0 }));
    for (const inc of incidents) {
      if (!inc.createdTs) continue;
      const idx = bucketIndexOf(trendBuckets, inc.createdTs);
      if (idx < 0) continue;
      const s = (inc.status || '').toLowerCase().replace(/[_\s]+/g, '');
      if (s === 'resolved' || s === 'closed') rows[idx].Resolved++;
      else if (s === 'inprogress') rows[idx]['In Progress']++;
      else rows[idx].New++;
      // Only unhandled incidents from this day that are past their target, so
      // the breach line can never exceed the open (New + In Progress) count.
      if (slaTargets && s !== 'resolved' && s !== 'closed' && isSlaBreached(inc, slaTargets, now)) rows[idx]['SLA Breached']++;
    }
    return rows;
  }, [incidents, trendBuckets, slaTargets]);

  const openBreachCount = useMemo(() => {
    if (!slaTargets) return 0;
    const now = Date.now();
    return incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed' && isSlaBreached(i, slaTargets, now)).length;
  }, [incidents, slaTargets]);
  const seriesColors: Record<string, string> = slaTargets ? { ...STATUS_COLORS, 'SLA Breached': NEON.red } : STATUS_COLORS;

  const trendHasData = trendData.some(d => d.New || d['In Progress'] || d.Resolved);

  const trendDrag = useChartRangeDrag(trendBuckets, onRangeSelect);
  const trendSeries = useSeriesVisibility('incident-activity', ['SLA Breached']);

  const vulnTotal =
    vulnSeverityCounts.critical + vulnSeverityCounts.high + vulnSeverityCounts.medium +
    vulnSeverityCounts.low + vulnSeverityCounts.info;
  const vulnData = [
    { name: 'Critical', value: vulnSeverityCounts.critical, color: NEON.red, gradId: 'vuln-crit' },
    { name: 'High', value: vulnSeverityCounts.high, color: NEON.magenta, gradId: 'vuln-high' },
    { name: 'Medium', value: vulnSeverityCounts.medium, color: NEON.violet, gradId: 'vuln-med' },
    { name: 'Low', value: vulnSeverityCounts.low, color: NEON.cyan, gradId: 'vuln-low' },
    { name: 'Info', value: vulnSeverityCounts.info, color: NEON.green, gradId: 'vuln-info' },
  ];
  const vulnCriticalPct = vulnTotal > 0
    ? Math.round(((vulnSeverityCounts.critical + vulnSeverityCounts.high) / vulnTotal) * 100)
    : 0;

  const monitorTotal = (monitorHostCount ?? 0) + (runningSensorCount ?? 0);
  const radialData = [
    { name: 'Sensors', value: runningSensorCount ?? 0, fill: NEON.cyan },
    { name: 'Hosts', value: monitorHostCount ?? 0, fill: NEON.violet },
  ];

  return (
    <Box sx={{ mb: 5 }}>
      {/* KPI tiles */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: slaTargets ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <KpiTile
          icon={AlertTriangle}
          glow={NEON.magenta}

          value={incidentsHasMore && incidentStats.openCount > 0 ? `${incidentStats.openCount}+` : incidentStats.openCount}
          label="Open Incidents"
          delta={incidentStats.delta}
          deltaTooltip={customRange
            ? 'Change in open incidents vs the previous same-sized window'
            : `Change in open incidents vs the previous ${days} day${days === 1 ? '' : 's'}`}
          isLoading={incidentsLoading}
          onClick={() => incidentStats.openCount === 0
            ? navigateSetup('siem_case_management_1', '/incidents?highlight=ingest', 'area=automatic_ingestion&category=case_management')
            : navigate('/incidents')}
          delay={0}
        />
        <KpiTile
          icon={Flame}
          glow={NEON.red}

          value={incidentsHasMore && incidentStats.criticalCount > 0 ? `${incidentStats.criticalCount}+` : incidentStats.criticalCount}
          label="Critical / High"
          isLoading={incidentsLoading}
          onClick={() => incidentStats.criticalCount === 0
            ? navigateSetup('siem_case_management_1', '/incidents?highlight=ingest', 'area=automatic_ingestion&category=case_management')
            : navigate('/incidents?severity=critical,high')}
          delay={0.05}
        />
        {slaTargets && (
          <KpiTile
            icon={AlertTriangle}
            glow={NEON.red}
            value={incidentsHasMore && openBreachCount > 0 ? `${openBreachCount}+` : openBreachCount}
            label="Open SLA Breaches"
            isLoading={incidentsLoading}
            onClick={() => navigate('/incidents')}
            delay={0.08}
          />
        )}
        <KpiTile
          icon={Radar}
          glow={NEON.cyan}

          value={iocTotal ?? 0}
          label="IOCs Tracked"
          isLoading={iocLoading}
          onClick={() => navigateSetup('threat_intel_network_1', '/threat-intel', 'area=threat_intel&category=threat_intel')}
          delay={0.1}
        />
        <KpiTile
          icon={Bug}
          glow={NEON.violet}

          value={vulnTotal}
          label="Vulnerabilities"
          isLoading={vulnLoading}
          onClick={() => vulnTotal === 0
            ? navigateSetup('vulnerability_ingestion_1', '/vulnerabilities', 'area=automatic_ingestion&category=asset_management')
            : navigate('/vulnerabilities')}
          delay={0.15}
        />
      </Box>

      {/* Hero chart + monitor radial */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Panel
          title="Incident Activity"
          accent={NEON.magenta}
          delay={0.2}
          action={
            <SeriesLegend
              items={Object.entries(seriesColors).map(([label, color]) => ({ key: label, label, color }))}
              isHidden={trendSeries.isHidden}
              onToggle={trendSeries.toggle}
            />
          }
        >
          <Box sx={{ height: 260 }}>
            {incidentsLoading ? (
              <ChartShimmer height={260} variant="area" label="Loading incident activity" />
            ) : trendHasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} {...trendDrag.chartProps}>
                  <defs>
                    {Object.entries(seriesColors).map(([k, c]) => (
                      <linearGradient key={k} id={`ov-grad-${k.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <RechartsTooltip content={<TooltipContent />} cursor={{ stroke: NEON.violet, strokeOpacity: 0.3, strokeWidth: 1 }} />
                  {/* New and In Progress are stacked so the top edge is the
                      open total for the day. SLA Breached is a subset of that
                      total, so it is drawn on its own and always sits at or
                      below the top edge. */}
                  {Object.entries(seriesColors).map(([k, c]) => (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stackId={k === 'SLA Breached' ? undefined : 'open'}
                      hide={trendSeries.isHidden(k)}
                      stroke={c}
                      strokeWidth={2}
                      fill={`url(#ov-grad-${k.replace(/\s/g, '')})`}
                      fillOpacity={0.6}
                      isAnimationActive={false}
                    />
                  ))}
                  {trendDrag.refArea && (
                    <ReferenceArea x1={trendDrag.refArea.x1} x2={trendDrag.refArea.x2} stroke="hsl(var(--primary))" strokeOpacity={0.4} fill="hsl(var(--primary))" fillOpacity={0.12} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box sx={{ width: '100%', mt: '-15px' }}>
                  <EmptyState text={`No incident activity in the last ${days} days`} ctaLabel="Set up incident ingestion" onCta={() => navigateSetup('siem_case_management_1', '/incidents?highlight=ingest', 'area=automatic_ingestion&category=case_management')} />
                </Box>
              </Box>
            )}
          </Box>
        </Panel>

        <Panel title="Detection Coverage" accent={NEON.cyan} delay={0.25}>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 240 }}>
            {monitorsLoading ? (
              <ChartShimmer height={220} variant="radial" label="Loading coverage" />
            ) : monitorTotal > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <RadialBarChart
                    innerRadius="62%"
                    outerRadius="100%"
                    data={radialData}
                    startAngle={90}
                    endAngle={-270}
                    barSize={14}
                  >
                    <defs>
                      <linearGradient id="radial-host" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={NEON.violet} />
                        <stop offset="100%" stopColor={NEON.magenta} />
                      </linearGradient>
                      <linearGradient id="radial-sensor" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={NEON.cyan} />
                        <stop offset="100%" stopColor={NEON.green} />
                      </linearGradient>
                    </defs>
                    <PolarAngleAxis type="number" domain={[0, Math.max(monitorTotal, 1)]} tick={false} />
                    <RadialBar
                      dataKey="value"
                      cornerRadius={8}
                      background={{ fill: 'hsl(var(--muted) / 0.15)' }}
                    >
                      {radialData.map((d, i) => (
                        <Cell key={d.name} fill={i === 0 ? 'url(#radial-sensor)' : 'url(#radial-host)'} />
                      ))}
                    </RadialBar>
                    <RechartsTooltip content={<TooltipContent />} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <Box sx={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}>
                  <Typography sx={{
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: 'hsl(var(--foreground))',
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    fontFamily: 'ui-monospace, monospace',
                    
                  }}>
                    {monitorTotal}
                  </Typography>
                  <Typography sx={{ fontSize: '0.62rem', color: 'hsl(var(--muted-foreground))', mt: 0.5, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
                    Total
                  </Typography>
                </Box>
              </>
            ) : (
              <Box sx={{ width: '100%', mt: '-15px' }}>
                <EmptyState text="No host monitors or pipeline sensors deployed yet" ctaLabel="Deploy a monitor" onCta={() => navigateSetup('case_management_asset_management_monitors_1', '/monitors?add_host=true', 'area=detection&category=endpoint_detection')} />
              </Box>
            )}
          </Box>
          {monitorTotal > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-around', pt: 1.5, borderTop: '1px solid hsl(var(--border))' }}>
              <Box
                onClick={() => navigateSetup('case_management_asset_management_monitors_1', '/monitors?add_host=true', 'area=detection&category=endpoint_detection')}
                sx={{ textAlign: 'center', cursor: 'pointer', borderRadius: 1, px: 1.5, py: 0.5, transition: 'background 0.15s', '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' } }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: NEON.violet }} />
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'hsl(var(--foreground))', fontFamily: 'ui-monospace, monospace' }}>{monitorHostCount ?? 0}</Typography>
                </Box>
                <Typography sx={{ fontSize: '0.62rem', color: 'hsl(var(--muted-foreground))', mt: 0.25, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Host Monitors</Typography>
              </Box>
              <Box
                onClick={() => navigate('/detection')}
                sx={{ textAlign: 'center', cursor: 'pointer', borderRadius: 1, px: 1.5, py: 0.5, transition: 'background 0.15s', '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' } }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: NEON.cyan }} />
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'hsl(var(--foreground))', fontFamily: 'ui-monospace, monospace' }}>{runningSensorCount ?? 0}</Typography>
                </Box>
                <Typography sx={{ fontSize: '0.62rem', color: 'hsl(var(--muted-foreground))', mt: 0.25, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pipeline Sensors</Typography>
              </Box>
            </Box>
          )}
        </Panel>
      </Box>

      {/* Vulnerability severity */}
      <Panel
        title="Vulnerabilities by Severity"
        accent={NEON.violet}
        delay={0.3}
        action={
          <Typography
            onClick={() => navigate('/vulnerabilities')}
            sx={{ fontSize: '0.7rem', color: NEON.cyan, cursor: 'pointer', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            View all →
          </Typography>
        }
      >
        <Box sx={{ height: 200 }}>
          {vulnLoading ? (
            <ChartShimmer height={200} variant="bars" label="Loading vulnerabilities" />
          ) : vulnTotal > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vulnData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  {vulnData.map((d) => (
                    <linearGradient key={d.gradId} id={d.gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                      <stop offset="100%" stopColor={d.color} stopOpacity={0.25} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <RechartsTooltip content={<TooltipContent />} cursor={{ fill: 'hsl(var(--muted) / 0.15)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
                  {vulnData.map((d) => (
                    <Cell key={d.name} fill={`url(#${d.gradId})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ pt: '15px' }}>
              <EmptyState text="No vulnerabilities ingested yet" ctaLabel="Set up vulnerability ingestion" onCta={() => navigateSetup('vulnerability_ingestion_1', '/vulnerabilities', 'area=automatic_ingestion&category=asset_management')} />
            </Box>
          )}
        </Box>
      </Panel>
    </Box>
  );
};

export default DashboardOverview;
