/**
 * VulnerabilitiesDashboard — analytics surface for the vulnerability
 * inventory (`shuffle-security_vulnerabilities` datastore category).
 *
 * Mirrors the other dashboards: KPI tiles, a discovery trend chart bound to
 * the shared date range/granularity, plus severity, source and affected-host
 * breakdowns. Data is parsed client-side and supports both native vuln
 * records and OSV-shaped records.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import { Bug, Flame, ShieldAlert, Server } from 'lucide-react';
import {
  NEON,
  TooltipContent,
  KpiTile,
  Panel,
  EmptyState,
  buildBuckets,
  buildBucketsBetween,
  bucketIndexOf,
  useChartRangeDrag,
  ReferenceArea,
  useSeriesVisibility,
  SeriesLegend,
  type Granularity,
} from './_shared';
import { ChartShimmer } from './ChartShimmer';
import { getApiUrl, getAuthHeader } from '../../api';
import { useSyncHostBaseUrl } from '../../useSyncHostBaseUrl';
import type { ShuffleCoreHostProps } from '../../types/host-props';

export interface VulnerabilitiesDashboardProps extends ShuffleCoreHostProps {
  days?: number;
  gran?: Granularity;
  customRange?: { fromMs: number; toMs: number } | null;
  onRangeSelect?: (fromMs: number, toMs: number) => void;
  refreshKey?: number;
  orgId?: string;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface VulnRow {
  severity: Severity;
  source: string;
  host: string;
  status: string;
  discoveredMs: number;
}

const SEV_COLOR: Record<Severity, string> = {
  critical: NEON.red,
  high: NEON.orange,
  medium: NEON.amber,
  low: NEON.cyan,
  info: NEON.violet,
};

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const normSeverity = (raw: unknown): Severity => {
  const s = (raw ?? '').toString().trim().toLowerCase();
  if (s.startsWith('crit')) return 'critical';
  if (s.startsWith('high') || s === 'severe') return 'high';
  if (s.startsWith('mod') || s.startsWith('med')) return 'medium';
  if (s.startsWith('low')) return 'low';
  const num = parseFloat(s);
  if (!Number.isNaN(num)) {
    if (num >= 9) return 'critical';
    if (num >= 7) return 'high';
    if (num >= 4) return 'medium';
    if (num > 0) return 'low';
  }
  return 'info';
};

const toMsTs = (t: unknown): number => {
  if (!t) return 0;
  if (typeof t === 'number') return t > 1e12 ? t : t * 1000;
  const asNum = Number(t);
  if (!Number.isNaN(asNum) && asNum > 0) return asNum > 1e12 ? asNum : asNum * 1000;
  const parsed = new Date(String(t)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const VulnerabilitiesDashboard = ({
  days = 30,
  gran = 'daily',
  customRange,
  onRangeSelect,
  refreshKey = 0,
  orgId,
  globalUrl,
}: VulnerabilitiesDashboardProps) => {
  useSyncHostBaseUrl(globalUrl);

  const [rows, setRows] = useState<VulnRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const url = getApiUrl('/api/v2/vulns?skip_fields=false&top=100');
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...(orgId ? { 'Org-Id': orgId } : {}),
          },
        });
        if (!res.ok) { if (!cancelled) { setRows([]); setLoading(false); } return; }
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.keys || data.data || []);
        const parsed: VulnRow[] = [];
        for (const item of list) {
          try {
            const v = item?.value != null ? (typeof item.value === 'string' ? JSON.parse(item.value) : item.value) : item;
            if (!v) continue;
            const severity = normSeverity(
              v.severity && typeof v.severity !== 'object'
                ? v.severity
                : v?.database_specific?.severity,
            );
            const source = (v.source || v?.database_specific?.source || (Array.isArray(v.affected) ? 'OSV' : 'Unknown')).toString();
            const hosts: string[] = Array.isArray(v.hosts)
              ? v.hosts.map((h: { hostname?: string }) => h?.hostname).filter(Boolean)
              : (v.asset_name || v.asset_id ? [String(v.asset_name || v.asset_id)] : []);
            const status = (v.status || 'open').toString().toLowerCase();
            const discoveredMs = toMsTs((item as { created?: number }).created) || toMsTs(v.first_seen) || toMsTs(v.published);
            if (hosts.length === 0) {
              parsed.push({ severity, source, host: 'Unassigned', status, discoveredMs });
            } else {
              for (const h of hosts) parsed.push({ severity, source, host: h, status, discoveredMs });
            }
          } catch { /* skip */ }
        }
        if (!cancelled) { setRows(parsed); setLoading(false); }
      } catch {
        if (!cancelled) { setRows([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey, orgId]);

  const buckets = useMemo(
    () => (customRange
      ? buildBucketsBetween(customRange.fromMs, customRange.toMs, gran)
      : buildBuckets(days, gran)),
    [customRange, days, gran],
  );

  const totals = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const hosts = new Set<string>();
    let open = 0;
    for (const r of rows) {
      counts[r.severity]++;
      if (r.host && r.host !== 'Unassigned') hosts.add(r.host);
      if (r.status !== 'resolved') open++;
    }
    return { counts, hostCount: hosts.size, open, total: rows.length };
  }, [rows]);

  const trend = useMemo(() => {
    const out = buckets.map((b) => ({ label: b.label, critical: 0, high: 0, medium: 0, low: 0, info: 0 }));
    for (const r of rows) {
      if (!r.discoveredMs) continue;
      const idx = bucketIndexOf(buckets, r.discoveredMs);
      if (idx < 0) continue;
      out[idx][r.severity]++;
    }
    return out;
  }, [buckets, rows]);

  const hasTrendData = useMemo(
    () => trend.some((t) => t.critical + t.high + t.medium + t.low + t.info > 0),
    [trend],
  );

  const severityData = useMemo(
    () => SEV_ORDER.map((s) => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      value: totals.counts[s],
      fill: SEV_COLOR[s],
    })).filter((d) => d.value > 0),
    [totals],
  );

  const topHosts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!r.host || r.host === 'Unassigned') continue;
      counts[r.host] = (counts[r.host] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const topSources = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.source] = (counts[r.source] || 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const drag = useChartRangeDrag(buckets, onRangeSelect);
  const trendSeries = useSeriesVisibility('vuln-findings-over-time');

  const BarList = ({ items, color }: { items: { name: string; value: number }[]; color: string }) => {
    const max = items[0]?.value || 1;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5 }}>
        {items.map((i) => (
          <Box key={i.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--foreground))', width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {i.name}
            </Typography>
            <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'hsl(var(--muted) / 0.35)', overflow: 'hidden' }}>
              <Box sx={{ width: `${Math.max(6, (i.value / max) * 100)}%`, height: '100%', bgcolor: color }} />
            </Box>
            <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', width: 32, textAlign: 'right', fontFamily: 'monospace' }}>
              {i.value}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <KpiTile icon={Bug} glow={NEON.magenta} value={totals.total} label="Total findings" isLoading={loading} />
        <KpiTile icon={Flame} glow={NEON.red} value={totals.counts.critical} label="Critical" isLoading={loading} delay={0.05} />
        <KpiTile icon={ShieldAlert} glow={NEON.orange} value={totals.counts.high} label="High" isLoading={loading} delay={0.1} />
        <KpiTile icon={Server} glow={NEON.cyan} value={totals.hostCount} label="Affected hosts" isLoading={loading} delay={0.15} />
      </Box>

      <Panel
        title="Findings discovered over time"
        accent={NEON.magenta}
        delay={0.2}
        action={
          <SeriesLegend
            items={SEV_ORDER.map((s) => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1), color: SEV_COLOR[s] }))}
            isHidden={trendSeries.isHidden}
            onToggle={trendSeries.toggle}
          />
        }
      >
        <Box sx={{ height: 260 }}>
          {loading ? (
            <ChartShimmer height={260} variant="area" label="Loading findings activity" />
          ) : hasTrendData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} {...drag.chartProps}>
                <defs>
                  {SEV_ORDER.map((s) => (
                    <linearGradient key={s} id={`vuln-grad-${s}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SEV_COLOR[s]} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={SEV_COLOR[s]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <RechartsTooltip content={<TooltipContent />} cursor={{ stroke: NEON.violet, strokeOpacity: 0.3, strokeWidth: 1 }} />
                {SEV_ORDER.map((s) => (
                  <Area
                    key={s}
                    type="monotone"
                    dataKey={s}
                    hide={trendSeries.isHidden(s)}
                    name={s.charAt(0).toUpperCase() + s.slice(1)}
                    stroke={SEV_COLOR[s]}
                    strokeWidth={2}
                    fill={`url(#vuln-grad-${s})`}
                    fillOpacity={0.6}
                    isAnimationActive={false}
                  />
                ))}
                {drag.refArea && (
                  <ReferenceArea x1={drag.refArea.x1} x2={drag.refArea.x2} stroke="hsl(var(--primary))" strokeOpacity={0.4} fill="hsl(var(--primary))" fillOpacity={0.12} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ width: '100%', mt: '-15px' }}>
                <EmptyState text={customRange ? 'No vulnerabilities discovered in this range' : `No vulnerabilities discovered in the last ${days} days`} />
              </Box>
            </Box>
          )}
        </Box>
      </Panel>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Panel title="Severity breakdown">
          {loading ? (
            <ChartShimmer height={220} variant="bars" />
          ) : !severityData.length ? (
            <EmptyState text="No vulnerability data available." />
          ) : (
            <Box sx={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <RechartsTooltip content={<TooltipContent />} cursor={{ fill: 'hsl(var(--muted) / 0.25)' }} />
                  <Bar dataKey="value" name="Findings" radius={[4, 4, 0, 0]}>
                    {severityData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Panel>

        <Panel title="Most affected hosts">
          {loading ? (
            <ChartShimmer height={220} variant="bars" />
          ) : !topHosts.length ? (
            <EmptyState text="No host-scoped vulnerabilities yet." />
          ) : (
            <BarList items={topHosts} color={NEON.red} />
          )}
        </Panel>
      </Box>

      <Panel title="Findings by source">
        {loading ? (
          <ChartShimmer height={180} variant="bars" />
        ) : !topSources.length ? (
          <EmptyState text="No vulnerability sources connected yet." />
        ) : (
          <BarList items={topSources} color={NEON.cyan} />
        )}
      </Panel>
    </Box>
  );
};

export default VulnerabilitiesDashboard;
