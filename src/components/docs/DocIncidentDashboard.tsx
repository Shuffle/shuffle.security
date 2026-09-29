import React, { useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
} from '@mui/material';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { useNavigate } from '@/lib/router-compat';
import { useDatastore } from '@/hooks/useDatastore';
import { DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import {
  NEON,
  TooltipContent,
  buildBuckets,
  bucketIndexOf,
} from '@/Shuffle-Core/components/dashboard/_shared';
import { ChartShimmer } from '@/Shuffle-Core/components/dashboard/ChartShimmer';

interface DocIncidentDashboardProps {
  title?: string;
  subtitle?: string;
  days?: number;
}

const STATUS_COLORS: Record<string, string> = {
  New: NEON.cyan,
  'In Progress': NEON.orange,
  Resolved: NEON.green,
};

export const DocIncidentDashboard: React.FC<DocIncidentDashboardProps> = ({
  title = "Incident Activity & Queue",
  subtitle = "Live incident telemetry and queue activity directly from your active pipeline.",
  days = 30,
}) => {
  const navigate = useNavigate();
  const { items, isLoading, fetchItems, hasFetched } = useDatastore({
    category: DATASTORE_CATEGORIES.INCIDENTS,
  });

  useEffect(() => {
    if (!hasFetched) {
      fetchItems();
    }
  }, [hasFetched, fetchItems]);

  const parsedIncidents = useMemo(() => {
    const out: { status: string; severity: string; createdTs: number }[] = [];
    const sevMap: Record<number, string> = {
      1: 'informational',
      2: 'low',
      3: 'medium',
      4: 'high',
      5: 'critical',
      6: 'critical',
    };
    const statusMap: Record<number, string> = {
      1: 'new',
      2: 'in_progress',
      3: 'resolved',
      4: 'on_hold',
    };
    const STATUS_SYNONYMS: Record<string, string> = {
      open: 'new',
      created: 'new',
      pending: 'new',
      reported: 'new',
      inprogress: 'in_progress',
      active: 'in_progress',
      investigating: 'in_progress',
      working: 'in_progress',
      assigned: 'in_progress',
      acknowledged: 'in_progress',
      closed: 'resolved',
      done: 'resolved',
      complete: 'resolved',
      completed: 'resolved',
      fixed: 'resolved',
      remediated: 'resolved',
      mitigated: 'resolved',
    };

    const normalizeTs = (t: unknown): number => {
      if (!t) return 0;
      const n = typeof t === 'string' ? Number(t) : typeof t === 'number' ? t : 0;
      if (!n || isNaN(n) || n <= 0) {
        if (typeof t === 'string') {
          const d = new Date(t).getTime();
          return isNaN(d) ? 0 : d;
        }
        return 0;
      }
      if (n < 1e12) return n * 1000;
      if (n < 1e15) return n;
      if (n < 1e18) return n / 1000;
      return n / 1e6;
    };

    const seen = new Set<string>();
    for (const item of items) {
      try {
        if (!item?.value) continue;
        const data = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
        const customAttrs = data?.metadata?.extensions?.custom_attributes;
        const severityId = data?.severity_id;
        const severity = (data?.severity || sevMap[severityId] || 'medium').toString().toLowerCase();
        const rawStatus = (
          data?.status ||
          customAttrs?.status ||
          statusMap[data?.status_id] ||
          'new'
        )
          .toString()
          .toLowerCase()
          .trim()
          .replace(/[\s-]+/g, '_');
        const status =
          STATUS_SYNONYMS[rawStatus] || STATUS_SYNONYMS[rawStatus.replace(/_/g, '')] || rawStatus;
        const createdTs =
          normalizeTs(data?.created_time) || normalizeTs((item as { created?: number }).created);

        const dedupeKey = (item.key || '').includes('::')
          ? item.key.split('::').pop()!
          : item.key;
        if (dedupeKey && seen.has(dedupeKey)) continue;
        if (dedupeKey) seen.add(dedupeKey);

        out.push({ status, severity, createdTs });
      } catch {
        // Skip unparseable items
      }
    }
    return out;
  }, [items]);

  const stats = useMemo(() => {
    const open = parsedIncidents.filter(
      (i) => i.status !== 'resolved' && i.status !== 'closed'
    );
    const critical = parsedIncidents.filter(
      (i) =>
        (i.severity === 'critical' || i.severity === 'high') &&
        i.status !== 'resolved' &&
        i.status !== 'closed'
    );
    const resolved = parsedIncidents.filter(
      (i) => i.status === 'resolved' || i.status === 'closed'
    );

    const now = Date.now();
    const windowMs = days * 86400_000;
    const currentStart = now - windowMs;
    const previousStart = currentStart - windowMs;

    const currentCount = parsedIncidents.filter(
      (i) =>
        i.createdTs >= currentStart &&
        i.status !== 'resolved' &&
        i.status !== 'closed'
    ).length;
    const previousCount = parsedIncidents.filter(
      (i) =>
        i.createdTs >= previousStart &&
        i.createdTs < currentStart &&
        i.status !== 'resolved' &&
        i.status !== 'closed'
    ).length;

    let delta: { value: string; positive: boolean } | null = null;
    if (previousCount > 0) {
      const pct = Math.round(((currentCount - previousCount) / previousCount) * 100);
      if (pct !== 0) {
        delta = { value: `${pct > 0 ? '+' : ''}${pct}%`, positive: pct < 0 };
      }
    }

    return {
      openCount: open.length,
      criticalCount: critical.length,
      resolvedCount: resolved.length,
      delta,
    };
  }, [parsedIncidents, days]);

  const trendBuckets = useMemo(() => buildBuckets(days, 'daily'), [days]);

  const trendData = useMemo(() => {
    const rows = trendBuckets.map((b) => ({
      date: b.label,
      New: 0,
      'In Progress': 0,
      Resolved: 0,
    }));

    for (const inc of parsedIncidents) {
      if (!inc.createdTs) continue;
      const idx = bucketIndexOf(trendBuckets, inc.createdTs);
      if (idx < 0) continue;
      const s = (inc.status || '').toLowerCase().replace(/[_\s]+/g, '');
      if (s === 'resolved' || s === 'closed') {
        rows[idx].Resolved++;
      } else if (s === 'inprogress') {
        rows[idx]['In Progress']++;
      } else {
        rows[idx].New++;
      }
    }
    return rows;
  }, [parsedIncidents, trendBuckets]);

  const trendHasData = trendData.some((d) => d.New || d['In Progress'] || d.Resolved);

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2,
        border: '1px solid hsl(var(--border))',
        backgroundColor: 'transparent',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                fontSize: '0.82rem',
                color: 'hsl(var(--muted-foreground))',
                mt: 0.25,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => fetchItems()}
            disabled={isLoading}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.8rem',
              borderRadius: 1.5,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              '&:hover': {
                borderColor: 'hsl(var(--primary))',
                backgroundColor: 'hsl(var(--primary) / 0.05)',
              },
            }}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate('/incidents')}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderRadius: 1.5,
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              '&:hover': {
                opacity: 0.9,
              },
            }}
          >
            Open Incidents
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate('/dashboard')}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.8rem',
              borderRadius: 1.5,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              '&:hover': {
                borderColor: 'hsl(var(--primary))',
                backgroundColor: 'hsl(var(--primary) / 0.05)',
              },
            }}
          >
            Full Dashboard
          </Button>
        </Stack>
      </Box>

      {/* KPI Tiles */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1.5,
          mb: 2,
        }}
      >
        {/* Open Incidents */}
        <Box
          onClick={() => navigate('/incidents')}
          sx={{
            p: 2,
            borderRadius: 1.5,
            border: '1px solid hsl(var(--border))',
            backgroundColor: 'hsl(var(--card) / 0.5)',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, transform 0.15s ease',
            '&:hover': {
              borderColor: 'hsl(var(--primary))',
              transform: 'translateY(-1px)',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography
              sx={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Open Incidents
            </Typography>
            {stats.delta && (
              <Box
                sx={{
                  px: 0.75,
                  py: 0.1,
                  borderRadius: 1,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: stats.delta.positive ? NEON.green : NEON.red,
                  backgroundColor: stats.delta.positive ? `${NEON.green}1A` : `${NEON.red}1A`,
                }}
              >
                {stats.delta.value} vs prior period
              </Box>
            )}
          </Box>
          <Typography
            sx={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: 'hsl(var(--foreground))',
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.2,
            }}
          >
            {stats.openCount}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
            Active investigations awaiting resolution
          </Typography>
        </Box>

        {/* Critical & High */}
        <Box
          onClick={() => navigate('/incidents?severity=critical,high')}
          sx={{
            p: 2,
            borderRadius: 1.5,
            border: '1px solid hsl(var(--border))',
            backgroundColor: 'hsl(var(--card) / 0.5)',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, transform 0.15s ease',
            '&:hover': {
              borderColor: 'hsl(var(--primary))',
              transform: 'translateY(-1px)',
            },
          }}
        >
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              mb: 0.5,
            }}
          >
            Critical & High
          </Typography>
          <Typography
            sx={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: stats.criticalCount > 0 ? NEON.red : 'hsl(var(--foreground))',
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.2,
            }}
          >
            {stats.criticalCount}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
            High-priority security escalations
          </Typography>
        </Box>

        {/* Resolved */}
        <Box
          onClick={() => navigate('/incidents?status=resolved')}
          sx={{
            p: 2,
            borderRadius: 1.5,
            border: '1px solid hsl(var(--border))',
            backgroundColor: 'hsl(var(--card) / 0.5)',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, transform 0.15s ease',
            '&:hover': {
              borderColor: 'hsl(var(--primary))',
              transform: 'translateY(-1px)',
            },
          }}
        >
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              mb: 0.5,
            }}
          >
            Resolved Cases
          </Typography>
          <Typography
            sx={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: stats.resolvedCount > 0 ? NEON.green : 'hsl(var(--foreground))',
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.2,
            }}
          >
            {stats.resolvedCount}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
            Neutralized threats and closed cases
          </Typography>
        </Box>
      </Box>

      {/* Hero Chart Panel: Incident Activity */}
      <Box
        sx={{
          p: 2,
          borderRadius: 1.5,
          border: '1px solid hsl(var(--border))',
          backgroundColor: 'hsl(var(--card) / 0.3)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            mb: 1.5,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Incident Activity ({days} Days)
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {Object.entries(STATUS_COLORS).map(([label, color]) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: color,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    color: 'hsl(var(--muted-foreground))',
                    fontWeight: 500,
                  }}
                >
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ height: 220, position: 'relative' }}>
          {isLoading ? (
            <ChartShimmer height={220} variant="area" label="Loading incident activity" />
          ) : trendHasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trendData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  {Object.entries(STATUS_COLORS).map(([k, c]) => (
                    <linearGradient
                      key={k}
                      id={`doc-ov-grad-${k.replace(/\s/g, '')}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.35}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <RechartsTooltip
                  content={<TooltipContent />}
                  cursor={{ stroke: NEON.violet, strokeOpacity: 0.3, strokeWidth: 1 }}
                />
                {Object.entries(STATUS_COLORS).map(([k, c]) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={c}
                    strokeWidth={2}
                    fill={`url(#doc-ov-grad-${k.replace(/\s/g, '')})`}
                    fillOpacity={0.6}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.25,
                textAlign: 'center',
                p: 2,
              }}
            >
              <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                No incident activity recorded in the last {days} days
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => navigate('/incidents')}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderRadius: 1.5,
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  '&:hover': {
                    borderColor: 'hsl(var(--primary))',
                  },
                }}
              >
                Set up incident ingestion
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
