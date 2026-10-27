/**
 * AgentsDashboard — analytics surface for AI Agent runs.
 *
 * Data source: `/api/v1/workflows/search` (workflow_id = "AGENT") through
 * `searchAgentActivity`. Everything is derived client-side so this stays a
 * drop-in view inside CombinedDashboard, sharing the same date range /
 * granularity controls as the other dashboards.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import { Bot, CheckCircle2, AlertTriangle, Timer } from 'lucide-react';
import { searchAgentActivity, type AgentRun } from '@shuffleio/shuffle-mcps';
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
import { useSyncHostBaseUrl } from '../../useSyncHostBaseUrl';
import type { ShuffleCoreHostProps } from '../../types/host-props';

export interface AgentsDashboardProps extends ShuffleCoreHostProps {
  days?: number;
  gran?: Granularity;
  customRange?: { fromMs: number; toMs: number } | null;
  onRangeSelect?: (fromMs: number, toMs: number) => void;
  refreshKey?: number;
  orgId?: string;
}

const toMs = (t: unknown): number => {
  if (!t) return 0;
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const asNum = Number(t);
  if (!Number.isNaN(asNum) && asNum > 0) return asNum < 1e12 ? asNum * 1000 : asNum;
  const parsed = new Date(String(t)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normStatus = (s?: string): 'finished' | 'failed' | 'waiting' | 'executing' | 'aborted' => {
  const v = (s || '').toLowerCase();
  if (v === 'finished' || v === 'success') return 'finished';
  if (v === 'aborted') return 'aborted';
  if (v === 'failure' || v === 'failed') return 'failed';
  if (v === 'waiting') return 'waiting';
  return 'executing';
};

const STATUS_COLOR: Record<string, string> = {
  finished: NEON.green,
  failed: NEON.red,
  aborted: NEON.amber,
  waiting: NEON.violet,
  executing: NEON.cyan,
};

const fmtDuration = (sec: number): string => {
  if (!sec || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
};

export const AgentsDashboard = ({
  days = 30,
  gran = 'daily',
  customRange,
  onRangeSelect,
  refreshKey = 0,
  orgId,
  globalUrl,
}: AgentsDashboardProps) => {
  useSyncHostBaseUrl(globalUrl);

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await searchAgentActivity({ limit: 100, orgId });
        if (!cancelled) setRuns(Array.isArray(res.runs) ? res.runs : []);
      } catch {
        if (!cancelled) setRuns([]);
      } finally {
        if (!cancelled) setLoading(false);
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

  const fromMs = buckets.length ? buckets[0].startMs : 0;
  const toMsRange = buckets.length ? buckets[buckets.length - 1].endMs : Date.now();

  const scoped = useMemo(
    () => runs.filter((r) => {
      const ts = toMs(r.started_at);
      return ts >= fromMs && ts < toMsRange;
    }),
    [runs, fromMs, toMsRange],
  );

  const stats = useMemo(() => {
    let finished = 0, failed = 0, pending = 0, durSum = 0, durCount = 0, decisions = 0, approvals = 0;
    for (const r of scoped) {
      const st = normStatus(r.status);
      if (st === 'finished') finished++;
      else if (st === 'failed' || st === 'aborted') failed++;
      else pending++;

      const start = toMs(r.started_at);
      const end = toMs(r.completed_at);
      const dur = typeof r.duration === 'number' && r.duration > 0
        ? r.duration
        : (start && end && end > start ? (end - start) / 1000 : 0);
      if (dur > 0) { durSum += dur; durCount++; }

      const list = Array.isArray(r.decisions) ? r.decisions : [];
      decisions += list.length;
      approvals += list.filter((d) => d?.approval_required === true).length;
    }
    return {
      total: scoped.length,
      finished,
      failed,
      pending,
      decisions,
      approvals,
      avgDuration: durCount ? durSum / durCount : 0,
      successRate: scoped.length ? Math.round((finished / scoped.length) * 100) : 0,
    };
  }, [scoped]);

  const trend = useMemo(() => {
    const rows = buckets.map((b) => ({ label: b.label, finished: 0, failed: 0, pending: 0 }));
    for (const r of scoped) {
      const idx = bucketIndexOf(buckets, toMs(r.started_at));
      if (idx < 0) continue;
      const st = normStatus(r.status);
      if (st === 'finished') rows[idx].finished++;
      else if (st === 'failed' || st === 'aborted') rows[idx].failed++;
      else rows[idx].pending++;
    }
    return rows;
  }, [buckets, scoped]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of scoped) {
      const st = normStatus(r.status);
      counts[st] = (counts[st] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, fill: STATUS_COLOR[name] || NEON.cyan }))
      .sort((a, b) => b.value - a.value);
  }, [scoped]);

  const topTools = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of scoped) {
      const results = Array.isArray(r?.results) ? r.results : [];
      for (const res of results) {
        const name = res?.action?.app_name;
        if (typeof name !== 'string' || !name) continue;
        const clean = name.replace(/_/g, ' ');
        counts[clean] = (counts[clean] || 0) + 1;
      }
      const decisions = Array.isArray(r?.decisions) ? r.decisions : [];
      for (const d of decisions) {
        const tool = typeof d?.tool === 'string' ? d.tool : '';
        if (tool) counts[tool.replace(/_/g, ' ')] = (counts[tool.replace(/_/g, ' ')] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [scoped]);

  const drag = useChartRangeDrag(buckets, onRangeSelect);
  const runSeries = useSeriesVisibility('agent-runs-over-time');
  const hasData = scoped.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <KpiTile
          icon={Bot}
          glow={NEON.violet}
          value={stats.total}
          label="Agent runs"
          isLoading={loading}
          spark={trend.map((t) => t.finished + t.failed + t.pending)}
        />
        <KpiTile
          icon={CheckCircle2}
          glow={NEON.green}
          value={`${stats.successRate}%`}
          label="Success rate"
          isLoading={loading}
          delay={0.05}
        />
        <KpiTile
          icon={AlertTriangle}
          glow={NEON.red}
          value={stats.failed}
          label="Failed runs"
          isLoading={loading}
          delay={0.1}
        />
        <KpiTile
          icon={Timer}
          glow={NEON.cyan}
          value={fmtDuration(stats.avgDuration)}
          label="Average runtime"
          isLoading={loading}
          delay={0.15}
        />
      </Box>

      <Panel
        title="Agent runs over time"
        action={
          <SeriesLegend
            items={[
              { key: 'finished', label: 'Finished', color: NEON.green },
              { key: 'pending', label: 'In progress', color: NEON.cyan },
              { key: 'failed', label: 'Failed', color: NEON.red },
            ]}
            isHidden={runSeries.isHidden}
            onToggle={runSeries.toggle}
          />
        }
      >
        {loading ? (
          <ChartShimmer height={260} variant="bars" />
        ) : !hasData ? (
          <EmptyState text="No agent runs in this period." />
        ) : (
          <Box sx={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} {...drag.chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <RechartsTooltip content={<TooltipContent />} cursor={{ fill: 'hsl(var(--muted) / 0.25)' }} />
                <Bar dataKey="finished" hide={runSeries.isHidden('finished')} name="Finished" stackId="a" fill={NEON.green} radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" hide={runSeries.isHidden('pending')} name="In progress" stackId="a" fill={NEON.cyan} />
                <Bar dataKey="failed" hide={runSeries.isHidden('failed')} name="Failed" stackId="a" fill={NEON.red} radius={[4, 4, 0, 0]} />
                {drag.refArea && (
                  <ReferenceArea x1={drag.refArea.x1} x2={drag.refArea.x2} strokeOpacity={0.3} fill="hsl(var(--primary) / 0.15)" />
                )}
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Panel>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Panel title="Run outcomes">
          {loading ? (
            <ChartShimmer height={220} variant="bars" />
          ) : !statusBreakdown.length ? (
            <EmptyState text="No agent outcomes yet." />
          ) : (
            <Box sx={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusBreakdown} layout="vertical" margin={{ top: 4, right: 16, left: 24, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <RechartsTooltip content={<TooltipContent />} cursor={{ fill: 'hsl(var(--muted) / 0.25)' }} />
                  <Bar dataKey="value" name="Runs" radius={[0, 4, 4, 0]}>
                    {statusBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Panel>

        <Panel title="Most used tools">
          {loading ? (
            <ChartShimmer height={220} variant="bars" />
          ) : !topTools.length ? (
            <EmptyState text="No tools have been used by the agent yet." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5 }}>
              {topTools.map((t) => {
                const max = topTools[0].value || 1;
                return (
                  <Box key={t.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--foreground))', width: 150, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </Typography>
                    <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'hsl(var(--muted) / 0.35)', overflow: 'hidden' }}>
                      <Box sx={{ width: `${Math.max(6, (t.value / max) * 100)}%`, height: '100%', bgcolor: NEON.violet }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', width: 32, textAlign: 'right', fontFamily: 'monospace' }}>
                      {t.value}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </Panel>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        <KpiTile icon={Bot} glow={NEON.magenta} value={stats.decisions} label="Decisions made" isLoading={loading} />
        <KpiTile icon={AlertTriangle} glow={NEON.amber} value={stats.approvals} label="Approvals requested" isLoading={loading} delay={0.05} />
        <KpiTile icon={Timer} glow={NEON.orange} value={stats.pending} label="Runs in progress" isLoading={loading} delay={0.1} />
      </Box>
    </Box>
  );
};

export default AgentsDashboard;
